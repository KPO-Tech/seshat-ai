package hookregistry

import (
	"context"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
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

func TestCreateHookConfigRequiresManagePermission(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	if _, err := env.svc.CreateHookConfig(context.Background(), member, CreateHookConfigParams{
		OrganizationID: env.orgID, Name: "block-rm", Command: "echo test",
	}); err == nil {
		t.Fatal("expected a plain member without hooks_registry.manage to be rejected")
	}
	if _, err := env.svc.CreateHookConfig(context.Background(), env.adminPrincipal, CreateHookConfigParams{
		OrganizationID: env.orgID, Name: "block-rm", Command: "echo test",
	}); err != nil {
		t.Fatalf("expected the org owner to be allowed: %v", err)
	}
}

func TestCreateHookConfigDefaultsAndValidation(t *testing.T) {
	env := newTestEnv(t)

	created, err := env.svc.CreateHookConfig(context.Background(), env.adminPrincipal, CreateHookConfigParams{
		OrganizationID: env.orgID, Name: "block-rm", Command: "echo test",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if created.TimeoutSecs != 30 {
		t.Fatalf("expected default timeout 30, got %d", created.TimeoutSecs)
	}
	if !created.Enabled {
		t.Fatal("expected a new hook to default to enabled")
	}

	if _, err := env.svc.CreateHookConfig(context.Background(), env.adminPrincipal, CreateHookConfigParams{
		OrganizationID: env.orgID, Name: "", Command: "echo test",
	}); err == nil {
		t.Fatal("expected empty name to be rejected")
	}
	if _, err := env.svc.CreateHookConfig(context.Background(), env.adminPrincipal, CreateHookConfigParams{
		OrganizationID: env.orgID, Name: "no-command",
	}); err == nil {
		t.Fatal("expected empty command to be rejected")
	}
}

func TestCreateHookConfigRejectsDuplicateNameInOrg(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.svc.CreateHookConfig(context.Background(), env.adminPrincipal, CreateHookConfigParams{
		OrganizationID: env.orgID, Name: "block-rm", Command: "echo test",
	}); err != nil {
		t.Fatalf("create first: %v", err)
	}
	if _, err := env.svc.CreateHookConfig(context.Background(), env.adminPrincipal, CreateHookConfigParams{
		OrganizationID: env.orgID, Name: "block-rm", Command: "echo other",
	}); err == nil {
		t.Fatal("expected a duplicate name in the same org to be rejected")
	}
}

func TestUpdateAndDeleteHookConfig(t *testing.T) {
	env := newTestEnv(t)
	created, err := env.svc.CreateHookConfig(context.Background(), env.adminPrincipal, CreateHookConfigParams{
		OrganizationID: env.orgID, Name: "block-rm", Matcher: "bash", Command: "echo test",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	disabled := false
	updated, err := env.svc.UpdateHookConfig(context.Background(), env.adminPrincipal, created.ID, UpdateHookConfigParams{
		Matcher: "bash|shell", Command: "echo updated", Enabled: &disabled,
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Command != "echo updated" || updated.Matcher != "bash|shell" || updated.Enabled {
		t.Fatalf("unexpected updated hook: %+v", updated)
	}

	if err := env.svc.DeleteHookConfig(context.Background(), env.adminPrincipal, created.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	list, err := env.svc.ListHookConfigs(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("expected an empty list after delete, got %+v", list)
	}
}

func TestResolveHookConfigsOnlyReturnsEnabled(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	if _, err := env.svc.CreateHookConfig(context.Background(), env.adminPrincipal, CreateHookConfigParams{
		OrganizationID: env.orgID, Name: "enabled-hook", Command: "echo test",
	}); err != nil {
		t.Fatalf("create enabled: %v", err)
	}
	disabled := false
	if _, err := env.svc.CreateHookConfig(context.Background(), env.adminPrincipal, CreateHookConfigParams{
		OrganizationID: env.orgID, Name: "disabled-hook", Command: "echo test", Enabled: &disabled,
	}); err != nil {
		t.Fatalf("create disabled: %v", err)
	}

	resolved, err := env.svc.ResolveHookConfigs(context.Background(), member, env.orgID)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(resolved) != 1 || resolved[0].Name != "enabled-hook" {
		t.Fatalf("expected only the enabled hook to resolve, got %+v", resolved)
	}
}

func TestResolveHookConfigsRequiresMembership(t *testing.T) {
	env := newTestEnv(t)
	otherOrg, err := env.iam.CreateOrganization(context.Background(), env.adminPrincipal, iam.CreateOrganizationParams{
		Name: "Other Org", Slug: "other-org",
	})
	if err != nil {
		t.Fatalf("create other org: %v", err)
	}
	outsider, err := env.iam.CreateUser(context.Background(), env.adminPrincipal, iam.CreateUserParams{
		Email: "outsider@example.com", Password: "password123", DisplayName: "Outsider",
		OrganizationID: otherOrg.ID, Role: "member",
	})
	if err != nil {
		t.Fatalf("create outsider: %v", err)
	}
	login, err := env.iam.Login(context.Background(), outsider.Email, "password123")
	if err != nil {
		t.Fatalf("login outsider: %v", err)
	}
	outsiderPrincipal, err := env.iam.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve outsider principal: %v", err)
	}

	if _, err := env.svc.ResolveHookConfigs(context.Background(), outsiderPrincipal, env.orgID); err == nil {
		t.Fatal("expected a non-member to be rejected")
	}
}
