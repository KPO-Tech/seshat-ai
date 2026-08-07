package knowledge

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"gorm.io/gorm"

	sdkrag "github.com/KPO-Tech/seshat/pkg/rag"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// EnqueueIngest explicitly (re-)queues ingestion for an already-uploaded
// file — the fallback for when UploadFile's best-effort auto-enqueue job
// creation failed, or a caller wants to force a fresh pass (e.g. an
// embedder was just configured and existing vectorless chunks should be
// upgraded to real vectors — Ingest upserts by deterministic key, so this
// replaces them in place rather than duplicating). Requires
// knowledge.manage or organization.manage.
func (s *Service) EnqueueIngest(ctx context.Context, principal *iam.Principal, corpusID, fileID string) (*IngestionJob, error) {
	corpus, err := s.mustLoadCorpus(ctx, principal, corpusID, "knowledge.manage", "organization.manage")
	if err != nil {
		return nil, err
	}
	var file sdb.CorpusFile
	if err := s.db.Gorm().WithContext(ctx).First(&file, "id = ? AND corpus_id = ?", strings.TrimSpace(fileID), corpus.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("corpus file not found")
		}
		return nil, err
	}
	return s.enqueueIngestionJob(ctx, corpus.OrganizationID, corpus.ID, file.ID, file.Filename)
}

// enqueueIngestionJob creates a queued job unless one is already
// queued/running for this file, so re-uploads or repeated retry calls
// don't pile up duplicate work.
func (s *Service) enqueueIngestionJob(ctx context.Context, organizationID, corpusID, corpusFileID, filename string) (*IngestionJob, error) {
	var existing sdb.KnowledgeIngestionJob
	err := s.db.Gorm().WithContext(ctx).
		Where("corpus_file_id = ? AND status IN ?", corpusFileID, []string{IngestionJobStatusQueued, IngestionJobStatusRunning}).
		First(&existing).Error
	if err == nil {
		job := toIngestionJob(existing)
		return &job, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	jobID, err := newID("ingest")
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	record := sdb.KnowledgeIngestionJob{
		ID:             jobID,
		CorpusID:       corpusID,
		CorpusFileID:   corpusFileID,
		OrganizationID: organizationID,
		Filename:       filename,
		Status:         IngestionJobStatusQueued,
		MaxAttempts:    defaultIngestionMaxAttempts,
		NextRunAt:      &now,
	}
	if err := s.db.Gorm().WithContext(ctx).Create(&record).Error; err != nil {
		return nil, err
	}
	job := toIngestionJob(record)
	return &job, nil
}

// ListIngestionJobs returns every ingestion job for a corpus, newest first.
func (s *Service) ListIngestionJobs(ctx context.Context, principal *iam.Principal, corpusID string) ([]IngestionJob, error) {
	corpus, err := s.mustLoadCorpus(ctx, principal, corpusID, "knowledge.read", "knowledge.manage", "organization.manage")
	if err != nil {
		return nil, err
	}
	var records []sdb.KnowledgeIngestionJob
	if err := s.db.Gorm().WithContext(ctx).Where("corpus_id = ?", corpus.ID).Order("created_at desc").Find(&records).Error; err != nil {
		return nil, err
	}
	jobs := make([]IngestionJob, 0, len(records))
	for _, record := range records {
		jobs = append(jobs, toIngestionJob(record))
	}
	return jobs, nil
}

func (s *Service) GetIngestionJob(ctx context.Context, principal *iam.Principal, corpusID, jobID string) (*IngestionJob, error) {
	corpus, err := s.mustLoadCorpus(ctx, principal, corpusID, "knowledge.read", "knowledge.manage", "organization.manage")
	if err != nil {
		return nil, err
	}
	var record sdb.KnowledgeIngestionJob
	if err := s.db.Gorm().WithContext(ctx).First(&record, "id = ? AND corpus_id = ?", strings.TrimSpace(jobID), corpus.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("ingestion job not found")
		}
		return nil, err
	}
	job := toIngestionJob(record)
	return &job, nil
}

// RetryIngestionJob resets a failed job back to queued. Requires
// knowledge.manage or organization.manage.
func (s *Service) RetryIngestionJob(ctx context.Context, principal *iam.Principal, corpusID, jobID string) (*IngestionJob, error) {
	corpus, err := s.mustLoadCorpus(ctx, principal, corpusID, "knowledge.manage", "organization.manage")
	if err != nil {
		return nil, err
	}
	var record sdb.KnowledgeIngestionJob
	if err := s.db.Gorm().WithContext(ctx).First(&record, "id = ? AND corpus_id = ?", strings.TrimSpace(jobID), corpus.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("ingestion job not found")
		}
		return nil, err
	}
	if record.Status != IngestionJobStatusFailed {
		return nil, ErrInvalidInput("only failed ingestion jobs can be retried")
	}
	now := time.Now().UTC()
	record.Status = IngestionJobStatusQueued
	record.NextRunAt = &now
	record.LastError = ""
	if err := s.db.Gorm().WithContext(ctx).Model(&sdb.KnowledgeIngestionJob{}).Where("id = ?", record.ID).
		Updates(map[string]any{"status": record.Status, "next_run_at": record.NextRunAt, "last_error": ""}).Error; err != nil {
		return nil, err
	}
	job := toIngestionJob(record)
	return &job, nil
}

// Search embeds the query and returns the top-K matching chunks from the
// corpus. Requires knowledge.read/knowledge.manage or organization.manage.
func (s *Service) Search(ctx context.Context, principal *iam.Principal, params SearchParams) (*sdkrag.SearchResponse, error) {
	corpus, err := s.mustLoadCorpus(ctx, principal, params.CorpusID, "knowledge.read", "knowledge.manage", "organization.manage")
	if err != nil {
		return nil, err
	}
	ragService, ok, err := s.ragServiceFor(ctx, corpus.OrganizationID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInvalidInput("no embedder configured (neither this organization nor the platform default — see the embedder-settings endpoints)")
	}
	query := strings.TrimSpace(params.Query)
	if query == "" {
		return nil, ErrInvalidInput("query is required")
	}
	topK := params.TopK
	if topK <= 0 {
		topK = 5
	}
	resp, err := ragService.Search(ctx, sdkrag.SearchRequest{CorpusID: corpus.ID, Query: query, TopK: topK})
	if err != nil {
		return nil, ErrInvalidInput("search corpus: " + err.Error())
	}
	return &resp, nil
}

// ─── Ingestion worker (called by Runner; see runner.go) ──────────────────

// ProcessNextIngestionJob claims and processes one due ingestion job.
// Returns false when there is nothing to do right now. Single-instance
// only, same caveat as automation.Scheduler's run-queuing: running more
// than one seshat-server process with the knowledge runner enabled could
// double-claim work.
func (s *Service) ProcessNextIngestionJob(ctx context.Context) (bool, error) {
	if s.artifacts == nil {
		return false, nil
	}
	job, ok, err := s.claimNextIngestionJob(ctx)
	if err != nil {
		return false, err
	}
	if !ok {
		return false, nil
	}
	s.processIngestionJob(ctx, job)
	return true, nil
}

func (s *Service) claimNextIngestionJob(ctx context.Context) (sdb.KnowledgeIngestionJob, bool, error) {
	now := time.Now().UTC()
	staleBefore := now.Add(-defaultStaleJobTimeout)

	var job sdb.KnowledgeIngestionJob
	err := s.db.Gorm().WithContext(ctx).
		Where("status = ? AND (next_run_at IS NULL OR next_run_at <= ?)", IngestionJobStatusQueued, now).
		Or("status = ? AND started_at <= ?", IngestionJobStatusRunning, staleBefore).
		Order("created_at asc").
		First(&job).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return sdb.KnowledgeIngestionJob{}, false, nil
		}
		return sdb.KnowledgeIngestionJob{}, false, err
	}

	claim := s.db.Gorm().WithContext(ctx).Model(&sdb.KnowledgeIngestionJob{}).
		Where("id = ? AND status = ?", job.ID, job.Status).
		Updates(map[string]any{"status": IngestionJobStatusRunning, "started_at": now})
	if claim.Error != nil {
		return sdb.KnowledgeIngestionJob{}, false, claim.Error
	}
	if claim.RowsAffected == 0 {
		return sdb.KnowledgeIngestionJob{}, false, nil // claimed by a concurrent tick
	}
	job.Status = IngestionJobStatusRunning
	job.StartedAt = &now
	return job, true, nil
}

func (s *Service) processIngestionJob(ctx context.Context, job sdb.KnowledgeIngestionJob) {
	// ragServiceFor's bool return is always true when err is nil (a vector
	// store is required at construction, an embedder is not — see its own
	// doc comment); vectorless ingestion is deliberate, not a fallback for
	// this case failing.
	ragService, _, err := s.ragServiceFor(ctx, job.OrganizationID)
	if err != nil {
		s.markIngestionJobFailed(ctx, job, "resolve embedder: "+err.Error())
		return
	}

	var file sdb.CorpusFile
	if err := s.db.Gorm().WithContext(ctx).First(&file, "id = ?", job.CorpusFileID).Error; err != nil {
		s.markIngestionJobFailed(ctx, job, "corpus file no longer exists")
		return
	}

	data, err := s.artifacts.Get(ctx, file.StorageKey)
	if err != nil {
		s.failCorpusFile(ctx, file)
		s.markIngestionJobFailed(ctx, job, "read file blob: "+err.Error())
		return
	}

	text := s.extractTextWithDocling(ctx, data, file.ContentType, file.Filename)
	if strings.TrimSpace(text) == "" {
		s.failCorpusFile(ctx, file)
		s.markIngestionJobFailed(ctx, job, "file has no extractable text content")
		return
	}

	// Deterministic per-file key (not the storage key) so chunk keys stay
	// stable across corpora even if a future feature reuses blobs.
	ragFileKey := fmt.Sprintf("file-%s", file.ID)
	result, err := ragService.Ingest(ctx, sdkrag.IngestRequest{
		CorpusID: job.CorpusID,
		FileID:   ragFileKey,
		Filename: file.Filename,
		Text:     text,
	})
	if err != nil {
		s.failCorpusFile(ctx, file)
		s.markIngestionJobFailed(ctx, job, "ingest chunks: "+err.Error())
		return
	}

	now := time.Now().UTC()
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		chunkDelta := result.Chunks - file.ChunkCount
		if err := tx.Model(&sdb.CorpusFile{}).Where("id = ?", file.ID).
			Updates(map[string]any{"status": CorpusFileStatusIngested, "chunk_count": result.Chunks, "ingested_at": now}).Error; err != nil {
			return err
		}
		if chunkDelta != 0 {
			if err := tx.Model(&sdb.Corpus{}).Where("id = ?", job.CorpusID).
				UpdateColumn("chunk_count", gorm.Expr("chunk_count + ?", chunkDelta)).Error; err != nil {
				return err
			}
		}
		return tx.Model(&sdb.KnowledgeIngestionJob{}).Where("id = ?", job.ID).
			Updates(map[string]any{"status": IngestionJobStatusCompleted, "completed_at": now, "chunk_count": result.Chunks}).Error
	})
	if err != nil {
		s.markIngestionJobFailed(ctx, job, "record ingestion result: "+err.Error())
	}
}

func (s *Service) failCorpusFile(ctx context.Context, file sdb.CorpusFile) {
	_ = s.db.Gorm().WithContext(ctx).Model(&sdb.CorpusFile{}).Where("id = ?", file.ID).
		Update("status", CorpusFileStatusFailed).Error
}

func (s *Service) markIngestionJobFailed(ctx context.Context, job sdb.KnowledgeIngestionJob, reason string) {
	attempts := job.AttemptCount + 1
	status := IngestionJobStatusFailed
	var nextRunAt *time.Time
	if attempts < job.MaxAttempts {
		status = IngestionJobStatusQueued
		at := time.Now().UTC().Add(defaultIngestionRetryDelay)
		nextRunAt = &at
	}
	_ = s.db.Gorm().WithContext(ctx).Model(&sdb.KnowledgeIngestionJob{}).Where("id = ?", job.ID).
		Updates(map[string]any{"status": status, "attempt_count": attempts, "last_error": reason, "next_run_at": nextRunAt}).Error
}

// extractTextWithDocling always routes binary formats (PDF, DOCX/PPTX/XLSX,
// audio, images, HTML, LaTeX - see doclingIngestExtensions) through docling,
// then falls back to plain-text extraction for everything else.
//
// Deliberately skips the native/dependency-free extraction shortcut used
// elsewhere (e.g. seshat-backend's ephemeral chat-attachment path): a
// corpus document lives in the knowledge base permanently and gets
// searched forever, so a page docling would have caught — a table whose
// row/column structure a plain-text extractor would scramble, a diagram, a
// scanned page — but a cheap text-density check missed is a silent,
// permanent loss. That's a cost worth avoiding entirely for RAG ingestion,
// even at the price of always paying docling's per-page layout-detection
// pass (see its standard PDF pipeline).
func (s *Service) extractTextWithDocling(ctx context.Context, data []byte, contentType, filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))

	if s.doclingClient != nil && doclingIngestExtensions[ext] && s.doclingClient.IsAvailable(ctx) {
		result, err := s.doclingClient.ConvertBytes(ctx, data, filename)
		if err == nil && strings.TrimSpace(result.Markdown) != "" {
			return result.Markdown
		}
		// Docling failed or returned empty — fall through to plain-text extraction.
	}
	return extractText(data, contentType)
}

// extractText attempts to extract UTF-8 text from the blob. Plain-text,
// JSON, XML and YAML content types are returned as-is; anything else is
// accepted only if it looks like mostly-printable text (Markdown, code,
// CSV, etc).
func extractText(data []byte, contentType string) string {
	ct := strings.ToLower(strings.TrimSpace(contentType))
	if strings.HasPrefix(ct, "text/") || ct == "application/json" || ct == "application/xml" || ct == "application/x-yaml" {
		return string(data)
	}
	text := string(data)
	if isPrintable(text) {
		return text
	}
	return ""
}

// isPrintable reports whether s looks like real text rather than binary
// data. utf8.ValidString is the load-bearing check: arbitrary binary (a
// PDF's compressed stream data, for instance) essentially never forms
// valid UTF-8 over any meaningful length, so this alone rejects almost all
// non-text blobs. Without it, ranging over an invalid byte sequence
// replaces each bad run with U+FFFD (>= 32), so the old "r >= 32" check
// scored raw binary as ~100% printable - this is exactly what let a raw,
// un-extracted PDF get silently indexed as "text" instead of the ingestion
// job failing. The printable-character ratio on top catches the rarer
// case of valid-but-not-really-text UTF-8 (e.g. mostly control characters).
func isPrintable(s string) bool {
	if len(s) == 0 || !utf8.ValidString(s) {
		return false
	}
	printable := 0
	total := 0
	for _, r := range s {
		total++
		if unicode.IsPrint(r) || r == '\n' || r == '\r' || r == '\t' {
			printable++
		}
	}
	return float64(printable)/float64(total) > 0.8
}
