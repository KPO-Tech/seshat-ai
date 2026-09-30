package bundles

import (
	"context"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/hookregistry"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func TestImportRejectsInvalidManifest(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.svc.Import(context.Background(), env.adminPrincipal, ImportParams{
		OrganizationID: env.orgID, Manifest: Manifest{Name: "Empty"},
	})
	if err == nil {
		t.Fatal("expected an error for a manifest with no items")
	}
}

func TestImportCreatesEveryItemAndTagsThem(t *testing.T) {
	env := newTestEnv(t)
	manifest := Manifest{
		Name: "Jira Integration",
		Hooks: []ManifestHook{
			{Name: "block-rm", Matcher: "bash", Command: "exit 0"},
		},
		Skills: []ManifestSkillRepo{
			{Name: "jira-helpers", URL: "https://github.com/example/jira-helpers"},
		},
		AgentPresets: []ManifestAgentPreset{
			{Slug: "jira-triage", Name: "Jira Triage", SystemPrompt: "You triage Jira tickets."},
		},
	}

	result, err := env.svc.Import(context.Background(), env.adminPrincipal, ImportParams{
		OrganizationID: env.orgID, Manifest: manifest,
	})
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if result.BundleImportID == "" {
		t.Fatal("expected a non-empty bundle import id")
	}
	if len(result.Created) != 3 || len(result.Failed) != 0 {
		t.Fatalf("expected 3 created items and 0 failures, got %+v", result)
	}

	// The hook must really exist, resolvable through the normal registry.
	hooks, err := env.hooks.ListHookConfigs(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list hooks: %v", err)
	}
	if len(hooks) != 1 || hooks[0].Name != "block-rm" {
		t.Fatalf("expected the imported hook to exist, got %+v", hooks)
	}

	// And it must be tagged to this bundle import.
	var items []struct {
		ResourceType string
		ResourceID   string
	}
	if err := env.svc.db.Gorm().Table("bundle_import_items").
		Where("bundle_import_id = ?", result.BundleImportID).Find(&items).Error; err != nil {
		t.Fatalf("query bundle import items: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("expected 3 tagged items, got %+v", items)
	}
}

func TestImportRequiresPermissionForEveryCategoryPresent(t *testing.T) {
	env := newTestEnv(t)
	member, err := env.iam.CreateUser(context.Background(), env.adminPrincipal, iam.CreateUserParams{
		Email: "member@example.com", Password: "password123", DisplayName: "Member",
		OrganizationID: env.orgID, Role: "member",
	})
	if err != nil {
		t.Fatalf("create member: %v", err)
	}
	login, err := env.iam.Login(context.Background(), member.Email, "password123")
	if err != nil {
		t.Fatalf("login member: %v", err)
	}
	memberPrincipal, err := env.iam.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve member principal: %v", err)
	}

	manifest := Manifest{
		Name:  "Test",
		Hooks: []ManifestHook{{Name: "x", Command: "exit 0"}},
	}
	if _, err := env.svc.Import(context.Background(), memberPrincipal, ImportParams{
		OrganizationID: env.orgID, Manifest: manifest,
	}); err == nil {
		t.Fatal("expected a plain member without hooks_registry.manage to be rejected before anything is created")
	}

	hooks, err := env.hooks.ListHookConfigs(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list hooks: %v", err)
	}
	if len(hooks) != 0 {
		t.Fatalf("expected nothing to have been created after a rejected preflight, got %+v", hooks)
	}
}

func TestImportReportsPartialFailureExplicitly(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.hooks.CreateHookConfig(context.Background(), env.adminPrincipal, hookregistry.CreateHookConfigParams{
		OrganizationID: env.orgID, Name: "block-rm", Command: "echo pre-existing",
	}); err != nil {
		t.Fatalf("create pre-existing hook: %v", err)
	}

	manifest := Manifest{
		Name: "Test",
		Hooks: []ManifestHook{
			{Name: "block-rm", Command: "exit 0"}, // name conflict, will fail
			{Name: "new-hook", Command: "exit 0"}, // should still succeed
		},
	}
	result, err := env.svc.Import(context.Background(), env.adminPrincipal, ImportParams{
		OrganizationID: env.orgID, Manifest: manifest,
	})
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(result.Created) != 1 || result.Created[0].Name != "new-hook" {
		t.Fatalf("expected exactly the non-conflicting hook to be created, got %+v", result.Created)
	}
	if len(result.Failed) != 1 || result.Failed[0].Name != "block-rm" {
		t.Fatalf("expected the conflicting hook to be reported as failed, got %+v", result.Failed)
	}
}
