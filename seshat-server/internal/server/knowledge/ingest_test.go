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
	if job.Phase != IngestionJobPhaseIndexed {
		t.Fatalf("expected completed job phase %q, got %q", IngestionJobPhaseIndexed, job.Phase)
	}
	if job.ChunkCount == 0 {
		t.Fatal("expected the completed job to report at least one chunk")
	}
	if job.ContentType != "text/plain" || job.FileSize != int64(len(text)) || job.SourceBytes != int64(len(text)) {
		t.Fatalf("expected ingestion metrics to preserve source file facts, got %+v", job)
	}
	if job.TextChars == 0 || job.IngestDurationMS == 0 || job.TotalDurationMS == 0 {
		t.Fatalf("expected ingestion metrics to include text and timings, got %+v", job)
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
	if resp.Mode != SearchModeHybrid {
		t.Fatalf("expected default search mode to be %q, got %q", SearchModeHybrid, resp.Mode)
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
	file, err := env.knowledge.UploadFile(context.Background(), env.adminPrincipal, corpus.ID, "refund-policy.txt", "text/plain", []byte(text))
	if err != nil {
		t.Fatalf("upload file: %v", err)
	}
	file, err = env.knowledge.UpdateFile(context.Background(), env.adminPrincipal, corpus.ID, file.ID, UpdateCorpusFileParams{
		Tags:     []string{"policy", "returns", "policy"},
		Metadata: map[string]string{"department": "support", " confidence ": " approved "},
	})
	if err != nil {
		t.Fatalf("update file metadata: %v", err)
	}
	if !hasString(file.Tags, "policy") || !hasString(file.Tags, "returns") || len(file.Tags) != 2 {
		t.Fatalf("expected normalized file tags, got %+v", file.Tags)
	}
	if file.Metadata["department"] != "support" || file.Metadata["confidence"] != "approved" {
		t.Fatalf("expected normalized file metadata, got %+v", file.Metadata)
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
	if job.Phase != IngestionJobPhaseIndexed {
		t.Fatalf("expected vectorless job phase %q, got %q", IngestionJobPhaseIndexed, job.Phase)
	}
	if job.ChunkCount == 0 {
		t.Fatal("expected the completed vectorless job to still report at least one chunk")
	}

	resp, err := env.knowledge.Search(context.Background(), env.adminPrincipal, SearchParams{
		CorpusID: corpus.ID,
		Query:    "refund policy",
		TopK:     3,
		Mode:     SearchModeKeyword,
	})
	if err != nil {
		t.Fatalf("expected vectorless (BM25) search to succeed without an embedder, got: %v", err)
	}
	if len(resp.Results) == 0 {
		t.Fatal("expected vectorless search to still find the ingested file via keyword match")
	}
	if resp.Mode != SearchModeKeyword {
		t.Fatalf("expected search mode %q, got %q", SearchModeKeyword, resp.Mode)
	}
	if resp.TopK != 3 {
		t.Fatalf("expected response top_k=3, got %d", resp.TopK)
	}
	if resp.SearchID == "" {
		t.Fatal("expected search response to include search_id")
	}
	result := resp.Results[0]
	if result.CorpusFileID != file.ID {
		t.Fatalf("expected result to be linked to corpus file %q, got %q", file.ID, result.CorpusFileID)
	}
	if result.Filename != "refund-policy.txt" {
		t.Fatalf("expected result filename to be enriched, got %q", result.Filename)
	}
	if result.Source != "upload" {
		t.Fatalf("expected upload source, got %q", result.Source)
	}
	if !hasString(result.Tags, "returns") {
		t.Fatalf("expected search result to include file tags, got %+v", result.Tags)
	}
	if result.FileMetadata["department"] != "support" {
		t.Fatalf("expected search result to include file metadata, got %+v", result.FileMetadata)
	}
	if result.Citation == nil {
		t.Fatal("expected result citation metadata")
	}
	if result.Citation.CorpusFileID != file.ID || result.Citation.Filename != "refund-policy.txt" {
		t.Fatalf("expected citation to reference uploaded file, got %+v", result.Citation)
	}
	if result.Citation.ArtifactKey == "" {
		t.Fatal("expected citation artifact key")
	}
	if result.Metadata == nil || result.Metadata["artifact_key"] == "" {
		t.Fatalf("expected result metadata to include artifact_key, got %+v", result.Metadata)
	}

	segments, err := env.knowledge.ListFileSegments(context.Background(), env.adminPrincipal, corpus.ID, file.ID)
	if err != nil {
		t.Fatalf("list file segments: %v", err)
	}
	if segments.File.ID != file.ID {
		t.Fatalf("expected segment response file %q, got %+v", file.ID, segments.File)
	}
	if !hasString(segments.File.Tags, "returns") || segments.File.Metadata["confidence"] != "approved" {
		t.Fatalf("expected segment response file metadata, got %+v", segments.File)
	}
	if segments.Count == 0 || len(segments.Segments) == 0 {
		t.Fatalf("expected indexed segments for ingested file, got %+v", segments)
	}
	segment := segments.Segments[0]
	if segment.Text == "" {
		t.Fatal("expected segment text")
	}
	if segment.Citation.CorpusFileID != file.ID || segment.Citation.Filename != "refund-policy.txt" {
		t.Fatalf("expected segment citation to reference uploaded file, got %+v", segment.Citation)
	}
	if segment.Citation.ArtifactKey == "" {
		t.Fatal("expected segment citation artifact key")
	}

	feedback, err := env.knowledge.SubmitSearchFeedback(context.Background(), env.adminPrincipal, SubmitSearchFeedbackParams{
		SearchEventID: resp.SearchID,
		ResultKey:     result.Key,
		CorpusFileID:  file.ID,
		Rating:        "up",
		Comment:       "Good match",
	})
	if err != nil {
		t.Fatalf("submit search feedback: %v", err)
	}
	if feedback.Rating != SearchFeedbackUseful || feedback.CorpusFileID != file.ID {
		t.Fatalf("unexpected feedback: %+v", feedback)
	}

	stats, err := env.knowledge.GetSearchStats(context.Background(), env.adminPrincipal, corpus.ID)
	if err != nil {
		t.Fatalf("get search stats: %v", err)
	}
	if stats.TotalSearches != 1 || stats.EmptySearches != 0 || stats.UsefulFeedbackCount != 1 {
		t.Fatalf("unexpected search stats: %+v", stats)
	}
	if len(stats.RecentSearches) != 1 || stats.RecentSearches[0].ID != resp.SearchID {
		t.Fatalf("expected recent search to include the recorded search, got %+v", stats.RecentSearches)
	}
}

func TestSearchRejectsInvalidMode(t *testing.T) {
	env := newTestEnv(t)

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Search Modes",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}
	if _, err := env.knowledge.Search(context.Background(), env.adminPrincipal, SearchParams{
		CorpusID: corpus.ID,
		Query:    "anything",
		Mode:     "semantic-ish",
	}); err == nil {
		t.Fatal("expected invalid search mode to be rejected")
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
	resp, err := env.knowledge.Search(context.Background(), env.adminPrincipal, SearchParams{CorpusID: corpus.ID, Query: "refunds"})
	if err != nil {
		t.Fatalf("search after detach: %v", err)
	}
	if len(resp.Results) != 0 {
		t.Fatalf("expected detached file chunks to be removed from search results, got %+v", resp.Results)
	}
}
