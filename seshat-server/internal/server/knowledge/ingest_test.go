package knowledge

import (
	"context"
	"testing"
)

func TestUploadFileAutoEnqueuesAndProcessesIngestion(t *testing.T) {
	env := newTestEnv(t)
	env.configurePlatformEmbedder(t)

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Supplier Policies",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	text := "Refunds are processed within 14 business days of the return being received by our warehouse."
	file, err := env.knowledge.UploadFile(context.Background(), env.adminPrincipal, corpus.ID, "refund-policy.txt", "text/plain", []byte(text))
	if err != nil {
		t.Fatalf("upload file: %v", err)
	}
	if file.Status != CorpusFileStatusPending {
		t.Fatalf("expected a freshly uploaded file to be pending, got %q", file.Status)
	}

	jobs, err := env.knowledge.ListIngestionJobs(context.Background(), env.adminPrincipal, corpus.ID)
	if err != nil {
		t.Fatalf("list ingestion jobs: %v", err)
	}
	if len(jobs) != 1 || jobs[0].Status != IngestionJobStatusQueued {
		t.Fatalf("expected exactly one auto-enqueued queued job, got %+v", jobs)
	}

	processed, err := env.knowledge.ProcessNextIngestionJob(context.Background())
	if err != nil {
		t.Fatalf("process ingestion job: %v", err)
	}
	if !processed {
		t.Fatal("expected a queued job to be processed")
	}

	job, err := env.knowledge.GetIngestionJob(context.Background(), env.adminPrincipal, corpus.ID, jobs[0].ID)
	if err != nil {
		t.Fatalf("get ingestion job: %v", err)
	}
	if job.Status != IngestionJobStatusCompleted {
		t.Fatalf("expected the job to complete, got status=%q error=%q", job.Status, job.LastError)
	}
	if job.ChunkCount == 0 {
		t.Fatal("expected the completed job to report at least one chunk")
	}

	files, err := env.knowledge.ListFiles(context.Background(), env.adminPrincipal, corpus.ID)
	if err != nil {
		t.Fatalf("list files: %v", err)
	}
	if len(files) != 1 || files[0].Status != CorpusFileStatusIngested || files[0].ChunkCount == 0 {
		t.Fatalf("expected the file to be marked ingested with chunks, got %+v", files)
	}

	updatedCorpus, err := env.knowledge.GetCorpus(context.Background(), env.adminPrincipal, corpus.ID)
	if err != nil {
		t.Fatalf("get corpus: %v", err)
	}
	if updatedCorpus.ChunkCount != files[0].ChunkCount {
		t.Fatalf("expected corpus chunk_count to match its file's chunk_count, got corpus=%d file=%d", updatedCorpus.ChunkCount, files[0].ChunkCount)
	}

	// Now the end-to-end point of the whole domain: search actually finds it.
	resp, err := env.knowledge.Search(context.Background(), env.adminPrincipal, SearchParams{CorpusID: corpus.ID, Query: "refund policy"})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(resp.Results) == 0 {
		t.Fatal("expected search to return at least one result from the ingested file")
	}
}

// Without an embedder configured, ingestion still runs — vectorless
// (BM25-only), via sdkrag.Service's own nil-embedder fallback (see
// ragServiceFor). This used to be a hard failure (auto-enqueue skipped,
// Search rejected outright); it isn't anymore, since keyword search over
// ungenerated-vector chunks is strictly better than no knowledge base
// feature at all until someone configures a real embedder.
func TestUploadFileWithoutEmbedderIngestsVectorlessAndSearchWorks(t *testing.T) {
	env := newTestEnv(t) // no embedder configured — this is the default state

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "No Embedder Yet",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}
	text := "Refunds are processed within 14 business days of the return being received by our warehouse."
	if _, err := env.knowledge.UploadFile(context.Background(), env.adminPrincipal, corpus.ID, "refund-policy.txt", "text/plain", []byte(text)); err != nil {
		t.Fatalf("upload file: %v", err)
	}

	jobs, err := env.knowledge.ListIngestionJobs(context.Background(), env.adminPrincipal, corpus.ID)
	if err != nil {
		t.Fatalf("list ingestion jobs: %v", err)
	}
	if len(jobs) != 1 || jobs[0].Status != IngestionJobStatusQueued {
		t.Fatalf("expected exactly one auto-enqueued queued job even without an embedder, got %+v", jobs)
	}

	processed, err := env.knowledge.ProcessNextIngestionJob(context.Background())
	if err != nil {
		t.Fatalf("process ingestion job: %v", err)
	}
	if !processed {
		t.Fatal("expected a queued job to be processed")
	}

	job, err := env.knowledge.GetIngestionJob(context.Background(), env.adminPrincipal, corpus.ID, jobs[0].ID)
	if err != nil {
		t.Fatalf("get ingestion job: %v", err)
	}
	if job.Status != IngestionJobStatusCompleted {
		t.Fatalf("expected the vectorless job to complete, got status=%q error=%q", job.Status, job.LastError)
	}
	if job.ChunkCount == 0 {
		t.Fatal("expected the completed vectorless job to still report at least one chunk")
	}

	resp, err := env.knowledge.Search(context.Background(), env.adminPrincipal, SearchParams{CorpusID: corpus.ID, Query: "refund policy"})
	if err != nil {
		t.Fatalf("expected vectorless (BM25) search to succeed without an embedder, got: %v", err)
	}
	if len(resp.Results) == 0 {
		t.Fatal("expected vectorless search to still find the ingested file via keyword match")
	}
}

func TestRetryIngestionJobOnlyAllowsFailedJobs(t *testing.T) {
	env := newTestEnv(t)
	env.configurePlatformEmbedder(t)
	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Retry Test",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}
	if _, err := env.knowledge.UploadFile(context.Background(), env.adminPrincipal, corpus.ID, "doc.txt", "text/plain", []byte("some searchable content")); err != nil {
		t.Fatalf("upload file: %v", err)
	}
	jobs, err := env.knowledge.ListIngestionJobs(context.Background(), env.adminPrincipal, corpus.ID)
	if err != nil || len(jobs) != 1 {
		t.Fatalf("expected one auto-enqueued job: jobs=%+v err=%v", jobs, err)
	}

	// Still queued: retry must be rejected.
	if _, err := env.knowledge.RetryIngestionJob(context.Background(), env.adminPrincipal, corpus.ID, jobs[0].ID); err == nil {
		t.Fatal("expected retrying a non-failed job to be rejected")
	}

	// Completed is the other non-retryable state — only "failed" is allowed.
	if _, err := env.knowledge.ProcessNextIngestionJob(context.Background()); err != nil {
		t.Fatalf("process ingestion job: %v", err)
	}
	completed, err := env.knowledge.GetIngestionJob(context.Background(), env.adminPrincipal, corpus.ID, jobs[0].ID)
	if err != nil {
		t.Fatalf("get ingestion job: %v", err)
	}
	if completed.Status != IngestionJobStatusCompleted {
		t.Fatalf("expected the job to complete, got %+v", completed)
	}
	if _, err := env.knowledge.RetryIngestionJob(context.Background(), env.adminPrincipal, corpus.ID, jobs[0].ID); err == nil {
		t.Fatal("expected retrying a completed job to be rejected")
	}
}

func TestDetachFileRemovesChunksAndAdjustsCorpusCount(t *testing.T) {
	env := newTestEnv(t)
	env.configurePlatformEmbedder(t)
	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Detach Test",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}
	file, err := env.knowledge.UploadFile(context.Background(), env.adminPrincipal, corpus.ID, "doc.txt", "text/plain", []byte("some searchable content about refunds"))
	if err != nil {
		t.Fatalf("upload file: %v", err)
	}
	if _, err := env.knowledge.ProcessNextIngestionJob(context.Background()); err != nil {
		t.Fatalf("process ingestion job: %v", err)
	}
	ingested, err := env.knowledge.GetCorpus(context.Background(), env.adminPrincipal, corpus.ID)
	if err != nil {
		t.Fatalf("get corpus: %v", err)
	}
	if ingested.ChunkCount == 0 {
		t.Fatal("expected the corpus to have a nonzero chunk count after ingestion")
	}

	if err := env.knowledge.DetachFile(context.Background(), env.adminPrincipal, corpus.ID, file.ID); err != nil {
		t.Fatalf("detach file: %v", err)
	}

	afterDetach, err := env.knowledge.GetCorpus(context.Background(), env.adminPrincipal, corpus.ID)
	if err != nil {
		t.Fatalf("get corpus after detach: %v", err)
	}
	if afterDetach.ChunkCount != 0 {
		t.Fatalf("expected corpus chunk_count to return to zero after detaching its only file, got %d", afterDetach.ChunkCount)
	}
	files, err := env.knowledge.ListFiles(context.Background(), env.adminPrincipal, corpus.ID)
	if err != nil {
		t.Fatalf("list files: %v", err)
	}
	if len(files) != 0 {
		t.Fatalf("expected no files after detach, got %d", len(files))
	}
}
