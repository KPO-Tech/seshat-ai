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

	sdkrag "github.com/EngineerProjects/seshat/pkg/rag"
	sdkembedder "github.com/EngineerProjects/seshat/pkg/rag/embedder"
	sdkstorage "github.com/EngineerProjects/seshat/pkg/storage"
	sdkvector "github.com/EngineerProjects/seshat/pkg/vector"

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

	defaultIngestionMaxAttempts = 3
	defaultIngestionRetryDelay  = 2 * time.Second
	defaultStaleJobTimeout      = 10 * time.Minute
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
	db        *sdb.DB
	iam       *iam.Service
	artifacts sdkstorage.ArtifactStore
	vectors   sdkvector.Store
}

func New(database *sdb.DB, iamService *iam.Service, artifacts sdkstorage.ArtifactStore, vectors sdkvector.Store) *Service {
	return &Service{db: database, iam: iamService, artifacts: artifacts, vectors: vectors}
}

// Corpus is the caller-facing view of a document collection.
type Corpus struct {
	ID              string    `json:"id"`
	OrganizationID  string    `json:"organization_id"`
	CreatedByUserID string    `json:"created_by_user_id"`
	Name            string    `json:"name"`
	Description     string    `json:"description,omitempty"`
	ChunkCount      int       `json:"chunk_count"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type CreateCorpusParams struct {
	OrganizationID string
	Name           string
	Description    string
}

// CorpusFile is one uploaded document and its ingestion status.
type CorpusFile struct {
	ID          string     `json:"id"`
	CorpusID    string     `json:"corpus_id"`
	Filename    string     `json:"filename"`
	ContentType string     `json:"content_type,omitempty"`
	Size        int64      `json:"size"`
	Status      string     `json:"status"`
	ChunkCount  int        `json:"chunk_count"`
	IngestedAt  *time.Time `json:"ingested_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

// IngestionJob is one queued/processed ingestion attempt for a CorpusFile.
type IngestionJob struct {
	ID           string     `json:"id"`
	CorpusID     string     `json:"corpus_id"`
	CorpusFileID string     `json:"corpus_file_id"`
	Filename     string     `json:"filename"`
	Status       string     `json:"status"`
	AttemptCount int        `json:"attempt_count"`
	MaxAttempts  int        `json:"max_attempts"`
	ChunkCount   int        `json:"chunk_count"`
	LastError    string     `json:"last_error,omitempty"`
	StartedAt    *time.Time `json:"started_at,omitempty"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type SearchParams struct {
	CorpusID string
	Query    string
	TopK     int
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
	if !ok {
		return nil, false, nil
	}
	return sdkrag.NewService(s.artifacts, s.vectors, sdkembedder.New(&embedderCfg), nil), true, nil
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
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, record.OrganizationID, permissionCodes...); err != nil {
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
		ChunkCount:      r.ChunkCount,
		CreatedAt:       r.CreatedAt,
		UpdatedAt:       r.UpdatedAt,
	}
}

func toCorpusFile(r sdb.CorpusFile) CorpusFile {
	return CorpusFile{
		ID:          r.ID,
		CorpusID:    r.CorpusID,
		Filename:    r.Filename,
		ContentType: r.ContentType,
		Size:        r.Size,
		Status:      r.Status,
		ChunkCount:  r.ChunkCount,
		IngestedAt:  r.IngestedAt,
		CreatedAt:   r.CreatedAt,
	}
}

func toIngestionJob(r sdb.KnowledgeIngestionJob) IngestionJob {
	return IngestionJob{
		ID:           r.ID,
		CorpusID:     r.CorpusID,
		CorpusFileID: r.CorpusFileID,
		Filename:     r.Filename,
		Status:       r.Status,
		AttemptCount: r.AttemptCount,
		MaxAttempts:  r.MaxAttempts,
		ChunkCount:   r.ChunkCount,
		LastError:    r.LastError,
		StartedAt:    r.StartedAt,
		CompletedAt:  r.CompletedAt,
		CreatedAt:    r.CreatedAt,
		UpdatedAt:    r.UpdatedAt,
	}
}
