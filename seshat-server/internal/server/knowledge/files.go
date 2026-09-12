package knowledge

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// UploadFile stores the given file bytes for a corpus, creates its
// CorpusFile record, and auto-enqueues an ingestion job (vectorless/BM25 if
// no embedder is configured yet, see ragServiceFor) — best-effort: a
// failure to enqueue does not fail the upload, since ingestion can always
// be retried explicitly via EnqueueIngest. Requires knowledge.manage or
// organization.manage.
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

	// Always enqueue — ingestion works vectorless (BM25-only) without an
	// embedder configured, see ragServiceFor. Best-effort: the file is
	// uploaded either way; the caller can retry ingestion explicitly via
	// EnqueueIngest.
	if _, jobErr := s.enqueueIngestionJob(ctx, corpus.OrganizationID, corpus.ID, record.ID, filename); jobErr != nil {
		_ = jobErr
	}

	result := toCorpusFile(record)
	return &result, nil
}

// DownloadFile returns a corpus file's raw bytes, looked up by the file's
// own id alone - unlike every other method here, the caller doesn't know
// which corpus the file belongs to up front. This is what bridges
// cloudknowledge.RemoteService's "connected mode" file-content requests on
// the desktop side (see that package's doc comment): a CorpusFile's id is
// its own primary key, so it can be resolved without a corpus_id, then the
// usual mustLoadCorpus check enforces access using the corpus it turns out
// to belong to.
func (s *Service) DownloadFile(ctx context.Context, principal *iam.Principal, fileID string) ([]byte, *CorpusFile, error) {
	if s.artifacts == nil {
		return nil, nil, ErrInvalidInput("artifact storage is not configured on this server")
	}
	fileID = strings.TrimSpace(fileID)
	if fileID == "" {
		return nil, nil, ErrInvalidInput("file_id is required")
	}
	var record sdb.CorpusFile
	if err := s.db.Gorm().WithContext(ctx).First(&record, "id = ?", fileID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, ErrNotFound("file not found")
		}
		return nil, nil, err
	}
	if _, err := s.mustLoadCorpus(ctx, principal, record.CorpusID, "knowledge.read", "knowledge.manage", "organization.manage"); err != nil {
		return nil, nil, err
	}
	data, err := s.artifacts.Get(ctx, record.StorageKey)
	if err != nil {
		return nil, nil, fmt.Errorf("read file blob: %w", err)
	}
	result := toCorpusFile(record)
	return data, &result, nil
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

func (s *Service) UpdateFile(ctx context.Context, principal *iam.Principal, corpusID, fileID string, params UpdateCorpusFileParams) (*CorpusFile, error) {
	corpus, err := s.mustLoadCorpus(ctx, principal, corpusID, "knowledge.manage", "organization.manage")
	if err != nil {
		return nil, err
	}
	fileID = strings.TrimSpace(fileID)
	if fileID == "" {
		return nil, ErrInvalidInput("file_id is required")
	}
	filename := strings.TrimSpace(params.Filename)

	var file sdb.CorpusFile
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := tx.First(&file, "id = ? AND corpus_id = ?", fileID, corpus.ID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("corpus file not found")
			}
			return err
		}
		file.Tags = normalizeTags(params.Tags)
		file.Metadata = normalizeMetadata(params.Metadata)
		if filename != "" {
			file.Filename = filename
		}
		if err := tx.Save(&file).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, corpus.OrganizationID, "corpus_file.updated", "corpus_file", file.ID, map[string]string{"corpus_id": corpus.ID, "filename": file.Filename})
	})
	if err != nil {
		return nil, err
	}
	result := toCorpusFile(file)
	return &result, nil
}

// ListFileSegments returns the indexed chunks for one file. This reads from
// the vector store instead of duplicating segment rows in the product DB.
func (s *Service) ListFileSegments(ctx context.Context, principal *iam.Principal, corpusID, fileID string) (*FileSegmentsResponse, error) {
	corpus, err := s.mustLoadCorpus(ctx, principal, corpusID, "knowledge.read", "knowledge.manage", "organization.manage")
	if err != nil {
		return nil, err
	}
	fileID = strings.TrimSpace(fileID)
	if fileID == "" {
		return nil, ErrInvalidInput("file_id is required")
	}

	var file sdb.CorpusFile
	if err := s.db.Gorm().WithContext(ctx).First(&file, "id = ? AND corpus_id = ?", fileID, corpus.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("corpus file not found")
		}
		return nil, err
	}

	if file.ChunkCount <= 0 {
		return &FileSegmentsResponse{CorpusID: corpus.ID, File: toCorpusFile(file), Count: 0, Segments: []CorpusSegment{}}, nil
	}

	artifactKey := ragArtifactKey(corpus.ID, file.ID)
	keys := make([]string, 0, file.ChunkCount)
	for i := 0; i < file.ChunkCount; i++ {
		keys = append(keys, fmt.Sprintf("%s#chunk-%d", artifactKey, i))
	}

	records, err := s.vectors.Get(ctx, corpus.ID, keys)
	if err != nil {
		return nil, ErrInvalidInput("list indexed segments: " + err.Error())
	}

	segments := make([]CorpusSegment, 0, len(records))
	for _, record := range records {
		metadata := copyMetadata(record.Metadata)
		position := intFromMetadata(metadata, "position")
		if fileIDFromRAGMetadata(corpus.ID, record.Key, metadata) != file.ID {
			continue
		}
		segments = append(segments, CorpusSegment{
			Key:       record.Key,
			Text:      record.Text,
			Position:  position,
			Metadata:  metadata,
			TextChars: len([]rune(record.Text)),
			Citation: SearchCitation{
				CorpusID:     corpus.ID,
				CorpusFileID: file.ID,
				Filename:     file.Filename,
				Position:     position,
				ArtifactKey:  metadata["artifact_key"],
			},
		})
	}
	sort.SliceStable(segments, func(i, j int) bool {
		if segments[i].Position == segments[j].Position {
			return segments[i].Key < segments[j].Key
		}
		return segments[i].Position < segments[j].Position
	})

	return &FileSegmentsResponse{
		CorpusID: corpus.ID,
		File:     toCorpusFile(file),
		Count:    len(segments),
		Segments: segments,
	}, nil
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
			artifactKey := ragArtifactKey(corpus.ID, file.ID)
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
