// Package knowledge owns the organization-scoped RAG knowledge base: named
// document collections (corpora), the files uploaded into them, and their
// async chunk+embed+vector-upsert ingestion pipeline.
//
// It is the multi-tenant equivalent of seshat-backend's internal/knowledge
// (per-user, single-tenant) — the domain model and ingestion flow are
// deliberately the same shape, adapted to organization scoping and this
// control plane's permission/audit conventions instead of duplicating the
// design from scratch. See ROADMAP.md's "Knowledge base / RAG domain"
// section for the full build order this is step 1 of.
package knowledge

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	sdkdocling "github.com/KPO-Tech/seshat/pkg/docling"
	sdkrag "github.com/KPO-Tech/seshat/pkg/rag"
	sdkembedder "github.com/KPO-Tech/seshat/pkg/rag/embedder"
	sdkreranker "github.com/KPO-Tech/seshat/pkg/rag/reranker"
	sdkstorage "github.com/KPO-Tech/seshat/pkg/storage"
	sdktextquality "github.com/KPO-Tech/seshat/pkg/textquality"
	sdkvector "github.com/KPO-Tech/seshat/pkg/vector"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/apperr"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

type Error = apperr.Error

func ErrInvalidInput(message string) error { return apperr.InvalidInput(message) }
func ErrUnauthorized(message string) error { return apperr.Unauthorized(message) }
func ErrForbidden(message string) error    { return apperr.Forbidden(message) }
func ErrConflict(message string) error     { return apperr.Conflict(message) }
func ErrNotFound(message string) error     { return apperr.NotFound(message) }

func newID(prefix string) (string, error) { return sdb.NewID(prefix) }

const (
	CorpusFileStatusPending  = "pending"
	CorpusFileStatusIngested = "ingested"
	CorpusFileStatusFailed   = "failed"

	IngestionJobStatusQueued    = "queued"
	IngestionJobStatusRunning   = "running"
	IngestionJobStatusCompleted = "completed"
	IngestionJobStatusFailed    = "failed"

	IngestionJobPhasePending    = "pending"
	IngestionJobPhaseProcessing = "processing"
	IngestionJobPhaseIndexed    = "indexed"
	IngestionJobPhaseFailed     = "failed"

	defaultIngestionMaxAttempts = 3
	defaultIngestionRetryDelay  = 2 * time.Second
	defaultStaleJobTimeout      = 10 * time.Minute

	// defaultHybridSearchWeight blends keyword (BM25/ts_rank) scoring into
	// vector search results - pure vector (0) means a chunk that never
	// literally mentions the query's own terms can still outrank one that
	// does, if it's merely topically similar. 0.3 keeps vector similarity
	// dominant while still rewarding literal term matches. Only the SQLite
	// and pgvector vector backends run real BM25/ts_rank for this (see
	// vector.Query.HybridWeight's doc); others fall back to a lightweight
	// keyword-overlap approximation - still strictly better than ignoring
	// keyword signal entirely.
	defaultHybridSearchWeight = 0.3
)

// Service owns corpora, corpus files, their ingestion jobs, and embedder
// configuration. There is deliberately no single fixed *rag.Service field:
// the hybrid BYOK/platform-default embedder model means the embedder used
// for a given call depends on which organization it's for, so a
// rag.Service is built ad hoc per call (see ragServiceFor) from the shared
// vector store plus whichever embedder resolveEmbedder finds for that
// organization — rag.NewService is a cheap struct literal, not an
// expensive connection, so building it per call costs nothing real.
// Ingest/Search degrade gracefully with a clear "not configured" error when
// neither the organization nor the platform has an embedder configured
// yet, same as seshat-backend's knowledge service does when no embedder is
// set at all.
type Service struct {
	db            *sdb.DB
	iam           *iam.Service
	artifacts     sdkstorage.ArtifactStore
	vectors       sdkvector.Store
	doclingClient *sdkdocling.Client // nil = no binary-format conversion
	chunker       sdkrag.Chunker
	chunkProfile  sdkrag.ChunkProfile
}

func New(database *sdb.DB, iamService *iam.Service, artifacts sdkstorage.ArtifactStore, vectors sdkvector.Store) *Service {
	return &Service{db: database, iam: iamService, artifacts: artifacts, vectors: vectors}
}

// WithChunkProfile sets the default RAG chunking profile used by Docling-backed
// document ingestion. A zero profile falls back to the runtime's medium profile.
func (s *Service) WithChunkProfile(profile sdkrag.ChunkProfile) *Service {
	if profile.MaxTokens <= 0 {
		profile = sdkrag.DefaultChunkProfile()
	}
	s.chunkProfile = profile
	if s.doclingClient != nil {
		return s.WithDocling(s.doclingClient)
	}
	return s
}

// WithDocling attaches a docling-serve client so binary files (PDF, DOCX,
// PPTX, XLSX, audio, images) are converted to markdown before chunking and
// embedding, the same as seshat-backend's knowledge service. Returns s for
// chaining. Passing nil leaves docling disabled (the default) — plain-text/
// markdown/JSON files still ingest fine either way.
func (s *Service) WithDocling(client *sdkdocling.Client) *Service {
	s.doclingClient = client
	s.chunker = nil
	if client != nil {
		mergePeers := true
		useMarkdownTables := true
		includeRawText := true
		profile := s.chunkProfile
		if profile.MaxTokens <= 0 {
			profile = sdkrag.DefaultChunkProfile()
		}
		s.chunkProfile = profile
		doclingChunker := sdkrag.NewDoclingChunkerForProfile(client, profile, sdkdocling.ChunkOptions{
			MergePeers:        &mergePeers,
			UseMarkdownTables: &useMarkdownTables,
			IncludeRawText:    &includeRawText,
		})
		doclingChunker.FailOnError = true
		var chunker sdkrag.DocumentChunker = qualityGuardDocumentChunker{inner: doclingChunker}
		if s.artifacts != nil {
			chunker = sdkrag.NewCachedDocumentChunker(chunker, sdkrag.NewArtifactChunkCache(s.artifacts))
		}
		s.chunker = chunker
	}
	return s
}

// doclingIngestExtensions lists file extensions whose binary content
// docling can convert to plain-text markdown for RAG chunking — the exact
// same list seshat-backend's knowledge service uses.
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

// Corpus is the caller-facing view of a document collection.
type Corpus struct {
	ID              string            `json:"id"`
	OrganizationID  string            `json:"organization_id"`
	CreatedByUserID string            `json:"created_by_user_id"`
	Name            string            `json:"name"`
	Description     string            `json:"description,omitempty"`
	Tags            []string          `json:"tags,omitempty"`
	Metadata        map[string]string `json:"metadata,omitempty"`
	ChunkCount      int               `json:"chunk_count"`
	CreatedAt       time.Time         `json:"created_at"`
	UpdatedAt       time.Time         `json:"updated_at"`
}

type CreateCorpusParams struct {
	OrganizationID string
	Name           string
	Description    string
	Tags           []string
	Metadata       map[string]string
}

// UpdateCorpusParams edits a corpus's own fields - name/description. There
// was no way to do this before (Corpus had no Update method at all).
type UpdateCorpusParams struct {
	Name        string
	Description string
	Tags        []string
	Metadata    map[string]string
}

// CorpusFile is one uploaded document and its ingestion status.
type CorpusFile struct {
	ID          string            `json:"id"`
	CorpusID    string            `json:"corpus_id"`
	Filename    string            `json:"filename"`
	ContentType string            `json:"content_type,omitempty"`
	Size        int64             `json:"size"`
	Tags        []string          `json:"tags,omitempty"`
	Metadata    map[string]string `json:"metadata,omitempty"`
	Status      string            `json:"status"`
	ChunkCount  int               `json:"chunk_count"`
	IngestedAt  *time.Time        `json:"ingested_at,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
	// Source is "upload" or "connector" - see ConnectorAccountID.
	Source             string  `json:"source"`
	ConnectorAccountID *string `json:"connector_account_id,omitempty"`
	ExternalResourceID string  `json:"external_resource_id,omitempty"`
}

type UpdateCorpusFileParams struct {
	Filename string
	Tags     []string
	Metadata map[string]string
}

// IngestionJob is one queued/processed ingestion attempt for a CorpusFile.
type IngestionJob struct {
	ID                string     `json:"id"`
	CorpusID          string     `json:"corpus_id"`
	CorpusFileID      string     `json:"corpus_file_id"`
	Filename          string     `json:"filename"`
	Status            string     `json:"status"`
	Phase             string     `json:"phase"`
	AttemptCount      int        `json:"attempt_count"`
	MaxAttempts       int        `json:"max_attempts"`
	ChunkCount        int        `json:"chunk_count"`
	LastError         string     `json:"last_error,omitempty"`
	FailureStage      string     `json:"failure_stage,omitempty"`
	ContentType       string     `json:"content_type,omitempty"`
	FileSize          int64      `json:"file_size"`
	TextChars         int        `json:"text_chars"`
	SourceBytes       int64      `json:"source_bytes"`
	ChunkProfile      string     `json:"chunk_profile,omitempty"`
	UsedDocling       bool       `json:"used_docling"`
	ReadDurationMS    int64      `json:"read_duration_ms"`
	ExtractDurationMS int64      `json:"extract_duration_ms"`
	IngestDurationMS  int64      `json:"ingest_duration_ms"`
	TotalDurationMS   int64      `json:"total_duration_ms"`
	StartedAt         *time.Time `json:"started_at,omitempty"`
	CompletedAt       *time.Time `json:"completed_at,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

type SearchParams struct {
	CorpusID string
	Query    string
	TopK     int
	Mode     string
}

const (
	SearchModeKeyword = "keyword"
	SearchModeVector  = "vector"
	SearchModeHybrid  = "hybrid"
)

// SearchResponse is the product-facing Knowledge search response. It wraps
// the runtime RAG hits with corpus-file context so the UI can show citations,
// filenames, source type, and metadata without reverse-engineering chunk keys.
type SearchResponse struct {
	SearchID string         `json:"search_id,omitempty"`
	CorpusID string         `json:"corpus_id"`
	Query    string         `json:"query"`
	Mode     string         `json:"mode"`
	TopK     int            `json:"top_k"`
	Results  []SearchResult `json:"results"`
}

type SearchResult struct {
	Key                string            `json:"key"`
	Text               string            `json:"text"`
	Score              float32           `json:"score"`
	CorpusFileID       string            `json:"corpus_file_id,omitempty"`
	Filename           string            `json:"filename,omitempty"`
	ContentType        string            `json:"content_type,omitempty"`
	Source             string            `json:"source,omitempty"`
	Tags               []string          `json:"tags,omitempty"`
	FileMetadata       map[string]string `json:"file_metadata,omitempty"`
	ConnectorAccountID *string           `json:"connector_account_id,omitempty"`
	ExternalResourceID string            `json:"external_resource_id,omitempty"`
	Position           int               `json:"position"`
	Metadata           map[string]string `json:"metadata,omitempty"`
	Citation           *SearchCitation   `json:"citation,omitempty"`
}

type SearchCitation struct {
	CorpusID     string `json:"corpus_id"`
	CorpusFileID string `json:"corpus_file_id,omitempty"`
	Filename     string `json:"filename,omitempty"`
	Position     int    `json:"position"`
	ArtifactKey  string `json:"artifact_key,omitempty"`
}

// FileSegmentsResponse exposes the actual indexed chunks for one corpus
// document. It is intentionally product-facing: vectors stay internal, while
// the UI gets enough metadata to build a Sources/Segments inspection page.
type FileSegmentsResponse struct {
	CorpusID string          `json:"corpus_id"`
	File     CorpusFile      `json:"file"`
	Count    int             `json:"count"`
	Segments []CorpusSegment `json:"segments"`
}

type CorpusSegment struct {
	Key       string            `json:"key"`
	Text      string            `json:"text"`
	Position  int               `json:"position"`
	Metadata  map[string]string `json:"metadata,omitempty"`
	Citation  SearchCitation    `json:"citation"`
	TextChars int               `json:"text_chars"`
}

const (
	SearchFeedbackUseful    = "useful"
	SearchFeedbackNotUseful = "not_useful"
)

type SearchEvent struct {
	ID               string    `json:"id"`
	OrganizationID   string    `json:"organization_id"`
	CorpusID         string    `json:"corpus_id"`
	UserID           string    `json:"user_id"`
	Query            string    `json:"query"`
	Mode             string    `json:"mode"`
	TopK             int       `json:"top_k"`
	ResultCount      int       `json:"result_count"`
	LatencyMillis    int64     `json:"latency_millis"`
	TopResultKeys    []string  `json:"top_result_keys,omitempty"`
	TopResultFileIDs []string  `json:"top_result_file_ids,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
}

type SearchFeedback struct {
	ID            string    `json:"id"`
	SearchEventID string    `json:"search_event_id"`
	CorpusID      string    `json:"corpus_id"`
	ResultKey     string    `json:"result_key,omitempty"`
	CorpusFileID  string    `json:"corpus_file_id,omitempty"`
	Rating        string    `json:"rating"`
	Comment       string    `json:"comment,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

type SubmitSearchFeedbackParams struct {
	SearchEventID string
	ResultKey     string
	CorpusFileID  string
	Rating        string
	Comment       string
}

type SearchStats struct {
	OrganizationID         string        `json:"organization_id"`
	CorpusID               string        `json:"corpus_id"`
	TotalSearches          int64         `json:"total_searches"`
	EmptySearches          int64         `json:"empty_searches"`
	AverageResultCount     float64       `json:"average_result_count"`
	UsefulFeedbackCount    int64         `json:"useful_feedback_count"`
	NotUsefulFeedbackCount int64         `json:"not_useful_feedback_count"`
	RecentSearches         []SearchEvent `json:"recent_searches"`
}

var corpusSortFields = map[string]sdb.SortField{
	"name":       {Column: "name"},
	"created_at": {Column: "created_at"},
	"updated_at": {Column: "updated_at"},
}

var corpusSearchColumns = []string{"name", "description"}

// ─── Corpus CRUD ──────────────────────────────────────────────────────────

// ListCorpora returns a page of corpora visible to the caller. Scoped
// visibility like every other list endpoint: a caller lacking
// knowledge.read/knowledge.manage/organization.manage gets an empty list,
// not a 403.
func (s *Service) ListCorpora(ctx context.Context, principal *iam.Principal, organizationID string, listParams sdb.ListParams) ([]Corpus, int64, error) {
	if principal == nil {
		return nil, 0, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, 0, ErrInvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "knowledge.read", "knowledge.manage", "organization.manage"); err != nil {
			return []Corpus{}, 0, nil
		}
	}

	query := s.db.Gorm().WithContext(ctx).Model(&sdb.Corpus{}).Where("organization_id = ?", organizationID)
	sortField, err := sdb.ResolveSortField(corpusSortFields, listParams.Sort)
	if err != nil {
		return nil, 0, ErrInvalidInput(err.Error())
	}
	query = sdb.ApplySearch(query, listParams.Search, corpusSearchColumns...)
	query = sdb.ApplySort(query, sortField, listParams.Order)

	records, total, err := sdb.Page[sdb.Corpus](query, listParams.Limit, listParams.Offset)
	if err != nil {
		return nil, 0, err
	}
	corpora := make([]Corpus, 0, len(records))
	for _, record := range records {
		corpora = append(corpora, toCorpus(record))
	}
	return corpora, total, nil
}

func (s *Service) GetCorpus(ctx context.Context, principal *iam.Principal, corpusID string) (*Corpus, error) {
	record, err := s.mustLoadCorpus(ctx, principal, corpusID, "knowledge.read", "knowledge.manage", "organization.manage")
	if err != nil {
		return nil, err
	}
	corpus := toCorpus(*record)
	return &corpus, nil
}

// CreateCorpus requires knowledge.manage or organization.manage.
func (s *Service) CreateCorpus(ctx context.Context, principal *iam.Principal, params CreateCorpusParams) (*Corpus, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	name := strings.TrimSpace(params.Name)
	if organizationID == "" || name == "" {
		return nil, ErrInvalidInput("organization_id and name are required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "knowledge.manage", "organization.manage"); err != nil {
			return nil, err
		}
	}

	var corpus sdb.Corpus
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		corpusID, err := newID("corpus")
		if err != nil {
			return err
		}
		corpus = sdb.Corpus{
			ID:              corpusID,
			OrganizationID:  organizationID,
			CreatedByUserID: principal.User.ID,
			Name:            name,
			Description:     strings.TrimSpace(params.Description),
			Tags:            normalizeTags(params.Tags),
			Metadata:        normalizeMetadata(params.Metadata),
		}
		if err := tx.Create(&corpus).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "corpus.created", "corpus", corpus.ID, map[string]string{"name": corpus.Name})
	})
	if err != nil {
		return nil, err
	}
	result := toCorpus(corpus)
	return &result, nil
}

// UpdateCorpus edits name/description. Requires knowledge.manage or
// organization.manage.
func (s *Service) UpdateCorpus(ctx context.Context, principal *iam.Principal, corpusID string, params UpdateCorpusParams) (*Corpus, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	corpusID = strings.TrimSpace(corpusID)
	name := strings.TrimSpace(params.Name)
	if corpusID == "" || name == "" {
		return nil, ErrInvalidInput("corpus_id and name are required")
	}

	var corpus sdb.Corpus
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := tx.First(&corpus, "id = ?", corpusID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("corpus not found")
			}
			return err
		}
		if !principal.User.IsAdmin {
			if err := s.iam.CheckResourcePermission(tx, principal, corpus.OrganizationID, "corpus", corpus.ID, "knowledge.manage", "organization.manage"); err != nil {
				return err
			}
		}
		corpus.Name = name
		corpus.Description = strings.TrimSpace(params.Description)
		corpus.Tags = normalizeTags(params.Tags)
		corpus.Metadata = normalizeMetadata(params.Metadata)
		if err := tx.Save(&corpus).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, corpus.OrganizationID, "corpus.updated", "corpus", corpus.ID, map[string]string{"name": corpus.Name})
	})
	if err != nil {
		return nil, err
	}
	result := toCorpus(corpus)
	return &result, nil
}

// DeleteCorpus removes the corpus, its files, and its vector namespace.
// Requires knowledge.manage or organization.manage.
func (s *Service) DeleteCorpus(ctx context.Context, principal *iam.Principal, corpusID string) error {
	record, err := s.mustLoadCorpus(ctx, principal, corpusID, "knowledge.manage", "organization.manage")
	if err != nil {
		return err
	}

	if ragService, ok, err := s.ragServiceFor(ctx, record.OrganizationID); err != nil {
		return err
	} else if ok {
		if err := ragService.DeleteNamespace(ctx, record.ID); err != nil {
			return ErrInvalidInput("delete vector namespace: " + err.Error())
		}
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := tx.Where("corpus_id = ?", record.ID).Delete(&sdb.KnowledgeIngestionJob{}).Error; err != nil {
			return err
		}
		if err := tx.Where("corpus_id = ?", record.ID).Delete(&sdb.CorpusFile{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&sdb.Corpus{}, "id = ?", record.ID).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "corpus.deleted", "corpus", record.ID, map[string]string{"name": record.Name})
	})
}

// ragServiceFor builds a rag.Service for organizationID using the shared
// vector store plus whichever embedder resolveEmbedderConfig finds (the
// organization's own, else the platform default). ok=false means neither
// is configured — callers should surface a clear "not configured" error
// rather than silently no-op.
func (s *Service) ragServiceFor(ctx context.Context, organizationID string) (*sdkrag.Service, bool, error) {
	embedderCfg, ok, err := s.resolveEmbedderConfig(ctx, organizationID)
	if err != nil {
		return nil, false, err
	}
	// Vectorless (BM25-only) ingest/search when neither the organization nor
	// the platform default has an embedder configured — sdkrag.Service
	// already degrades gracefully with a nil embedder (see its own doc
	// comment), so this only builds it with one when there's one to use, it
	// no longer skips construction (and so the whole feature) without one.
	// The bool return stays for the vector-store-unavailable case, which
	// can't happen here since s.vectors is set unconditionally at New(), but
	// keeping the same three-value shape avoids touching every call site.
	var embedder sdkrag.Embedder
	if ok {
		embedder = sdkembedder.New(&embedderCfg)
	}
	ragService := sdkrag.NewService(s.artifacts, s.vectors, embedder, s.chunker)
	// RAG_RERANK_URL points at any Cohere/TEI-compatible endpoint
	// (self-hosted TEI/vLLM serving BAAI/bge-reranker-v2-m3, free and no
	// API key needed) - falls back to LangSearch's hosted API if only
	// LANGSEARCH_API_KEY is set. A no-op when neither is configured
	// (SetReranker with an unconfigured reranker behaves exactly as nil).
	if r := sdkreranker.NewFromEnv(); r.IsConfigured() {
		ragService.SetReranker(r)
	}
	return ragService, true, nil
}

// RAGServiceForOrganization is the exported form of ragServiceFor, used by
// automation.Service (via the RAGResolver interface) to enable
// rag_search/rag_ingest for cloud-targeted job execution. Kept as a thin
// public wrapper rather than exporting ragServiceFor itself so the
// internal name stays free to evolve independently of this cross-package
// contract.
func (s *Service) RAGServiceForOrganization(ctx context.Context, organizationID string) (*sdkrag.Service, bool, error) {
	return s.ragServiceFor(ctx, organizationID)
}

type qualityGuardDocumentChunker struct {
	inner sdkrag.DocumentChunker
}

func (c qualityGuardDocumentChunker) Split(ctx context.Context, text string) ([]sdkrag.Chunk, error) {
	if c.inner == nil {
		return sdkrag.DefaultChunker().Split(ctx, text)
	}
	return c.inner.Split(ctx, text)
}

func (c qualityGuardDocumentChunker) SplitDocument(ctx context.Context, doc sdkrag.Document) ([]sdkrag.Chunk, error) {
	if c.inner == nil {
		return sdkrag.DefaultChunker().Split(ctx, doc.Text)
	}
	chunks, err := c.inner.SplitDocument(ctx, doc)
	if err != nil {
		return nil, err
	}
	for _, chunk := range chunks {
		if sdktextquality.IsGarbledText(chunk.Text) {
			return nil, errors.New("docling returned garbled text")
		}
	}
	return chunks, nil
}

func (c qualityGuardDocumentChunker) ChunkCacheKey() string {
	if provider, ok := c.inner.(sdkrag.ChunkCacheKeyProvider); ok {
		return "quality-guard:v1:" + provider.ChunkCacheKey()
	}
	return "quality-guard:v1"
}

func (s *Service) mustLoadCorpus(ctx context.Context, principal *iam.Principal, corpusID string, permissionCodes ...string) (*sdb.Corpus, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	corpusID = strings.TrimSpace(corpusID)
	if corpusID == "" {
		return nil, ErrInvalidInput("corpus_id is required")
	}
	var record sdb.Corpus
	if err := s.db.Gorm().WithContext(ctx).First(&record, "id = ?", corpusID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("corpus not found")
		}
		return nil, err
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckResourcePermission(s.db.Gorm().WithContext(ctx), principal, record.OrganizationID, "corpus", record.ID, permissionCodes...); err != nil {
			return nil, err
		}
	}
	return &record, nil
}

func toCorpus(r sdb.Corpus) Corpus {
	return Corpus{
		ID:              r.ID,
		OrganizationID:  r.OrganizationID,
		CreatedByUserID: r.CreatedByUserID,
		Name:            r.Name,
		Description:     r.Description,
		Tags:            cloneStringSlice(r.Tags),
		Metadata:        cloneStringMap(r.Metadata),
		ChunkCount:      r.ChunkCount,
		CreatedAt:       r.CreatedAt,
		UpdatedAt:       r.UpdatedAt,
	}
}

func toCorpusFile(r sdb.CorpusFile) CorpusFile {
	source := "upload"
	if r.ConnectorAccountID != nil {
		source = "connector"
	}
	return CorpusFile{
		ID:                 r.ID,
		CorpusID:           r.CorpusID,
		Filename:           r.Filename,
		ContentType:        r.ContentType,
		Size:               r.Size,
		Tags:               cloneStringSlice(r.Tags),
		Metadata:           cloneStringMap(r.Metadata),
		Status:             r.Status,
		ChunkCount:         r.ChunkCount,
		IngestedAt:         r.IngestedAt,
		CreatedAt:          r.CreatedAt,
		Source:             source,
		ConnectorAccountID: r.ConnectorAccountID,
		ExternalResourceID: r.ExternalResourceID,
	}
}

func normalizeTags(tags []string) []string {
	if len(tags) == 0 {
		return nil
	}
	seen := make(map[string]bool, len(tags))
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" || seen[tag] {
			continue
		}
		seen[tag] = true
		out = append(out, tag)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func normalizeMetadata(metadata map[string]string) map[string]string {
	if len(metadata) == 0 {
		return nil
	}
	out := make(map[string]string, len(metadata))
	for key, value := range metadata {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		out[key] = strings.TrimSpace(value)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func cloneStringSlice(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	return append([]string(nil), values...)
}

func cloneStringMap(values map[string]string) map[string]string {
	if len(values) == 0 {
		return nil
	}
	out := make(map[string]string, len(values))
	for key, value := range values {
		out[key] = value
	}
	return out
}

func toIngestionJob(r sdb.KnowledgeIngestionJob) IngestionJob {
	return IngestionJob{
		ID:                r.ID,
		CorpusID:          r.CorpusID,
		CorpusFileID:      r.CorpusFileID,
		Filename:          r.Filename,
		Status:            r.Status,
		Phase:             ingestionJobPhase(r.Status),
		AttemptCount:      r.AttemptCount,
		MaxAttempts:       r.MaxAttempts,
		ChunkCount:        r.ChunkCount,
		LastError:         r.LastError,
		FailureStage:      r.FailureStage,
		ContentType:       r.ContentType,
		FileSize:          r.FileSize,
		TextChars:         r.TextChars,
		SourceBytes:       r.SourceBytes,
		ChunkProfile:      r.ChunkProfile,
		UsedDocling:       r.UsedDocling,
		ReadDurationMS:    r.ReadDurationMS,
		ExtractDurationMS: r.ExtractDurationMS,
		IngestDurationMS:  r.IngestDurationMS,
		TotalDurationMS:   r.TotalDurationMS,
		StartedAt:         r.StartedAt,
		CompletedAt:       r.CompletedAt,
		CreatedAt:         r.CreatedAt,
		UpdatedAt:         r.UpdatedAt,
	}
}

func ingestionJobPhase(status string) string {
	switch status {
	case IngestionJobStatusQueued:
		return IngestionJobPhasePending
	case IngestionJobStatusRunning:
		return IngestionJobPhaseProcessing
	case IngestionJobStatusCompleted:
		return IngestionJobPhaseIndexed
	case IngestionJobStatusFailed:
		return IngestionJobPhaseFailed
	default:
		return status
	}
}
