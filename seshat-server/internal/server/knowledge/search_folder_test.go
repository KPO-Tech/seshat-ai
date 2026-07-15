package knowledge

import (
	"context"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func ingestOneFile(t *testing.T, env testEnv, corpusID, filename, text string) {
	t.Helper()
	if _, err := env.knowledge.UploadFile(context.Background(), env.adminPrincipal, corpusID, filename, "text/plain", []byte(text)); err != nil {
		t.Fatalf("upload file into %s: %v", corpusID, err)
	}
	for {
		processed, err := env.knowledge.ProcessNextIngestionJob(context.Background())
		if err != nil {
			t.Fatalf("process ingestion job: %v", err)
		}
		if !processed {
			break
		}
	}
}

func TestSearchFolderMergesResultsAcrossItsCorpora(t *testing.T) {
	env := newTestEnv(t)
	env.configurePlatformEmbedder(t)

	folder, err := env.knowledge.CreateCorpusFolder(context.Background(), env.adminPrincipal, CreateCorpusFolderParams{
		OrganizationID: env.orgID, Name: "Policies",
	})
	if err != nil {
		t.Fatalf("create folder: %v", err)
	}

	corpusA, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Refunds", FolderID: folder.ID,
	})
	if err != nil {
		t.Fatalf("create corpus A: %v", err)
	}
	corpusB, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Shipping", FolderID: folder.ID,
	})
	if err != nil {
		t.Fatalf("create corpus B: %v", err)
	}
	// A corpus outside the folder - its content must never show up in the
	// folder search below.
	corpusC, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Unrelated",
	})
	if err != nil {
		t.Fatalf("create corpus C: %v", err)
	}

	ingestOneFile(t, env, corpusA.ID, "refunds.txt", "Refunds are processed within 14 business days of return receipt.")
	ingestOneFile(t, env, corpusB.ID, "shipping.txt", "Standard shipping takes 3 to 5 business days within the country.")
	ingestOneFile(t, env, corpusC.ID, "unrelated.txt", "The office has free coffee every Friday morning.")

	resp, err := env.knowledge.SearchFolder(context.Background(), env.adminPrincipal, folder.ID, "business days", 10)
	if err != nil {
		t.Fatalf("search folder: %v", err)
	}
	if resp.FolderID != folder.ID {
		t.Fatalf("expected folder_id %q, got %q", folder.ID, resp.FolderID)
	}
	if len(resp.Results) != 2 {
		t.Fatalf("expected exactly 2 merged results (one per corpus in the folder), got %d: %+v", len(resp.Results), resp.Results)
	}

	seenCorpora := map[string]bool{}
	for _, result := range resp.Results {
		corpusID := result.Metadata["corpus_id"]
		corpusName := result.Metadata["corpus_name"]
		if corpusID == "" || corpusName == "" {
			t.Fatalf("expected every result to be tagged with corpus_id/corpus_name, got metadata=%+v", result.Metadata)
		}
		if corpusID == corpusC.ID {
			t.Fatal("a corpus outside the folder must never appear in folder search results")
		}
		seenCorpora[corpusID] = true
	}
	if !seenCorpora[corpusA.ID] || !seenCorpora[corpusB.ID] {
		t.Fatalf("expected results from both corpusA and corpusB, got corpora=%+v", seenCorpora)
	}

	// Results must be sorted by score descending.
	for i := 1; i < len(resp.Results); i++ {
		if resp.Results[i].Score > resp.Results[i-1].Score {
			t.Fatalf("expected results sorted by descending score, got %+v", resp.Results)
		}
	}
}

func TestSearchFolderOnEmptyFolderReturnsEmptyResults(t *testing.T) {
	env := newTestEnv(t)
	env.configurePlatformEmbedder(t)

	folder, err := env.knowledge.CreateCorpusFolder(context.Background(), env.adminPrincipal, CreateCorpusFolderParams{
		OrganizationID: env.orgID, Name: "Empty Folder",
	})
	if err != nil {
		t.Fatalf("create folder: %v", err)
	}

	resp, err := env.knowledge.SearchFolder(context.Background(), env.adminPrincipal, folder.ID, "anything", 5)
	if err != nil {
		t.Fatalf("search folder: %v", err)
	}
	if len(resp.Results) != 0 {
		t.Fatalf("expected no results for a folder with no corpora, got %+v", resp.Results)
	}
}

func TestSearchFolderRejectsNonMemberOfADifferentOrganization(t *testing.T) {
	env := newTestEnv(t)
	env.configurePlatformEmbedder(t)

	folder, err := env.knowledge.CreateCorpusFolder(context.Background(), env.adminPrincipal, CreateCorpusFolderParams{
		OrganizationID: env.orgID, Name: "Restricted",
	})
	if err != nil {
		t.Fatalf("create folder: %v", err)
	}

	otherOrg, err := env.iam.CreateOrganization(context.Background(), env.adminPrincipal, iam.CreateOrganizationParams{Name: "Other Org", Slug: "other-org"})
	if err != nil {
		t.Fatalf("create other org: %v", err)
	}
	outsiderUser, err := env.iam.CreateUser(context.Background(), env.adminPrincipal, iam.CreateUserParams{
		Email: "outsider@example.com", Password: "password123", DisplayName: "Outsider",
		OrganizationID: otherOrg.ID, Role: "member",
	})
	if err != nil {
		t.Fatalf("create outsider user: %v", err)
	}
	login, err := env.iam.Login(context.Background(), outsiderUser.Email, "password123")
	if err != nil {
		t.Fatalf("login outsider: %v", err)
	}
	outsider, err := env.iam.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve outsider principal: %v", err)
	}

	if _, err := env.knowledge.SearchFolder(context.Background(), outsider, folder.ID, "query", 5); err == nil {
		t.Fatal("expected a member of a different organization to be rejected")
	}
}

func TestSearchFolderRejectsUnknownFolder(t *testing.T) {
	env := newTestEnv(t)
	env.configurePlatformEmbedder(t)

	if _, err := env.knowledge.SearchFolder(context.Background(), env.adminPrincipal, "corpusfolder_does_not_exist", "query", 5); err == nil {
		t.Fatal("expected an error for a nonexistent folder")
	}
}
