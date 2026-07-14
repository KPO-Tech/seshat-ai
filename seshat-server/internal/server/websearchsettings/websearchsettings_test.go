package websearchsettings

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

func TestCreateProviderSettingRequiresManagePermission(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	if _, err := env.svc.CreateProviderSetting(context.Background(), member, CreateProviderSettingParams{
		OrganizationID: env.orgID, Provider: "tavily", APIKey: "sk-tavily-x",
	}); err == nil {
		t.Fatal("expected a member without web_search_settings.manage to be denied creating one")
	}

	setting, err := env.svc.CreateProviderSetting(context.Background(), env.adminPrincipal, CreateProviderSettingParams{
		OrganizationID: env.orgID, Provider: "tavily", APIKey: "sk-tavily-x",
	})
	if err != nil {
		t.Fatalf("create as admin: %v", err)
	}
	if setting.Provider != "tavily" {
		t.Fatalf("unexpected setting: %+v", setting)
	}
}

func TestSearXNGAuthUsernameRoundTrips(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	setting, err := env.svc.CreateProviderSetting(context.Background(), env.adminPrincipal, CreateProviderSettingParams{
		OrganizationID: env.orgID, Provider: "searxng", BaseURL: "https://searx.example.com",
		AuthUsername: "searx-user", APIKey: "searx-password",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if setting.AuthUsername != "searx-user" {
		t.Fatalf("expected auth_username to round-trip, got %+v", setting)
	}

	resolved, err := env.svc.ResolveProviderSetting(context.Background(), env.adminPrincipal, env.orgID, "searxng")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if resolved.AuthUsername != "searx-user" || resolved.APIKey != "searx-password" {
		t.Fatalf("unexpected resolved setting: %+v", resolved)
	}
}

func TestResolveProviderSettingMemberWithoutManagePermissionSucceeds(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	if _, err := env.svc.CreateProviderSetting(context.Background(), env.adminPrincipal, CreateProviderSettingParams{
		OrganizationID: env.orgID, Provider: "tavily", APIKey: "sk-tavily-org",
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	resolved, err := env.svc.ResolveProviderSetting(context.Background(), member, env.orgID, "tavily")
	if err != nil {
		t.Fatalf("expected a member to resolve their org's web search provider, got: %v", err)
	}
	if resolved.APIKey != "sk-tavily-org" || resolved.Source != "organization" {
		t.Fatalf("unexpected resolved setting: %+v", resolved)
	}
}

func TestResolveProviderSettingFallsBackToPlatformDefault(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	if _, err := env.svc.CreatePlatformProviderSetting(context.Background(), env.adminPrincipal, CreatePlatformProviderSettingParams{
		Provider: "tavily", APIKey: "sk-tavily-platform",
	}); err != nil {
		t.Fatalf("create platform setting: %v", err)
	}

	resolved, err := env.svc.ResolveProviderSetting(context.Background(), member, env.orgID, "tavily")
	if err != nil {
		t.Fatalf("expected fallback to platform default: %v", err)
	}
	if resolved.APIKey != "sk-tavily-platform" || resolved.Source != "platform" {
		t.Fatalf("unexpected resolved setting: %+v", resolved)
	}
}

func TestResolveProviderSettingRejectsNonMember(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	outsider := env.addOutsider(t)

	if _, err := env.svc.CreateProviderSetting(context.Background(), env.adminPrincipal, CreateProviderSettingParams{
		OrganizationID: env.orgID, Provider: "tavily", APIKey: "sk-tavily-x",
	}); err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := env.svc.ResolveProviderSetting(context.Background(), outsider, env.orgID, "tavily"); err == nil {
		t.Fatal("expected a non-member of the organization to be rejected")
	}
}

func TestOrgPolicyReadOpenToMemberWriteGated(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	// Default (never set) is an empty policy, not an error.
	policy, err := env.svc.GetOrgPolicy(context.Background(), member, env.orgID)
	if err != nil {
		t.Fatalf("get default policy: %v", err)
	}
	if len(policy.AllowedDomains) != 0 || len(policy.BlockedDomains) != 0 {
		t.Fatalf("expected empty default policy, got %+v", policy)
	}

	if _, err := env.svc.UpsertOrgPolicy(context.Background(), member, UpsertOrgPolicyParams{
		OrganizationID: env.orgID, BlockedDomains: []string{"competitor.example.com"},
	}); err == nil {
		t.Fatal("expected a member without web_search_settings.manage to be denied writing the policy")
	}

	updated, err := env.svc.UpsertOrgPolicy(context.Background(), env.adminPrincipal, UpsertOrgPolicyParams{
		OrganizationID: env.orgID, BlockedDomains: []string{"competitor.example.com"},
	})
	if err != nil {
		t.Fatalf("upsert as admin: %v", err)
	}
	if len(updated.BlockedDomains) != 1 || updated.BlockedDomains[0] != "competitor.example.com" {
		t.Fatalf("unexpected updated policy: %+v", updated)
	}

	// A member (read-only) sees the org's policy.
	seen, err := env.svc.GetOrgPolicy(context.Background(), member, env.orgID)
	if err != nil {
		t.Fatalf("get policy as member: %v", err)
	}
	if len(seen.BlockedDomains) != 1 || seen.BlockedDomains[0] != "competitor.example.com" {
		t.Fatalf("expected member to see the org policy, got %+v", seen)
	}
}
