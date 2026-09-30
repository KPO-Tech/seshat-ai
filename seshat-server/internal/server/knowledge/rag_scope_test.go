package knowledge

import (
	"context"
	"strings"
	"testing"

	sdkrag "github.com/KPO-Tech/seshat/pkg/rag"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// TestRAGServiceForOrganizationRejectsCrossOrgCorpusID is the regression
// test for the cross-tenant read/write/delete gap: rag_search, rag_ingest,
// and rag_delete are wired onto the LLM's tool set from whatever
// *sdkrag.Service RAGServiceForOrganization returns, and all three accept
// corpus_id as a plain model-supplied string. Before orgScopedVectorStore,
// that *sdkrag.Service could search/ingest/delete ANY namespace regardless
// of which organization it was built "for" - this proves the org boundary
// is now enforced at the vector-store layer itself, not just at the HTTP
// corpus endpoints (which use a different check, mustLoadCorpus, that this
// tool-call path never goes through).
func TestRAGServiceForOrganizationRejectsCrossOrgCorpusID(t *testing.T) {
	env := newTestEnv(t)
	env.configurePlatformEmbedder(t)
	ctx := context.Background()

	corpus, err := env.knowledge.CreateCorpus(ctx, env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Org A Secrets",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}
	if _, err := env.knowledge.UploadFile(ctx, env.adminPrincipal, corpus.ID, "doc.txt", "text/plain", []byte("the launch code is 42")); err != nil {
		t.Fatalf("upload file: %v", err)
	}
	if _, err := env.knowledge.ProcessNextIngestionJob(ctx); err != nil {
		t.Fatalf("process ingestion job: %v", err)
	}

	otherOrg, err := env.iam.CreateOrganization(ctx, env.adminPrincipal, iam.CreateOrganizationParams{
		Name: "Other Org", Slug: "other-org",
	})
	if err != nil {
		t.Fatalf("create other org: %v", err)
	}

	// A Workspace Chat / automation-job LLM session running for otherOrg
	// gets a rag.Service built "for" otherOrg...
	ragForOtherOrg, ok, err := env.knowledge.RAGServiceForOrganization(ctx, otherOrg.ID)
	if err != nil {
		t.Fatalf("rag service for other org: %v", err)
	}
	if !ok {
		t.Fatal("expected the platform default embedder to make otherOrg's rag.Service available")
	}

	// ...but the model can still try to supply org A's real corpus_id as the
	// rag_search argument. This must be rejected, not silently succeed.
	if _, err := ragForOtherOrg.Search(ctx, sdkrag.SearchRequest{CorpusID: corpus.ID, Query: "launch code", TopK: 5}); err == nil {
		t.Fatal("expected searching another organization's corpus_id to fail, got no error")
	} else if !strings.Contains(err.Error(), "not found in this organization") {
		t.Fatalf("expected an org-scoping error, got: %v", err)
	}

	// Same for ingest and delete - not just search.
	if _, err := ragForOtherOrg.Ingest(ctx, sdkrag.IngestRequest{CorpusID: corpus.ID, Filename: "smuggled.txt", Text: "smuggled content"}); err == nil {
		t.Fatal("expected ingesting into another organization's corpus_id to fail, got no error")
	} else if !strings.Contains(err.Error(), "not found in this organization") {
		t.Fatalf("expected an org-scoping error from ingest, got: %v", err)
	}

	// Sanity: the legitimate owner can still search its own corpus fine -
	// this wrapper must not break the normal, same-org path.
	ragForOrgA, ok, err := env.knowledge.RAGServiceForOrganization(ctx, env.orgID)
	if err != nil || !ok {
		t.Fatalf("rag service for org A: ok=%v err=%v", ok, err)
	}
	resp, err := ragForOrgA.Search(ctx, sdkrag.SearchRequest{CorpusID: corpus.ID, Query: "launch code", TopK: 5})
	if err != nil {
		t.Fatalf("expected org A to search its own corpus fine, got: %v", err)
	}
	if len(resp.Results) == 0 {
		t.Fatal("expected at least one result searching org A's own ingested corpus")
	}
}
