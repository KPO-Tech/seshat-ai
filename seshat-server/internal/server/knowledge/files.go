package knowledge

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// UploadFile stores the given file bytes for a corpus and creates its
// CorpusFile record. When the RAG service is configured, it also
// auto-enqueues an ingestion job — best-effort: a failure to enqueue does
// not fail the upload, since ingestion can always be retried explicitly via
// EnqueueIngest. Requires knowledge.manage or organization.manage.
func (s *Service) UploadFile(ctx context.Context, principal *iam.Principal, corpusID, filename, contentType string, data []byte) (*CorpusFile, error) {
	if s.artifacts == nil {
		return nil, ErrInvalidInput("artifact storage is not configured on this server")
	}
	corpus, err := s.mustLoadCorpus(ctx, principal, corpusID, "knowledge.manage", "organization.manage")
	if err != nil {
		return nil, err
	}
	filename = strings.TrimSpace(filename)
	if filename == "" {
		return nil, ErrInvalidInput("filename is required")
	}
	if len(data) == 0 {
		return nil, ErrInvalidInput("file is empty")
	}

	fileID, err := newID("file")
	if err != nil {
		return nil, err
	}
	// Deterministic key so a re-upload under the same file id (e.g. a future
	// "replace file" action) overwrites in place rather than leaking blobs.
	storageKey := fmt.Sprintf("knowledge/%s/%s", corpus.ID, fileID)
	if _, err := s.artifacts.Put(ctx, storageKey, data, contentType); err != nil {
		return nil, ErrInvalidInput("store file: " + err.Error())
	}

	var record sdb.CorpusFile
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		record = sdb.CorpusFile{
			ID:              fileID,
			CorpusID:        corpus.ID,
			OrganizationID:  corpus.OrganizationID,
			CreatedByUserID: principal.User.ID,
			Filename:        filename,
			ContentType:     contentType,
			StorageKey:      storageKey,
			Size:            int64(len(data)),
			Status:          CorpusFileStatusPending,
		}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, corpus.OrganizationID, "corpus_file.uploaded", "corpus_file", record.ID, map[string]string{"corpus_id": corpus.ID, "filename": filename})
	})
	if err != nil {
		return nil, err
	}

	if _, ok, embedderErr := s.resolveEmbedderConfig(ctx, corpus.OrganizationID); embedderErr == nil && ok {
		if _, jobErr := s.enqueueIngestionJob(ctx, corpus.OrganizationID, corpus.ID, record.ID, filename); jobErr != nil {
			// Best-effort: the file is uploaded either way; the caller can
			// retry ingestion explicitly via EnqueueIngest.
			_ = jobErr
		}
	}

	result := toCorpusFile(record)
	return &result, nil
}

// ListFiles returns every file attached to a corpus (no pagination — a
// corpus's file count is operator-bounded, unlike append-only run history).
func (s *Service) ListFiles(ctx context.Context, principal *iam.Principal, corpusID string) ([]CorpusFile, error) {
	corpus, err := s.mustLoadCorpus(ctx, principal, corpusID, "knowledge.read", "knowledge.manage", "organization.manage")
	if err != nil {
		return nil, err
	}
	var records []sdb.CorpusFile
	if err := s.db.Gorm().WithContext(ctx).Where("corpus_id = ?", corpus.ID).Order("created_at asc").Find(&records).Error; err != nil {
		return nil, err
	}
	files := make([]CorpusFile, 0, len(records))
	for _, record := range records {
		files = append(files, toCorpusFile(record))
	}
	return files, nil
}

// DetachFile removes a file from its corpus: its vector chunks (if any were
// ingested), its CorpusFile record, and adjusts the corpus's chunk total.
// Requires knowledge.manage or organization.manage.
func (s *Service) DetachFile(ctx context.Context, principal *iam.Principal, corpusID, fileID string) error {
	corpus, err := s.mustLoadCorpus(ctx, principal, corpusID, "knowledge.manage", "organization.manage")
	if err != nil {
		return err
	}
	fileID = strings.TrimSpace(fileID)
	var file sdb.CorpusFile
	if err := s.db.Gorm().WithContext(ctx).First(&file, "id = ? AND corpus_id = ?", fileID, corpus.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound("corpus file not found")
		}
		return err
	}

	if file.ChunkCount > 0 {
		if ragService, ok, err := s.ragServiceFor(ctx, corpus.OrganizationID); err != nil {
			return err
		} else if ok {
			artifactKey := fmt.Sprintf("%s#file-%s", corpus.ID, file.ID)
			if err := ragService.DeleteFileChunks(ctx, corpus.ID, artifactKey, 0, file.ChunkCount); err != nil {
				return ErrInvalidInput("delete file vectors: " + err.Error())
			}
		}
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := tx.Where("corpus_file_id = ?", file.ID).Delete(&sdb.KnowledgeIngestionJob{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&sdb.CorpusFile{}, "id = ?", file.ID).Error; err != nil {
			return err
		}
		if file.ChunkCount > 0 {
			if err := tx.Model(&sdb.Corpus{}).Where("id = ?", corpus.ID).
				UpdateColumn("chunk_count", gorm.Expr("chunk_count - ?", file.ChunkCount)).Error; err != nil {
				return err
			}
		}
		return s.iam.AppendAuditEvent(tx, principal, corpus.OrganizationID, "corpus_file.detached", "corpus_file", file.ID, map[string]string{"corpus_id": corpus.ID, "filename": file.Filename})
	})
}
