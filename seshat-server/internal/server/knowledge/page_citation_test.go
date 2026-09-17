package knowledge

import (
	"context"
	"testing"
)

// TestSearchAndSegmentsExposePageNumbersFromDoclingMetadata is the
// regression test for the page-citation gap: Docling ingestion has always
// written a chunk's source PDF page(s) into metadata["page_numbers"] (see
// the fake docling server in testutil_test.go, which returns page_numbers:
// [1] for every chunk, mirroring the real service), but SearchCitation and
// CorpusSegment.Citation never surfaced it - a caller had no stable field
// to read a citation's page from, only the flat chunk Position ordinal.
func TestSearchAndSegmentsExposePageNumbersFromDoclingMetadata(t *testing.T) {
	env := newTestEnv(t)
	env.configurePlatformEmbedder(t)
	env.configureDocling(t, "# Refund Policy\n\nRestocking fee is 10% for non-defective returns.")

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Page Citation Test",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}
	file, err := env.knowledge.UploadFile(context.Background(), env.adminPrincipal, corpus.ID, "policy.pdf", "application/pdf", []byte{0x25, 0x50, 0x44, 0x46, 0x00, 0x01, 0x02})
	if err != nil {
		t.Fatalf("upload file: %v", err)
	}
	if _, err := env.knowledge.ProcessNextIngestionJob(context.Background()); err != nil {
		t.Fatalf("process ingestion job: %v", err)
	}

	resp, err := env.knowledge.Search(context.Background(), env.adminPrincipal, SearchParams{CorpusID: corpus.ID, Query: "restocking fee"})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(resp.Results) == 0 {
		t.Fatal("expected at least one search result")
	}
	for _, r := range resp.Results {
		if r.Citation == nil {
			t.Fatalf("expected a citation on result %+v", r)
		}
		if len(r.Citation.PageNumbers) != 1 || r.Citation.PageNumbers[0] != 1 {
			t.Fatalf("expected citation page_numbers [1] (from the fake docling chunk response), got %v", r.Citation.PageNumbers)
		}
	}

	segments, err := env.knowledge.ListFileSegments(context.Background(), env.adminPrincipal, corpus.ID, file.ID)
	if err != nil {
		t.Fatalf("list file segments: %v", err)
	}
	if len(segments.Segments) == 0 {
		t.Fatal("expected at least one segment")
	}
	for _, seg := range segments.Segments {
		if len(seg.Citation.PageNumbers) != 1 || seg.Citation.PageNumbers[0] != 1 {
			t.Fatalf("expected segment citation page_numbers [1], got %v", seg.Citation.PageNumbers)
		}
	}
}

// TestPageNumbersFromMetadataHandlesEdgeCases guards the parsing helper
// itself against non-Docling chunks (no key at all), malformed values, and
// the empty-array case docling_chunker.go's putJSON deliberately never
// writes (it skips "[]"/"null"/"{}" - see its own doc comment).
func TestPageNumbersFromMetadataHandlesEdgeCases(t *testing.T) {
	cases := []struct {
		name     string
		metadata map[string]string
		want     []int
	}{
		{"missing key", map[string]string{}, nil},
		{"nil metadata", nil, nil},
		{"single page", map[string]string{"page_numbers": "[3]"}, []int{3}},
		{"multi page (chunk spans a page break)", map[string]string{"page_numbers": "[3,4]"}, []int{3, 4}},
		{"malformed json", map[string]string{"page_numbers": "not-json"}, nil},
		{"empty array", map[string]string{"page_numbers": "[]"}, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := pageNumbersFromMetadata(tc.metadata)
			if len(got) != len(tc.want) {
				t.Fatalf("expected %v, got %v", tc.want, got)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("expected %v, got %v", tc.want, got)
				}
			}
		})
	}
}
