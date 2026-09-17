package knowledge

import (
	"context"
	"testing"
)

// TestSearchDedupesIdenticalChunkText is the regression test for the
// deduplication gap: uploading the same content twice (e.g. two files with
// identical text, or the same document accidentally re-uploaded) produces
// two independent artifact_keys pointing at byte-identical chunk text, and
// both can legitimately rank in the same top-K for a matching query -
// without dedup, Search returns the same sentence twice.
func TestSearchDedupesIdenticalChunkText(t *testing.T) {
	env := newTestEnv(t)
	env.configurePlatformEmbedder(t)

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Duplicate Content Test",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	text := "Refunds are processed within 14 business days of the return being received by our warehouse."
	if _, err := env.knowledge.UploadFile(context.Background(), env.adminPrincipal, corpus.ID, "refund-policy.txt", "text/plain", []byte(text)); err != nil {
		t.Fatalf("upload first file: %v", err)
	}
	if _, err := env.knowledge.UploadFile(context.Background(), env.adminPrincipal, corpus.ID, "refund-policy-copy.txt", "text/plain", []byte(text)); err != nil {
		t.Fatalf("upload duplicate file: %v", err)
	}
	for i := 0; i < 2; i++ {
		processed, err := env.knowledge.ProcessNextIngestionJob(context.Background())
		if err != nil {
			t.Fatalf("process ingestion job %d: %v", i, err)
		}
		if !processed {
			t.Fatalf("expected job %d to be processed", i)
		}
	}

	resp, err := env.knowledge.Search(context.Background(), env.adminPrincipal, SearchParams{CorpusID: corpus.ID, Query: "refund policy", TopK: 10})
	if err != nil {
		t.Fatalf("search: %v", err)
	}

	seen := make(map[string]int)
	for _, r := range resp.Results {
		seen[r.Text]++
	}
	for chunkText, count := range seen {
		if count > 1 {
			t.Fatalf("expected each distinct chunk text to appear once, got %q %d times in %+v", chunkText, count, resp.Results)
		}
	}
}

func TestDedupeSearchResultsKeepsFirstOccurrence(t *testing.T) {
	results := []SearchResult{
		{Key: "a", Text: "same text", Score: 0.9},
		{Key: "b", Text: "same text", Score: 0.5},
		{Key: "c", Text: "different text", Score: 0.7},
	}
	deduped := dedupeSearchResults(results)
	if len(deduped) != 2 {
		t.Fatalf("expected 2 results after dedup, got %d: %+v", len(deduped), deduped)
	}
	if deduped[0].Key != "a" {
		t.Fatalf("expected the higher-scoring duplicate (key a) to survive, got %+v", deduped[0])
	}
	if deduped[1].Key != "c" {
		t.Fatalf("expected the distinct result (key c) to survive, got %+v", deduped[1])
	}
}
