package knowledge

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// TestCorpusScopedPolicyBindingGrantsAccessOnlyToThatCorpus is the
// end-to-end counterpart to iam's resource-scope tests: it proves a
// PolicyBinding scoped to one Corpus actually gates Corpus CRUD through
// knowledge.Service.mustLoadCorpus/UpdateCorpus (internal/server/knowledge/service.go),
// not just the permission engine in isolation.
func TestCorpusScopedPolicyBindingGrantsAccessOnlyToThatCorpus(t *testing.T) {
	env := newTestEnv(t)

	corpusA, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Finance",
	})
	if err != nil {
		t.Fatalf("create corpus A: %v", err)
	}
	corpusB, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Engineering",
	})
	if err != nil {
		t.Fatalf("create corpus B: %v", err)
	}

	memberPrincipal := env.addMember(t, "viewer")

	// Before any binding, the viewer role alone (no knowledge.read/manage)
	// cannot touch either corpus.
	if _, err := env.knowledge.GetCorpus(context.Background(), memberPrincipal, corpusA.ID); err == nil {
		t.Fatal("expected a plain viewer to be denied access to corpus A before any binding")
	}

	if _, err := env.iam.CreatePolicyBinding(context.Background(), env.adminPrincipal, iam.CreatePolicyBindingParams{
		OrganizationID:  env.orgID,
		Name:            "Finance corpus access",
		SubjectType:     "user",
		SubjectID:       memberPrincipal.User.ID,
		PermissionCodes: []string{"knowledge.manage"},
		ResourceType:    "corpus",
		ResourceID:      corpusA.ID,
	}); err != nil {
		t.Fatalf("create corpus-scoped policy binding: %v", err)
	}

	// Now grants access to corpus A specifically...
	if _, err := env.knowledge.GetCorpus(context.Background(), memberPrincipal, corpusA.ID); err != nil {
		t.Fatalf("expected corpus-scoped binding to grant access to corpus A: %v", err)
	}
	if _, err := env.knowledge.UpdateCorpus(context.Background(), memberPrincipal, corpusA.ID, UpdateCorpusParams{Name: "Finance (renamed)"}); err != nil {
		t.Fatalf("expected corpus-scoped binding to allow updating corpus A: %v", err)
	}

	// ...but not corpus B, a different resource of the same type.
	if _, err := env.knowledge.GetCorpus(context.Background(), memberPrincipal, corpusB.ID); err == nil {
		t.Fatal("expected corpus-scoped binding on corpus A to not grant access to corpus B")
	}

	// Nor does it widen into the organization-wide ListCorpora visibility
	// check, which is intentionally left organization-wide only (no single
	// resource to scope a listing to).
	corpora, total, err := env.knowledge.ListCorpora(context.Background(), memberPrincipal, env.orgID, sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list corpora as scoped member: %v", err)
	}
	if len(corpora) != 0 || total != 0 {
		t.Fatalf("expected a corpus-scoped grant to not leak into ListCorpora visibility, got %d", len(corpora))
	}
}
