package knowledge

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/EngineerProjects/nexus-engine/pkg/docling"
	"github.com/EngineerProjects/nexus-engine/pkg/rag"
	"github.com/EngineerProjects/nexus-engine/pkg/storage"
	backendauth "github.com/EngineerProjects/nexus-product/internal/auth"
	"github.com/EngineerProjects/nexus-product/internal/bkerr"
	"github.com/EngineerProjects/nexus-product/internal/db"
)

// doclingIngestExtensions lists file extensions whose binary content docling can
// convert to plain-text markdown for RAG chunking. PDF, Office formats, audio
// transcription, and images with OCR are all included.
var doclingIngestExtensions = map[string]bool{
	".pdf":  true,
	".docx": true,
	".pptx": true,
	".xlsx": true,
	".wav":  true,
	".mp3":  true,
	".html": true,
	".htm":  true,
	".tex":  true,
	".png":  true,
	".tiff": true,
	".tif":  true,
	".jpeg": true,
	".jpg":  true,
}

type Service struct {
	corpora       *db.CorpusStore
	files         *db.FileStore
	jobs          *db.KnowledgeIngestionJobStore
	artifacts     storage.ArtifactStore
	rag           *rag.Service
	doclingClient *docling.Client
}

func NewService(
	corpora *db.CorpusStore,
	files *db.FileStore,
	jobs *db.KnowledgeIngestionJobStore,
	artifacts storage.ArtifactStore,
	ragSvc *rag.Service,
) *Service {
	return &Service{
		corpora:   corpora,
		files:     files,
		jobs:      jobs,
		artifacts: artifacts,
		rag:       ragSvc,
	}
}

// WithDocling attaches a docling client so binary files (PDF, DOCX, PPTX, XLSX,
// audio, images) are converted to markdown before chunking and embedding.
func (s *Service) WithDocling(client *docling.Client) *Service {
	s.doclingClient = client
	return s
}

const (
	defaultIngestionMaxAttempts = 3
	defaultIngestionRetryDelay  = 2 * time.Second
	defaultStaleJobTimeout      = 10 * time.Minute
)

// ─── Corpus CRUD ──────────────────────────────────────────────────────────────

func (s *Service) CreateCorpus(ctx context.Context, principal *backendauth.Principal, params CreateCorpusParams) (*Corpus, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	if strings.TrimSpace(params.Name) == "" {
		return nil, bkerr.InvalidInput("corpus name is required", nil)
	}

	record, err := s.corpora.Create(ctx, db.CreateCorpusParams{
		UserID:      principal.User.ID,
		WorkspaceID: params.WorkspaceID,
		Name:        params.Name,
		Description: params.Description,
	})
	if err != nil {
		return nil, bkerr.Internal("create corpus: "+err.Error(), err)
	}
	return corpusFromDB(*record), nil
}

func (s *Service) GetCorpus(ctx context.Context, principal *backendauth.Principal, corpusID string) (*Corpus, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	record, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return nil, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, err
	}
	return corpusFromDB(*record), nil
}

func (s *Service) ListCorpora(ctx context.Context, principal *backendauth.Principal) ([]Corpus, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}

	var records []db.Corpus
	var err error
	if principal.HasRole("admin") {
		records, err = s.corpora.ListAll(ctx)
	} else {
		records, err = s.corpora.ListByUserID(ctx, principal.User.ID)
	}
	if err != nil {
		return nil, bkerr.Internal("list corpora: "+err.Error(), err)
	}

	result := make([]Corpus, 0, len(records))
	for _, r := range records {
		result = append(result, *corpusFromDB(r))
	}
	return result, nil
}

func (s *Service) DeleteCorpus(ctx context.Context, principal *backendauth.Principal, corpusID string) error {
	if s == nil || s.corpora == nil {
		return bkerr.Unavailable("knowledge store not configured", nil)
	}
	record, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return err
	}

	// Delete all vector records for this corpus namespace.
	if s.rag != nil {
		if err := s.rag.DeleteNamespace(ctx, corpusID); err != nil {
			fmt.Printf("[knowledge] DeleteCorpus: failed to delete vector namespace %s: %v\n", corpusID, err)
		}
	}

	// Remove all corpus_files records then the corpus itself.
	files, _ := s.corpora.ListFiles(ctx, corpusID)
	var fileCleanupFailed int
	for _, f := range files {
		if err := s.corpora.RemoveFile(ctx, corpusID, f.FileID); err != nil {
			fileCleanupFailed++
			fmt.Printf("[knowledge] DeleteCorpus: failed to remove file %s from corpus %s: %v\n", f.FileID, corpusID, err)
		}
	}
	if fileCleanupFailed > 0 {
		fmt.Printf("[knowledge] DeleteCorpus: %d/%d file records could not be cleaned up for corpus %s\n", fileCleanupFailed, len(files), corpusID)
	}
	if err := s.corpora.Delete(ctx, corpusID); err != nil {
		return bkerr.Internal("delete corpus: "+err.Error(), err)
	}
	return nil
}

// ─── Corpus files ─────────────────────────────────────────────────────────────

func (s *Service) AttachFile(ctx context.Context, principal *backendauth.Principal, corpusID, fileID string) (*CorpusFile, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	record, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return nil, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, err
	}

	// Verify the file exists and is accessible.
	fileRecord, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return nil, bkerr.NotFound("file not found", err)
	}
	if err := s.checkFileAccess(principal, fileRecord); err != nil {
		return nil, err
	}

	cf, err := s.corpora.AddFile(ctx, db.UpsertCorpusFileParams{
		CorpusID: corpusID,
		FileID:   fileID,
		Filename: fileRecord.Filename,
		Status:   db.CorpusFileStatusPending,
	})
	if err != nil {
		return nil, bkerr.Internal("attach file to corpus: "+err.Error(), err)
	}

	// Auto-enqueue an ingestion job when the service is fully configured.
	// Best-effort: a failure here does not fail the attach — the user can
	// always call POST /corpora/{id}/ingest explicitly as a fallback.
	if s.jobs != nil && s.rag != nil {
		if active, _ := s.jobs.FindActiveByCorpusFile(ctx, corpusID, fileID); active == nil {
			_, _ = s.jobs.Create(ctx, db.CreateKnowledgeIngestionJobParams{
				CorpusID:    corpusID,
				FileID:      fileID,
				UserID:      principal.User.ID,
				WorkspaceID: record.WorkspaceID,
				Filename:    fileRecord.Filename,
				MaxAttempts: defaultIngestionMaxAttempts,
			})
		}
	}

	return corpusFileFromDB(*cf), nil
}

func (s *Service) ListFiles(ctx context.Context, principal *backendauth.Principal, corpusID string) ([]CorpusFile, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	record, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return nil, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, err
	}
	rows, err := s.corpora.ListFiles(ctx, corpusID)
	if err != nil {
		return nil, bkerr.Internal("list corpus files: "+err.Error(), err)
	}
	result := make([]CorpusFile, 0, len(rows))
	for _, r := range rows {
		result = append(result, *corpusFileFromDB(r))
	}
	return result, nil
}

func (s *Service) DetachFile(ctx context.Context, principal *backendauth.Principal, corpusID, fileID string) error {
	if s == nil || s.corpora == nil {
		return bkerr.Unavailable("knowledge store not configured", nil)
	}
	record, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return err
	}
	corpusFile, err := s.corpora.GetFile(ctx, corpusID, fileID)
	if err != nil {
		return bkerr.NotFound("corpus file not found", err)
	}
	if corpusFile.ChunkCount > 0 && s.rag != nil {
		artifactKey := fmt.Sprintf("rag/%s/%s", corpusID, fileID)
		if err := s.rag.DeleteFileChunks(ctx, corpusID, artifactKey, 0, corpusFile.ChunkCount); err != nil {
			return bkerr.Internal("delete corpus file vectors: "+err.Error(), err)
		}
	}
	if err := s.corpora.RemoveFileAndAdjustChunks(ctx, corpusID, fileID, corpusFile.ChunkCount); err != nil {
		if strings.Contains(err.Error(), "not found") {
			return bkerr.NotFound("corpus file not found", err)
		}
		return bkerr.Internal("detach file from corpus: "+err.Error(), err)
	}
	return nil
}

// ─── Ingest & Search ──────────────────────────────────────────────────────────

func (s *Service) EnqueueIngest(ctx context.Context, principal *backendauth.Principal, params IngestParams) (*IngestionJob, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if s.jobs == nil {
		return nil, bkerr.Unavailable("ingestion job store not configured", nil)
	}
	if s.files == nil {
		return nil, bkerr.Unavailable("file store not configured", nil)
	}
	if s.rag == nil {
		return nil, bkerr.Unavailable("RAG service not configured (embedder required)", nil)
	}
	if s.artifacts == nil {
		return nil, bkerr.Unavailable("artifact store not configured", nil)
	}

	corpus, fileRecord, err := s.loadIngestInputs(ctx, principal, params)
	if err != nil {
		return nil, err
	}

	if active, err := s.jobs.FindActiveByCorpusFile(ctx, params.CorpusID, params.FileID); err != nil {
		return nil, bkerr.Internal("find active ingestion job: "+err.Error(), err)
	} else if active != nil {
		return ingestionJobFromDB(*active), nil
	}

	_, _ = s.corpora.AddFile(ctx, db.UpsertCorpusFileParams{
		CorpusID: params.CorpusID,
		FileID:   params.FileID,
		Filename: fileRecord.Filename,
		Status:   db.CorpusFileStatusPending,
	})

	job, err := s.jobs.Create(ctx, db.CreateKnowledgeIngestionJobParams{
		CorpusID:    params.CorpusID,
		FileID:      params.FileID,
		UserID:      corpus.UserID,
		WorkspaceID: corpus.WorkspaceID,
		Filename:    fileRecord.Filename,
		MaxAttempts: defaultIngestionMaxAttempts,
	})
	if err != nil {
		return nil, bkerr.Internal("create ingestion job: "+err.Error(), err)
	}
	return ingestionJobFromDB(*job), nil
}

func (s *Service) ListIngestionJobs(ctx context.Context, principal *backendauth.Principal, corpusID string) ([]IngestionJob, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if s.jobs == nil {
		return nil, bkerr.Unavailable("ingestion job store not configured", nil)
	}
	record, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return nil, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, err
	}
	rows, err := s.jobs.ListByCorpusID(ctx, corpusID)
	if err != nil {
		return nil, bkerr.Internal("list ingestion jobs: "+err.Error(), err)
	}
	result := make([]IngestionJob, 0, len(rows))
	for _, row := range rows {
		result = append(result, *ingestionJobFromDB(row))
	}
	return result, nil
}

func (s *Service) GetIngestionJob(ctx context.Context, principal *backendauth.Principal, corpusID, jobID string) (*IngestionJob, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if s.jobs == nil {
		return nil, bkerr.Unavailable("ingestion job store not configured", nil)
	}
	record, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return nil, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, err
	}
	job, err := s.jobs.GetByID(ctx, jobID)
	if err != nil {
		return nil, bkerr.NotFound("ingestion job not found", err)
	}
	if job.CorpusID != corpusID {
		return nil, bkerr.NotFound("ingestion job not found", nil)
	}
	return ingestionJobFromDB(*job), nil
}

func (s *Service) RetryIngestionJob(ctx context.Context, principal *backendauth.Principal, corpusID, jobID string) (*IngestionJob, error) {
	job, err := s.GetIngestionJob(ctx, principal, corpusID, jobID)
	if err != nil {
		return nil, err
	}
	if job.Status != db.IngestionJobStatusFailed {
		return nil, bkerr.InvalidInput("only failed ingestion jobs can be retried", nil)
	}
	reset, err := s.jobs.ResetForRetry(ctx, jobID)
	if err != nil {
		return nil, bkerr.Internal("retry ingestion job: "+err.Error(), err)
	}
	return ingestionJobFromDB(*reset), nil
}

// Ingest reads a file from ArtifactStore, chunks+embeds the text, and upserts
// into the vector namespace for the corpus. Requires RAG service to be configured.
func (s *Service) Ingest(ctx context.Context, principal *backendauth.Principal, params IngestParams) (*CorpusFile, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if s.rag == nil {
		return nil, bkerr.Unavailable("RAG service not configured (embedder required)", nil)
	}
	if s.artifacts == nil {
		return nil, bkerr.Unavailable("artifact store not configured", nil)
	}

	_, fileRecord, err := s.loadIngestInputs(ctx, principal, params)
	if err != nil {
		return nil, err
	}

	// Mark as pending (or ensure attached).
	_, _ = s.corpora.AddFile(ctx, db.UpsertCorpusFileParams{
		CorpusID: params.CorpusID,
		FileID:   params.FileID,
		Filename: fileRecord.Filename,
		Status:   db.CorpusFileStatusPending,
	})

	cf, _, err := s.ingestFile(ctx, params.CorpusID, fileRecord)
	if err != nil {
		return nil, err
	}
	return cf, nil
}

// Search embeds the query and returns the top-K matching chunks from the corpus.
func (s *Service) Search(ctx context.Context, principal *backendauth.Principal, params SearchParams) (*rag.SearchResponse, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if s.rag == nil {
		return nil, bkerr.Unavailable("RAG service not configured (embedder required)", nil)
	}

	record, err := s.corpora.GetByID(ctx, params.CorpusID)
	if err != nil {
		return nil, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, err
	}

	topK := params.TopK
	if topK <= 0 {
		topK = 5
	}
	resp, err := s.rag.Search(ctx, rag.SearchRequest{
		CorpusID: params.CorpusID,
		Query:    params.Query,
		TopK:     topK,
	})
	if err != nil {
		return nil, bkerr.Internal("search corpus: "+err.Error(), err)
	}
	return &resp, nil
}

func (s *Service) ProcessNextIngestionJob(ctx context.Context) (bool, error) {
	if s == nil || s.jobs == nil || s.corpora == nil || s.files == nil || s.rag == nil || s.artifacts == nil {
		return false, nil
	}
	job, err := s.jobs.ClaimNextDue(ctx, defaultStaleJobTimeout)
	if err != nil {
		return false, bkerr.Internal("claim ingestion job: "+err.Error(), err)
	}
	if job == nil {
		return false, nil
	}
	s.processIngestionJob(ctx, *job)
	return true, nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func (s *Service) processIngestionJob(ctx context.Context, job db.KnowledgeIngestionJob) {
	if _, err := s.corpora.GetFile(ctx, job.CorpusID, job.FileID); err != nil {
		_ = s.jobs.MarkSkipped(ctx, job.ID, "corpus file detached before ingestion")
		return
	}

	fileRecord, err := s.files.GetByID(ctx, job.FileID)
	if err != nil {
		_ = s.corpora.UpdateFileStatus(ctx, job.CorpusID, job.FileID, db.CorpusFileStatusFailed, 0)
		_ = s.jobs.MarkFailed(ctx, job, err, defaultIngestionRetryDelay)
		return
	}

	_, chunks, err := s.ingestFile(ctx, job.CorpusID, fileRecord)
	if err != nil {
		_ = s.jobs.MarkFailed(ctx, job, err, defaultIngestionRetryDelay)
		return
	}
	_ = s.jobs.MarkCompleted(ctx, job.ID, chunks)
}

func (s *Service) loadIngestInputs(ctx context.Context, principal *backendauth.Principal, params IngestParams) (*db.Corpus, *db.File, error) {
	record, err := s.corpora.GetByID(ctx, params.CorpusID)
	if err != nil {
		return nil, nil, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, nil, err
	}

	fileRecord, err := s.files.GetByID(ctx, params.FileID)
	if err != nil {
		return nil, nil, bkerr.NotFound("file not found", err)
	}
	if err := s.checkFileAccess(principal, fileRecord); err != nil {
		return nil, nil, err
	}
	return record, fileRecord, nil
}

func (s *Service) ingestFile(ctx context.Context, corpusID string, fileRecord *db.File) (*CorpusFile, int, error) {
	// Record the previous chunk count so we can compute a delta and clean up stale vectors
	// when a re-ingest produces fewer chunks than the previous run.
	oldChunkCount := 0
	if existing, err := s.corpora.GetFile(ctx, corpusID, fileRecord.ID); err == nil {
		oldChunkCount = existing.ChunkCount
	}

	data, err := s.artifacts.Get(ctx, fileRecord.StorageKey)
	if err != nil {
		_ = s.corpora.UpdateFileStatus(ctx, corpusID, fileRecord.ID, db.CorpusFileStatusFailed, 0)
		return nil, 0, bkerr.Internal(fmt.Sprintf("read file blob: %s", err.Error()), err)
	}

	text := s.extractTextWithDocling(ctx, data, fileRecord.ContentType, fileRecord.Filename)
	if strings.TrimSpace(text) == "" {
		_ = s.corpora.UpdateFileStatus(ctx, corpusID, fileRecord.ID, db.CorpusFileStatusFailed, 0)
		return nil, 0, bkerr.InvalidInput("file has no extractable text content", nil)
	}

	result, err := s.rag.Ingest(ctx, rag.IngestRequest{
		CorpusID: corpusID,
		FileID:   fileRecord.ID, // deterministic artifact key — prevents duplicate vectors on re-ingest
		Filename: fileRecord.Filename,
		Text:     text,
	})
	if err != nil {
		_ = s.corpora.UpdateFileStatus(ctx, corpusID, fileRecord.ID, db.CorpusFileStatusFailed, 0)
		return nil, 0, bkerr.Internal("ingest chunks: "+err.Error(), err)
	}

	// Remove stale chunk vectors when a re-ingest produced fewer chunks than the prior run.
	// Chunk keys follow "rag/{corpusID}/{fileID}#chunk-{i}" (set by rag.Service when FileID is given).
	if oldChunkCount > result.Chunks {
		artifactKey := fmt.Sprintf("rag/%s/%s", corpusID, fileRecord.ID)
		_ = s.rag.DeleteFileChunks(ctx, corpusID, artifactKey, result.Chunks, oldChunkCount)
	}

	_ = s.corpora.UpdateFileStatus(ctx, corpusID, fileRecord.ID, db.CorpusFileStatusIngested, result.Chunks)

	// Use delta so re-ingesting a file doesn't double-count its chunks in the corpus total.
	chunkDelta := result.Chunks - oldChunkCount
	if chunkDelta != 0 {
		_ = s.corpora.IncrementChunkCount(ctx, corpusID, chunkDelta)
	}

	cf, err := s.corpora.GetFile(ctx, corpusID, fileRecord.ID)
	if err != nil {
		return nil, 0, bkerr.Internal("get corpus file: "+err.Error(), err)
	}
	return corpusFileFromDB(*cf), result.Chunks, nil
}

func (s *Service) checkAccess(principal *backendauth.Principal, corpus *db.Corpus) error {
	if principal == nil {
		return bkerr.Unauthorized("authentication required", nil)
	}
	if principal.HasRole("admin") {
		return nil
	}
	if corpus.UserID != principal.User.ID {
		return bkerr.Forbidden("corpus belongs to another user", nil)
	}
	return nil
}

func (s *Service) checkFileAccess(principal *backendauth.Principal, fileRecord *db.File) error {
	if principal == nil {
		return bkerr.Unauthorized("authentication required", nil)
	}
	if principal.HasRole("admin") {
		return nil
	}
	if fileRecord.UserID != principal.User.ID {
		return bkerr.Forbidden("file belongs to another user", nil)
	}
	return nil
}

// extractTextWithDocling tries docling first for binary formats, then falls back
// to plain-text extraction. Docling converts PDF, DOCX, PPTX, XLSX, audio, and
// images to markdown, which the chunker can then split into vector records.
func (s *Service) extractTextWithDocling(ctx context.Context, data []byte, contentType, filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	if s.doclingClient != nil && doclingIngestExtensions[ext] && s.doclingClient.IsAvailable(ctx) {
		result, err := s.doclingClient.ConvertBytes(ctx, data, filename)
		if err == nil && strings.TrimSpace(result.Markdown) != "" {
			return result.Markdown
		}
		// Docling failed or returned empty — fall through to plain-text extraction.
	}
	return extractText(data, contentType, filename)
}

// extractText attempts to extract UTF-8 text from the blob.
// For plain text content types it returns the raw bytes; otherwise it tries
// a best-effort conversion.
func extractText(data []byte, contentType, _ string) string {
	ct := strings.ToLower(strings.TrimSpace(contentType))
	if strings.HasPrefix(ct, "text/") ||
		ct == "application/json" ||
		ct == "application/xml" ||
		ct == "application/x-yaml" {
		return string(data)
	}
	// Best-effort: assume UTF-8 printable content (Markdown, code files, etc.)
	text := string(data)
	if isPrintable(text) {
		return text
	}
	return ""
}

func isPrintable(s string) bool {
	if len(s) == 0 {
		return false
	}
	printable := 0
	for _, r := range s {
		if r >= 32 || r == '\n' || r == '\r' || r == '\t' {
			printable++
		}
	}
	return float64(printable)/float64(len([]rune(s))) > 0.8
}

func corpusFromDB(r db.Corpus) *Corpus {
	return &Corpus{
		ID:          r.ID,
		UserID:      r.UserID,
		WorkspaceID: r.WorkspaceID,
		Name:        r.Name,
		Description: r.Description,
		ChunkCount:  r.ChunkCount,
		CreatedAt:   r.CreatedAt,
		UpdatedAt:   r.UpdatedAt,
	}
}

func corpusFileFromDB(r db.CorpusFile) *CorpusFile {
	return &CorpusFile{
		CorpusID:   r.CorpusID,
		FileID:     r.FileID,
		Filename:   r.Filename,
		Status:     r.Status,
		ChunkCount: r.ChunkCount,
		IngestedAt: r.IngestedAt,
		CreatedAt:  r.CreatedAt,
	}
}

func ingestionJobFromDB(r db.KnowledgeIngestionJob) *IngestionJob {
	return &IngestionJob{
		ID:           r.ID,
		CorpusID:     r.CorpusID,
		FileID:       r.FileID,
		UserID:       r.UserID,
		WorkspaceID:  r.WorkspaceID,
		Filename:     r.Filename,
		Status:       r.Status,
		AttemptCount: r.AttemptCount,
		MaxAttempts:  r.MaxAttempts,
		ChunkCount:   r.ChunkCount,
		LastError:    r.LastError,
		ErrorLog:     r.ErrorLog,
		NextRunAt:    r.NextRunAt,
		StartedAt:    r.StartedAt,
		CompletedAt:  r.CompletedAt,
		CreatedAt:    r.CreatedAt,
		UpdatedAt:    r.UpdatedAt,
	}
}
