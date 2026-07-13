package mcpregistry

import (
	"context"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

const (
	testEncryptionEnvVar = "SESHAT_SERVER_ENCRYPTION_KEY"
	testEncryptionKey    = "g/t9EsDxTTJSTu6Q+Kne06PBHoGmhH3yAJaEuHmFl9A="
)

type testEnv struct {
	svc            *Service
	iam            *iam.Service
	adminPrincipal *iam.Principal
	orgID          string
}

func newTestEnv(t *testing.T) testEnv {
	t.Helper()
	database, err := sdb.Open(sdb.Config{Driver: sdb.DriverSQLite, DSN: ":memory:"})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	iamService := iam.New(database, time.Hour)
	boot, err := iamService.Bootstrap(context.Background(), iam.BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	principal, err := iamService.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve admin principal: %v", err)
	}

	return testEnv{
		svc: New(database, iamService), iam: iamService,
		adminPrincipal: principal, orgID: boot.Organizations[0].ID,
	}
}

func (env testEnv) addMember(t *testing.T, role string) *iam.Principal {
	t.Helper()
	email := role + "@example.com"
	user, err := env.iam.CreateUser(context.Background(), env.adminPrincipal, iam.CreateUserParams{
		Email: email, Password: "password123", DisplayName: role,
		OrganizationID: env.orgID, Role: role,
	})
	if err != nil {
		t.Fatalf("create %s user: %v", role, err)
	}
	login, err := env.iam.Login(context.Background(), user.Email, "password123")
	if err != nil {
		t.Fatalf("login %s: %v", role, err)
	}
	principal, err := env.iam.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve %s principal: %v", role, err)
	}
	return principal
}

func (env testEnv) addOutsider(t *testing.T) *iam.Principal {
	t.Helper()
	otherOrg, err := env.iam.CreateOrganization(context.Background(), env.adminPrincipal, iam.CreateOrganizationParams{
		Name: "Other Org", Slug: "other-org",
	})
	if err != nil {
		t.Fatalf("create other org: %v", err)
	}
	user, err := env.iam.CreateUser(context.Background(), env.adminPrincipal, iam.CreateUserParams{
		Email: "outsider@example.com", Password: "password123", DisplayName: "Outsider",
		OrganizationID: otherOrg.ID, Role: "member",
	})
	if err != nil {
		t.Fatalf("create outsider user: %v", err)
	}
	login, err := env.iam.Login(context.Background(), user.Email, "password123")
	if err != nil {
		t.Fatalf("login outsider: %v", err)
	}
	principal, err := env.iam.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve outsider principal: %v", err)
	}
	return principal
}

func TestListServerConfigsDegradesToEmptyForMemberWithoutPermission(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	if _, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "internal-jira", ServerType: "stdio",
		Command: "npx", Args: []string{"-y", "mcp-server-jira"},
		Env: map[string]string{"JIRA_TOKEN": "secret-token"},
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	list, err := env.svc.ListServerConfigs(context.Background(), member, env.orgID)
	if err != nil {
		t.Fatalf("list as member: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("expected a member without mcp_registry.manage to see an empty list, got %+v", list)
	}

	list, err = env.svc.ListServerConfigs(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list as admin: %v", err)
	}
	if len(list) != 1 || list[0].Name != "internal-jira" {
		t.Fatalf("unexpected admin list: %+v", list)
	}
}

func TestCreateUpdateDeleteRequireManagePermission(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	if _, err := env.svc.CreateServerConfig(context.Background(), member, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "denied", ServerType: "stdio", Command: "echo",
	}); err == nil {
		t.Fatal("expected a member without mcp_registry.manage to be denied creating a config")
	}

	config, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "allowed", ServerType: "http", URL: "https://mcp.example.com",
		Headers: map[string]string{"Authorization": "Bearer xyz"},
	})
	if err != nil {
		t.Fatalf("create as admin: %v", err)
	}

	if _, err := env.svc.UpdateServerConfig(context.Background(), member, config.ID, UpdateServerConfigParams{DisplayName: "x"}); err == nil {
		t.Fatal("expected a member without mcp_registry.manage to be denied updating")
	}
	if err := env.svc.DeleteServerConfig(context.Background(), member, config.ID); err == nil {
		t.Fatal("expected a member without mcp_registry.manage to be denied deleting")
	}

	updated, err := env.svc.UpdateServerConfig(context.Background(), env.adminPrincipal, config.ID, UpdateServerConfigParams{
		DisplayName: "Allowed Server", ServerType: "http", URL: "https://mcp.example.com/v2",
	})
	if err != nil {
		t.Fatalf("update as admin: %v", err)
	}
	if updated.DisplayName != "Allowed Server" || updated.URL != "https://mcp.example.com/v2" {
		t.Fatalf("unexpected updated config: %+v", updated)
	}

	if err := env.svc.DeleteServerConfig(context.Background(), env.adminPrincipal, config.ID); err != nil {
		t.Fatalf("delete as admin: %v", err)
	}
}

func TestResolveServerConfigsMemberOpenNonMemberRejected(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	member := env.addMember(t, "member")
	outsider := env.addOutsider(t)

	if _, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "internal-jira", ServerType: "stdio",
		Command: "npx", Args: []string{"-y", "mcp-server-jira"},
		Env: map[string]string{"JIRA_TOKEN": "secret-token"},
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	resolved, err := env.svc.ResolveServerConfigs(context.Background(), member, env.orgID)
	if err != nil {
		t.Fatalf("expected a member to resolve the org's mcp server configs, got: %v", err)
	}
	if len(resolved) != 1 || resolved[0].Name != "internal-jira" {
		t.Fatalf("unexpected resolved configs: %+v", resolved)
	}
	if resolved[0].Env["JIRA_TOKEN"] != "secret-token" {
		t.Fatalf("expected decrypted env to round-trip, got: %+v", resolved[0].Env)
	}
	if resolved[0].Command != "npx" || len(resolved[0].Args) != 2 {
		t.Fatalf("unexpected resolved command/args: %+v", resolved[0])
	}

	if _, err := env.svc.ResolveServerConfigs(context.Background(), outsider, env.orgID); err == nil {
		t.Fatal("expected a non-member of the organization to be rejected")
	}
}

func TestCreateServerConfigRejectsDuplicateName(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	if _, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "dup", ServerType: "stdio", Command: "echo",
	}); err != nil {
		t.Fatalf("first create: %v", err)
	}
	if _, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "dup", ServerType: "stdio", Command: "echo",
	}); err == nil {
		t.Fatal("expected a second config with the same name in the same org to be rejected")
	}
}

func TestHeadersEncryptionRoundTrip(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	config, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "http-server", ServerType: "http", URL: "https://mcp.example.com",
		Headers: map[string]string{"Authorization": "Bearer initial"},
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	resolved, err := env.svc.ResolveServerConfigs(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil || len(resolved) != 1 {
		t.Fatalf("resolve: %v %+v", err, resolved)
	}
	if resolved[0].Headers["Authorization"] != "Bearer initial" {
		t.Fatalf("expected initial header to round-trip, got %+v", resolved[0].Headers)
	}

	if _, err := env.svc.UpdateServerConfig(context.Background(), env.adminPrincipal, config.ID, UpdateServerConfigParams{
		ServerType: "http", URL: "https://mcp.example.com", Headers: map[string]string{"Authorization": "Bearer updated"},
	}); err != nil {
		t.Fatalf("update: %v", err)
	}
	resolved, err = env.svc.ResolveServerConfigs(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil || len(resolved) != 1 {
		t.Fatalf("resolve after update: %v %+v", err, resolved)
	}
	if resolved[0].Headers["Authorization"] != "Bearer updated" {
		t.Fatalf("expected updated header to round-trip, got %+v", resolved[0].Headers)
	}
}
