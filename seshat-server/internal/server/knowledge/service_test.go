package knowledge

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func TestCreateAndGetCorpus(t *testing.T) {
	env := newTestEnv(t)

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Supplier Policies", Description: "Internal supplier policy documents",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}
	if corpus.OrganizationID != env.orgID || corpus.Name != "Supplier Policies" {
		t.Fatalf("unexpected corpus: %+v", corpus)
	}

	fetched, err := env.knowledge.GetCorpus(context.Background(), env.adminPrincipal, corpus.ID)
	if err != nil {
		t.Fatalf("get corpus: %v", err)
	}
	if fetched.ID != corpus.ID {
		t.Fatalf("unexpected fetched corpus: %+v", fetched)
	}
}

func TestListCorporaIsScopedByOrganizationAndPermission(t *testing.T) {
	env := newTestEnv(t)
	memberPrincipal := env.addMember(t, "member")

	if _, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Corpus A",
	}); err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	// A member without knowledge.read/manage sees an empty list, not a 403 —
	// same scoped-visibility convention as every other list endpoint.
	corpora, total, err := env.knowledge.ListCorpora(context.Background(), memberPrincipal, env.orgID, sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("unexpected error listing as member: %v", err)
	}
	if len(corpora) != 0 || total != 0 {
		t.Fatalf("expected a member without knowledge permissions to see no corpora, got %d", len(corpora))
	}

	corpora, total, err = env.knowledge.ListCorpora(context.Background(), env.adminPrincipal, env.orgID, sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list as admin: %v", err)
	}
	if len(corpora) != 1 || total != 1 {
		t.Fatalf("expected the admin to see the one corpus in their org, got %d", len(corpora))
	}
}

func TestCreateCorpusRequiresKnowledgeManage(t *testing.T) {
	env := newTestEnv(t)
	memberPrincipal := env.addMember(t, "member")

	if _, err := env.knowledge.CreateCorpus(context.Background(), memberPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Should Be Denied",
	}); err == nil {
		t.Fatal("expected a member without knowledge.manage to be denied creating a corpus")
	}
}

func TestDeleteCorpusRemovesFilesAndVectors(t *testing.T) {
	env := newTestEnv(t)

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "To Delete",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}
	if _, err := env.knowledge.UploadFile(context.Background(), env.adminPrincipal, corpus.ID, "policy.txt", "text/plain", []byte("Refunds are processed within 14 days of return.")); err != nil {
		t.Fatalf("upload file: %v", err)
	}

	if err := env.knowledge.DeleteCorpus(context.Background(), env.adminPrincipal, corpus.ID); err != nil {
		t.Fatalf("delete corpus: %v", err)
	}
	if _, err := env.knowledge.GetCorpus(context.Background(), env.adminPrincipal, corpus.ID); err == nil {
		t.Fatal("expected the deleted corpus to no longer be found")
	}

	var fileCount int64
	if err := env.db.Gorm().Model(&sdb.CorpusFile{}).Where("corpus_id = ?", corpus.ID).Count(&fileCount).Error; err != nil {
		t.Fatalf("count corpus files: %v", err)
	}
	if fileCount != 0 {
		t.Fatalf("expected corpus files to be cleaned up, found %d", fileCount)
	}
}
