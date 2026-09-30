package knowledge

import (
	"context"
	"fmt"
	"testing"
)

// TestSearchOverfetchesBeforeACLFilterFillsTopK is the regression test for
// the ACL post-filter under-fill gap: enrichSearchResponse drops any result
// principalMatchesExternalAccess rejects, but Search used to request
// exactly TopK from the vector store first - if enough of the top-ranked
// hits are ACL-restricted from the caller, the response silently comes back
// with fewer than TopK results (or zero) even though enough visible chunks
// exist further down the ranking. Reproduced deterministically in keyword
// mode: 10 short, exact-match "restricted" chunks outrank one longer,
// weaker-match "visible" chunk, and TopK=3 - without over-fetching before
// the ACL filter, all 3 top slots are restricted and the admin (who can't
// see any of them) gets zero results despite the visible chunk existing.
func TestSearchOverfetchesBeforeACLFilterFillsTopK(t *testing.T) {
	env := newTestEnv(t)
	env.configurePlatformEmbedder(t)
	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Overfetch Test",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	restrictedMember := env.addMember(t, "member")
	// Ten short, exact-phrase matches - these rank at the very top of a
	// keyword/BM25 search for "confidential report", and only
	// restrictedMember can see them.
	for i := 0; i < 10; i++ {
		if _, err := env.knowledge.IngestFromConnector(context.Background(), env.orgID, corpus.ID,
			"conn_fake", fmt.Sprintf("remote/restricted-%d.txt", i), env.adminPrincipal.User.ID,
			fmt.Sprintf("restricted-%d.txt", i), "text/plain", []byte("confidential report"), "",
			[]string{"user:" + restrictedMember.User.Email},
		); err != nil {
			t.Fatalf("ingest restricted item %d: %v", i, err)
		}
	}
	// One longer, weaker match - visible to everyone (no ACL set), but
	// scores lower than the ten exact matches above.
	if _, err := env.knowledge.UploadFile(context.Background(), env.adminPrincipal, corpus.ID, "visible.txt", "text/plain",
		[]byte("Quarterly summary for the team: revenue is up, headcount is stable, and there is a confidential report attached for leadership review only after the all-hands meeting concludes."),
	); err != nil {
		t.Fatalf("upload visible file: %v", err)
	}

	for i := 0; i < 11; i++ {
		processed, err := env.knowledge.ProcessNextIngestionJob(context.Background())
		if err != nil {
			t.Fatalf("process ingestion job %d: %v", i, err)
		}
		if !processed {
			t.Fatalf("expected job %d to be processed", i)
		}
	}

	// The admin can see the corpus itself but is not in any restricted
	// file's ACL - only the visible file should come back, and it must
	// come back at all despite ranking behind all ten restricted chunks.
	resp, err := env.knowledge.Search(context.Background(), env.adminPrincipal, SearchParams{
		CorpusID: corpus.ID, Query: "confidential report", Mode: SearchModeKeyword, TopK: 3,
	})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(resp.Results) == 0 {
		t.Fatal("expected the visible file to still be found despite ranking behind ten ACL-restricted chunks - the ACL filter under-filled the response")
	}
	for _, r := range resp.Results {
		if r.Filename != "visible.txt" {
			t.Fatalf("expected only the visible file in results, got %+v", resp.Results)
		}
	}
}
