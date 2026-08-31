package bundles

import (
	"context"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/hookregistry"
)

func TestResolveProvenanceMapsImportedItemsToTheirBundle(t *testing.T) {
	env := newTestEnv(t)
	manifest := Manifest{
		Name:  "Jira Integration",
		Hooks: []ManifestHook{{Name: "block-rm", Command: "exit 0"}},
	}
	result, err := env.svc.Import(context.Background(), env.adminPrincipal, ImportParams{
		OrganizationID: env.orgID, Manifest: manifest,
	})
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(result.Created) != 1 {
		t.Fatalf("expected 1 created item, got %+v", result)
	}
	hookID := result.Created[0].ResourceID

	provenance, err := env.svc.ResolveProvenance(context.Background(), env.adminPrincipal, env.orgID, "hook_config", []string{hookID, "some-other-id"})
	if err != nil {
		t.Fatalf("resolve provenance: %v", err)
	}
	entry, ok := provenance[hookID]
	if !ok {
		t.Fatalf("expected an entry for the imported hook, got %+v", provenance)
	}
	if entry.BundleImportID != result.BundleImportID || entry.BundleName != "Jira Integration" {
		t.Fatalf("unexpected provenance entry: %+v", entry)
	}
	if _, ok := provenance["some-other-id"]; ok {
		t.Fatal("expected no entry for an id never tagged by any bundle import")
	}
}

func TestResolveProvenanceOmitsDirectlyCreatedRows(t *testing.T) {
	env := newTestEnv(t)
	created, err := env.hooks.CreateHookConfig(context.Background(), env.adminPrincipal, hookregistry.CreateHookConfigParams{
		OrganizationID: env.orgID, Name: "manual-hook", Command: "exit 0",
	})
	if err != nil {
		t.Fatalf("create hook: %v", err)
	}
	provenance, err := env.svc.ResolveProvenance(context.Background(), env.adminPrincipal, env.orgID, "hook_config", []string{created.ID})
	if err != nil {
		t.Fatalf("resolve provenance: %v", err)
	}
	if len(provenance) != 0 {
		t.Fatalf("expected a directly-created hook to have no bundle provenance, got %+v", provenance)
	}
}

func TestResolveProvenanceRejectsNonMember(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.svc.ResolveProvenance(context.Background(), nil, env.orgID, "hook_config", []string{"x"})
	if err == nil {
		t.Fatal("expected an error for a nil principal")
	}
}
