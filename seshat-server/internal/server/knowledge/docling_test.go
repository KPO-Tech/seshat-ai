package knowledge

import (
	"context"
	"os"
	"path/filepath"
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

// Regression test for a rare but real failure mode: docling itself
// returning garbled text (e.g. a broken embedded font it couldn't OCR
// around) — "(cid:NNN)" placeholders are docling's own tell for this. The
// ingestion job must fail cleanly, the same as if docling had returned
// nothing at all, rather than silently indexing the garbled output as if
// it were the document's real content.
func TestIngestionRejectsGarbledDoclingOutputAndFailsCleanly(t *testing.T) {
	env := newTestEnv(t)
	env.configurePlatformEmbedder(t)
	env.configureDocling(t, "Report Title (cid:47)(cid:12) Summary (cid:8)(cid:91)(cid:3)(cid:44)")

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Garbled Docling Test",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	if _, err := env.knowledge.UploadFile(context.Background(), env.adminPrincipal, corpus.ID, "broken.pdf", "application/pdf", []byte{0x25, 0x50, 0x44, 0x46, 0x00, 0x01, 0x02}); err != nil {
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
	if len(files) != 1 || files[0].Status != CorpusFileStatusFailed {
		t.Fatalf("expected garbled docling output to fail ingestion rather than be indexed, got %+v", files)
	}
	jobs, err := env.knowledge.ListIngestionJobs(context.Background(), env.adminPrincipal, corpus.ID)
	if err != nil {
		t.Fatalf("list ingestion jobs: %v", err)
	}
	if len(jobs) != 1 || jobs[0].Phase != IngestionJobPhasePending || jobs[0].FailureStage != "rag_ingest" {
		t.Fatalf("expected failed docling job to expose phase/stage, got %+v", jobs)
	}
	if jobs[0].UsedDocling != true || jobs[0].TotalDurationMS == 0 {
		t.Fatalf("expected failed docling job to expose metrics, got %+v", jobs[0])
	}
}

// Corpus ingestion now delegates document-aware chunking to the seshat
// runtime's DoclingChunker. Even PDFs with a usable text layer go through
// the same package-level RAG path so seshat-server does not maintain a
// second, divergent extraction pipeline.
func TestIngestionUsesRuntimeDoclingChunkerForTextLayerPDF(t *testing.T) {
	env := newTestEnv(t)
	env.configurePlatformEmbedder(t)
	env.configureDocling(t, "# This came from the runtime docling chunker")

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Native Extraction Test",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	pdfBytes, err := os.ReadFile(filepath.Join("testdata", "text_layer.pdf"))
	if err != nil {
		t.Fatalf("read testdata/text_layer.pdf: %v", err)
	}
	if _, err := env.knowledge.UploadFile(context.Background(), env.adminPrincipal, corpus.ID, "report.pdf", "application/pdf", pdfBytes); err != nil {
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
		t.Fatalf("expected the file to be ingested, got %+v", files)
	}

	resp, err := env.knowledge.Search(context.Background(), env.adminPrincipal, SearchParams{CorpusID: corpus.ID, Query: "Alice"})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(resp.Results) == 0 {
		t.Fatal("expected search to find the runtime docling content")
	}
	found := false
	for _, r := range resp.Results {
		if strings.Contains(r.Text, "runtime docling chunker") {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected a runtime docling chunk to be indexed, got %+v", resp.Results)
	}
}

func TestConnectorIngestionUsesRuntimeDoclingChunkerForBinaryData(t *testing.T) {
	env := newTestEnv(t)
	env.configurePlatformEmbedder(t)
	env.configureDocling(t, "# Connector PDF\n\nEnterprise SLA is 99.9%.")

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Connector Docling Test",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	if _, err := env.knowledge.IngestFromConnector(
		context.Background(),
		env.orgID,
		corpus.ID,
		"conn_fake",
		"remote/policy.pdf",
		env.adminPrincipal.User.ID,
		"policy.pdf",
		"application/pdf",
		[]byte{0x25, 0x50, 0x44, 0x46, 0x00, 0x01, 0x02},
		"",
	); err != nil {
		t.Fatalf("ingest connector item: %v", err)
	}

	processed, err := env.knowledge.ProcessNextIngestionJob(context.Background())
	if err != nil {
		t.Fatalf("process ingestion job: %v", err)
	}
	if !processed {
		t.Fatal("expected a queued job to be processed")
	}

	resp, err := env.knowledge.Search(context.Background(), env.adminPrincipal, SearchParams{CorpusID: corpus.ID, Query: "Enterprise SLA"})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(resp.Results) == 0 {
		t.Fatal("expected search to find docling content from connector bytes")
	}
	if resp.Results[0].Source != "connector" || resp.Results[0].ContentType != "application/pdf" {
		t.Fatalf("expected connector PDF metadata to survive ingestion, got %+v", resp.Results[0])
	}
}

// A PDF page that DOES have an embedded image still needs docling -
// pdfsmart routes only that page to it, not the whole document, but the
// end result (docling's content present in the corpus) must be the same
// as if pdfsmart didn't exist. scanned.pdf's only page is nothing but an
// embedded screenshot image, so this exercises exactly the case pdfsmart
// itself can't skip.
func TestIngestionStillUsesDoclingForAPDFWithAnEmbeddedImage(t *testing.T) {
	env := newTestEnv(t)
	env.configurePlatformEmbedder(t)
	env.configureDocling(t, "# This came from docling for the image page")

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Image PDF Test",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	pdfBytes, err := os.ReadFile(filepath.Join("testdata", "scanned.pdf"))
	if err != nil {
		t.Fatalf("read testdata/scanned.pdf: %v", err)
	}
	if _, err := env.knowledge.UploadFile(context.Background(), env.adminPrincipal, corpus.ID, "scan.pdf", "application/pdf", pdfBytes); err != nil {
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

	resp, err := env.knowledge.Search(context.Background(), env.adminPrincipal, SearchParams{CorpusID: corpus.ID, Query: "docling"})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(resp.Results) == 0 {
		t.Fatal("expected search to find docling's extracted content for the image page")
	}
	found := false
	for _, r := range resp.Results {
		if strings.Contains(r.Text, "came from docling for the image page") {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected a chunk containing docling's markdown output, got %+v", resp.Results)
	}
}
