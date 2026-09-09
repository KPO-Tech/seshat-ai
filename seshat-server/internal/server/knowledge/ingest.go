package knowledge

import (
	"context"
	"errors"
	"fmt"
	"math"
	"path/filepath"
	"strconv"
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
		Updates(map[string]any{
			"status":              record.Status,
			"next_run_at":         record.NextRunAt,
			"last_error":          "",
			"failure_stage":       "",
			"started_at":          nil,
			"completed_at":        nil,
			"read_duration_ms":    0,
			"extract_duration_ms": 0,
			"ingest_duration_ms":  0,
			"total_duration_ms":   0,
		}).Error; err != nil {
		return nil, err
	}
	job := toIngestionJob(record)
	return &job, nil
}

// Search returns the top-K matching chunks from the corpus, enriched with
// corpus-file context for product/UI citation surfaces. Requires
// knowledge.read/knowledge.manage or organization.manage.
func (s *Service) Search(ctx context.Context, principal *iam.Principal, params SearchParams) (*SearchResponse, error) {
	startedAt := time.Now()
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
	mode, hybridWeight, err := normalizeSearchMode(params.Mode)
	if err != nil {
		return nil, err
	}
	topK := params.TopK
	if topK <= 0 {
		topK = 5
	}
	resp, err := ragService.Search(ctx, sdkrag.SearchRequest{
		CorpusID:     corpus.ID,
		Query:        query,
		TopK:         topK,
		HybridWeight: hybridWeight,
	})
	if err != nil {
		return nil, ErrInvalidInput("search corpus: " + err.Error())
	}
	enriched, err := s.enrichSearchResponse(ctx, *corpus, query, mode, topK, resp.Results)
	if err != nil {
		return nil, err
	}
	event, err := s.recordSearchEvent(ctx, principal, *corpus, enriched, time.Since(startedAt))
	if err != nil {
		return nil, err
	}
	if event != nil {
		enriched.SearchID = event.ID
	}
	return enriched, nil
}

func normalizeSearchMode(mode string) (string, float32, error) {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "", SearchModeHybrid, "blend":
		return SearchModeHybrid, defaultHybridSearchWeight, nil
	case SearchModeKeyword, "keywords":
		return SearchModeKeyword, 1, nil
	case SearchModeVector, "embedding":
		return SearchModeVector, 0, nil
	default:
		return "", 0, ErrInvalidInput("search mode must be keyword, vector or hybrid")
	}
}

func (s *Service) enrichSearchResponse(ctx context.Context, corpus sdb.Corpus, query, mode string, topK int, raw []sdkrag.SearchResult) (*SearchResponse, error) {
	files, err := s.searchFilesByResult(ctx, corpus.ID, raw)
	if err != nil {
		return nil, err
	}
	results := make([]SearchResult, 0, len(raw))
	for _, hit := range raw {
		metadata := copyMetadata(hit.Metadata)
		fileID := fileIDFromRAGMetadata(corpus.ID, hit.Key, metadata)
		position := intFromMetadata(metadata, "position")
		result := SearchResult{
			Key:      hit.Key,
			Text:     hit.Text,
			Score:    hit.Score,
			Position: position,
			Metadata: metadata,
			Citation: &SearchCitation{
				CorpusID:    corpus.ID,
				Position:    position,
				ArtifactKey: metadata["artifact_key"],
			},
		}
		if file, ok := files[fileID]; ok {
			result.CorpusFileID = file.ID
			result.Filename = file.Filename
			result.ContentType = file.ContentType
			result.Source = "upload"
			result.Tags = cloneStringSlice(file.Tags)
			result.FileMetadata = cloneStringMap(file.Metadata)
			if file.ConnectorAccountID != nil {
				result.Source = "connector"
				result.ConnectorAccountID = file.ConnectorAccountID
				result.ExternalResourceID = file.ExternalResourceID
			}
			result.Citation.CorpusFileID = file.ID
			result.Citation.Filename = file.Filename
		} else if filename := strings.TrimSpace(metadata["filename"]); filename != "" {
			result.Filename = filename
			result.Citation.Filename = filename
		}
		results = append(results, result)
	}
	return &SearchResponse{CorpusID: corpus.ID, Query: query, Mode: mode, TopK: topK, Results: results}, nil
}

func (s *Service) searchFilesByResult(ctx context.Context, corpusID string, raw []sdkrag.SearchResult) (map[string]sdb.CorpusFile, error) {
	ids := make([]string, 0, len(raw))
	seen := map[string]bool{}
	for _, hit := range raw {
		id := fileIDFromRAGMetadata(corpusID, hit.Key, hit.Metadata)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return map[string]sdb.CorpusFile{}, nil
	}
	var records []sdb.CorpusFile
	if err := s.db.Gorm().WithContext(ctx).Where("corpus_id = ? AND id IN ?", corpusID, ids).Find(&records).Error; err != nil {
		return nil, err
	}
	files := make(map[string]sdb.CorpusFile, len(records))
	for _, record := range records {
		files[record.ID] = record
	}
	return files, nil
}

func fileIDFromRAGMetadata(corpusID, key string, metadata map[string]string) string {
	if metadata != nil {
		if artifactKey := strings.TrimSpace(metadata["artifact_key"]); artifactKey != "" {
			if id := fileIDFromArtifactKey(corpusID, artifactKey); id != "" {
				return id
			}
		}
	}
	if beforeChunk, _, ok := strings.Cut(key, "#chunk-"); ok {
		return fileIDFromArtifactKey(corpusID, beforeChunk)
	}
	return ""
}

func fileIDFromArtifactKey(corpusID, artifactKey string) string {
	prefix := fmt.Sprintf("rag/%s/file-", corpusID)
	if !strings.HasPrefix(artifactKey, prefix) {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(artifactKey, prefix))
}

func copyMetadata(metadata map[string]string) map[string]string {
	if len(metadata) == 0 {
		return nil
	}
	copied := make(map[string]string, len(metadata))
	for key, value := range metadata {
		copied[key] = value
	}
	return copied
}

func intFromMetadata(metadata map[string]string, key string) int {
	if metadata == nil {
		return 0
	}
	value, err := strconv.Atoi(strings.TrimSpace(metadata[key]))
	if err != nil {
		return 0
	}
	return value
}

// ─── Ingestion worker (called by Runner; see runner.go) ──────────────────

// ProcessNextIngestionJob claims and processes one due ingestion job.
// Returns false when there is nothing to do right now. Safe to run on more
// than one seshat-server process concurrently: claimNextIngestionJob's
// claim is a conditional UPDATE ... WHERE status = <expected>, checked via
// RowsAffected, not a plain read-then-write — a concurrent instance racing
// the same job simply fails to claim it (RowsAffected 0) instead of
// double-processing it. Same idiom as automation.Scheduler's
// queueAndReschedule/failStaleRun/executeCloudRun.
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
	started := time.Now()
	metrics := ingestionRunMetrics{}
	fail := func(stage, reason string) {
		metrics.TotalDuration = time.Since(started)
		s.markIngestionJobFailed(ctx, job, stage, reason, metrics)
	}

	// ragServiceFor's bool return is always true when err is nil (a vector
	// store is required at construction, an embedder is not — see its own
	// doc comment); vectorless ingestion is deliberate, not a fallback for
	// this case failing.
	ragService, _, err := s.ragServiceFor(ctx, job.OrganizationID)
	if err != nil {
		fail("resolve_embedder", "resolve embedder: "+err.Error())
		return
	}

	var file sdb.CorpusFile
	if err := s.db.Gorm().WithContext(ctx).First(&file, "id = ?", job.CorpusFileID).Error; err != nil {
		fail("load_file", "corpus file no longer exists")
		return
	}
	metrics.ContentType = file.ContentType
	metrics.FileSize = file.Size
	metrics.ChunkProfile = string(s.chunkProfile.Name)

	readStarted := time.Now()
	data, err := s.artifacts.Get(ctx, file.StorageKey)
	metrics.ReadDuration = time.Since(readStarted)
	if err != nil {
		s.failCorpusFile(ctx, file)
		fail("read_blob", "read file blob: "+err.Error())
		return
	}
	metrics.SourceBytes = int64(len(data))
	if metrics.FileSize == 0 {
		metrics.FileSize = int64(len(data))
	}

	extractStarted := time.Now()
	text := extractText(data, file.ContentType)
	originalData := s.dataForRAGChunking(data, file.Filename)
	metrics.ExtractDuration = time.Since(extractStarted)
	metrics.TextChars = len([]rune(text))
	metrics.UsedDocling = len(originalData) > 0
	if strings.TrimSpace(text) == "" && len(originalData) == 0 {
		s.failCorpusFile(ctx, file)
		fail("extract_text", "file has no extractable text content")
		return
	}

	// Deterministic per-file key (not the storage key) so chunk keys stay
	// stable across corpora even if a future feature reuses blobs.
	ragFileKey := ragFileID(file.ID)
	ingestStarted := time.Now()
	result, err := ragService.Ingest(ctx, sdkrag.IngestRequest{
		CorpusID: job.CorpusID,
		FileID:   ragFileKey,
		Filename: file.Filename,
		Text:     text,
		Data:     originalData,
	})
	metrics.IngestDuration = time.Since(ingestStarted)
	if err != nil {
		s.failCorpusFile(ctx, file)
		fail("rag_ingest", "ingest chunks: "+err.Error())
		return
	}
	metrics.TotalDuration = time.Since(started)

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
		updates := ingestionMetricUpdates(metrics)
		updates["status"] = IngestionJobStatusCompleted
		updates["completed_at"] = now
		updates["chunk_count"] = result.Chunks
		updates["last_error"] = ""
		updates["failure_stage"] = ""
		return tx.Model(&sdb.KnowledgeIngestionJob{}).Where("id = ?", job.ID).Updates(updates).Error
	})
	if err != nil {
		fail("record_result", "record ingestion result: "+err.Error())
	}
}

func (s *Service) failCorpusFile(ctx context.Context, file sdb.CorpusFile) {
	_ = s.db.Gorm().WithContext(ctx).Model(&sdb.CorpusFile{}).Where("id = ?", file.ID).
		Update("status", CorpusFileStatusFailed).Error
}

func (s *Service) markIngestionJobFailed(ctx context.Context, job sdb.KnowledgeIngestionJob, stage, reason string, metrics ingestionRunMetrics) {
	attempts := job.AttemptCount + 1
	status := IngestionJobStatusFailed
	var nextRunAt *time.Time
	if attempts < job.MaxAttempts {
		status = IngestionJobStatusQueued
		at := time.Now().UTC().Add(defaultIngestionRetryDelay)
		nextRunAt = &at
	}
	updates := ingestionMetricUpdates(metrics)
	updates["status"] = status
	updates["attempt_count"] = attempts
	updates["last_error"] = reason
	updates["failure_stage"] = stage
	updates["next_run_at"] = nextRunAt
	_ = s.db.Gorm().WithContext(ctx).Model(&sdb.KnowledgeIngestionJob{}).Where("id = ?", job.ID).Updates(updates).Error
}

type ingestionRunMetrics struct {
	ContentType     string
	FileSize        int64
	TextChars       int
	SourceBytes     int64
	ChunkProfile    string
	UsedDocling     bool
	ReadDuration    time.Duration
	ExtractDuration time.Duration
	IngestDuration  time.Duration
	TotalDuration   time.Duration
}

func ingestionMetricUpdates(metrics ingestionRunMetrics) map[string]any {
	return map[string]any{
		"content_type":        metrics.ContentType,
		"file_size":           metrics.FileSize,
		"text_chars":          metrics.TextChars,
		"source_bytes":        metrics.SourceBytes,
		"chunk_profile":       metrics.ChunkProfile,
		"used_docling":        metrics.UsedDocling,
		"read_duration_ms":    durationMillis(metrics.ReadDuration),
		"extract_duration_ms": durationMillis(metrics.ExtractDuration),
		"ingest_duration_ms":  durationMillis(metrics.IngestDuration),
		"total_duration_ms":   durationMillis(metrics.TotalDuration),
	}
}

func durationMillis(d time.Duration) int64 {
	if d <= 0 {
		return 0
	}
	return int64(math.Ceil(float64(d) / float64(time.Millisecond)))
}

func (s *Service) dataForRAGChunking(data []byte, filename string) []byte {
	if s.chunker != nil && doclingIngestExtensions[strings.ToLower(filepath.Ext(filename))] {
		return data
	}
	return nil
}

func ragFileID(fileID string) string {
	return fmt.Sprintf("file-%s", fileID)
}

func ragArtifactKey(corpusID, fileID string) string {
	return sdkrag.ArtifactKey(corpusID, ragFileID(fileID))
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
