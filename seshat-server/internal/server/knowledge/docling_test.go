package knowledge

import (
	"context"
	"strings"
	"testing"
)

func TestIngestionUsesDoclingForBinaryFormatsWhenConfigured(t *testing.T) {
	env := newTestEnv(t)
	env.configurePlatformEmbedder(t)
	env.configureDocling(t, "# Refund Policy\n\nRestocking fee is 10% for non-defective returns.")

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Docling Test",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	// The uploaded bytes are deliberately not valid PDF content — docling is
	// faked to always return its markdown regardless of input, so this
	// proves the .pdf extension routes through docling instead of the
	// plain-text/printable-bytes fallback (which would reject binary junk
	// as having no extractable text).
	if _, err := env.knowledge.UploadFile(context.Background(), env.adminPrincipal, corpus.ID, "policy.pdf", "application/pdf", []byte{0x25, 0x50, 0x44, 0x46, 0x00, 0x01, 0x02}); err != nil {
		t.Fatalf("upload file: %v", err)
	}

	processed, err := env.knowledge.ProcessNextIngestionJob(context.Background())
	if err != nil {
		t.Fatalf("process ingestion job: %v", err)
	}
	if !processed {
		t.Fatal("expected a queued job to be processed")
	}

	files, err := env.knowledge.ListFiles(context.Background(), env.adminPrincipal, corpus.ID)
	if err != nil {
		t.Fatalf("list files: %v", err)
	}
	if len(files) != 1 || files[0].Status != CorpusFileStatusIngested {
		t.Fatalf("expected the file to be ingested via docling, got %+v", files)
	}

	resp, err := env.knowledge.Search(context.Background(), env.adminPrincipal, SearchParams{CorpusID: corpus.ID, Query: "restocking fee"})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(resp.Results) == 0 {
		t.Fatal("expected search to find the docling-converted content")
	}
	found := false
	for _, r := range resp.Results {
		if strings.Contains(r.Text, "Restocking fee is 10%") {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected a chunk containing docling's markdown output, got %+v", resp.Results)
	}
}
