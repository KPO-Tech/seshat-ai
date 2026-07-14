package agentregistry

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

func TestCreateAgentPresetRequiresManagePermission(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	if _, err := env.svc.CreatePreset(context.Background(), member, CreatePresetParams{
		OrganizationID: env.orgID, Slug: "researcher", Name: "Researcher", SystemPrompt: "You are a researcher.",
	}); err == nil {
		t.Fatal("expected a member without agents_registry.manage to be denied creating a preset")
	}

	preset, err := env.svc.CreatePreset(context.Background(), env.adminPrincipal, CreatePresetParams{
		OrganizationID: env.orgID, Slug: "researcher", Name: "Researcher", SystemPrompt: "You are a researcher.",
	})
	if err != nil {
		t.Fatalf("create as admin: %v", err)
	}
	if preset.Slug != "researcher" || preset.MaxTurns != 50 || preset.Icon != "🤖" {
		t.Fatalf("unexpected preset: %+v", preset)
	}
}

func TestCreateAgentPresetRejectsInvalidSlug(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.svc.CreatePreset(context.Background(), env.adminPrincipal, CreatePresetParams{
		OrganizationID: env.orgID, Slug: "Not Valid!", Name: "x",
	}); err == nil {
		t.Fatal("expected an invalid slug to be rejected")
	}
}

func TestListAgentPresetsOpenToAnyMember(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	if _, err := env.svc.CreatePreset(context.Background(), env.adminPrincipal, CreatePresetParams{
		OrganizationID: env.orgID, Slug: "researcher", Name: "Researcher", SystemPrompt: "You are a researcher.",
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	// Unlike a credential, a system prompt is not secret — a plain member
	// (no agents_registry.manage) can still list, same as skill repos.
	presets, err := env.svc.ListPresets(context.Background(), member, env.orgID)
	if err != nil {
		t.Fatalf("expected a member to list presets, got: %v", err)
	}
	if len(presets) != 1 || presets[0].Slug != "researcher" {
		t.Fatalf("unexpected presets: %+v", presets)
	}
}

func TestListAgentPresetsRejectsNonMember(t *testing.T) {
	env := newTestEnv(t)
	outsider := env.addOutsider(t)

	if _, err := env.svc.CreatePreset(context.Background(), env.adminPrincipal, CreatePresetParams{
		OrganizationID: env.orgID, Slug: "researcher", Name: "Researcher",
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	if _, err := env.svc.ListPresets(context.Background(), outsider, env.orgID); err == nil {
		t.Fatal("expected a non-member of the organization to be rejected")
	}
}

func TestCreateAgentPresetRejectsDuplicateSlugInOrg(t *testing.T) {
	env := newTestEnv(t)
	params := CreatePresetParams{OrganizationID: env.orgID, Slug: "researcher", Name: "Researcher"}
	if _, err := env.svc.CreatePreset(context.Background(), env.adminPrincipal, params); err != nil {
		t.Fatalf("first create: %v", err)
	}
	if _, err := env.svc.CreatePreset(context.Background(), env.adminPrincipal, params); err == nil {
		t.Fatal("expected a second preset with the same slug in the same org to be rejected")
	}
}

func TestCreateAgentPresetAllowsSameSlugInDifferentOrg(t *testing.T) {
	env := newTestEnv(t)
	otherOrg, err := env.iam.CreateOrganization(context.Background(), env.adminPrincipal, iam.CreateOrganizationParams{
		Name: "Other Org", Slug: "other-org",
	})
	if err != nil {
		t.Fatalf("create other org: %v", err)
	}

	if _, err := env.svc.CreatePreset(context.Background(), env.adminPrincipal, CreatePresetParams{
		OrganizationID: env.orgID, Slug: "researcher", Name: "Researcher",
	}); err != nil {
		t.Fatalf("create in first org: %v", err)
	}
	if _, err := env.svc.CreatePreset(context.Background(), env.adminPrincipal, CreatePresetParams{
		OrganizationID: otherOrg.ID, Slug: "researcher", Name: "Researcher",
	}); err != nil {
		t.Fatalf("expected the same slug to be allowed in a different org: %v", err)
	}
}

func TestUpdateAndDeleteAgentPresetRequireManagePermission(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	preset, err := env.svc.CreatePreset(context.Background(), env.adminPrincipal, CreatePresetParams{
		OrganizationID: env.orgID, Slug: "researcher", Name: "Researcher", SystemPrompt: "original",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	newPrompt := "hacked"
	if _, err := env.svc.UpdatePreset(context.Background(), member, preset.ID, UpdatePresetParams{SystemPrompt: &newPrompt}); err == nil {
		t.Fatal("expected a member to be denied updating a preset")
	}
	if err := env.svc.DeletePreset(context.Background(), member, preset.ID); err == nil {
		t.Fatal("expected a member to be denied deleting a preset")
	}

	officialPrompt := "You are the official org researcher."
	updated, err := env.svc.UpdatePreset(context.Background(), env.adminPrincipal, preset.ID, UpdatePresetParams{SystemPrompt: &officialPrompt})
	if err != nil {
		t.Fatalf("update as admin: %v", err)
	}
	if updated.SystemPrompt != officialPrompt {
		t.Fatalf("unexpected updated preset: %+v", updated)
	}

	if err := env.svc.DeletePreset(context.Background(), env.adminPrincipal, preset.ID); err != nil {
		t.Fatalf("delete as admin: %v", err)
	}
	presets, err := env.svc.ListPresets(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list after delete: %v", err)
	}
	if len(presets) != 0 {
		t.Fatalf("expected no presets after delete, got %+v", presets)
	}
}

func TestAgentPresetRoundTripsToolsAndMcpServers(t *testing.T) {
	env := newTestEnv(t)
	preset, err := env.svc.CreatePreset(context.Background(), env.adminPrincipal, CreatePresetParams{
		OrganizationID: env.orgID, Slug: "researcher", Name: "Researcher",
		Tools: []string{"web_search", "rag_search"}, McpServers: []string{"github"},
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if len(preset.Tools) != 2 || preset.Tools[0] != "web_search" || len(preset.McpServers) != 1 {
		t.Fatalf("unexpected preset: %+v", preset)
	}

	presets, err := env.svc.ListPresets(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(presets) != 1 || len(presets[0].Tools) != 2 {
		t.Fatalf("unexpected round-tripped preset: %+v", presets)
	}
}
