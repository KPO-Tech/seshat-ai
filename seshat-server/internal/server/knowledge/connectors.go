package knowledge

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// ExtractText converts data to plain-text/markdown using the same
// extraction path background ingestion uses (docling for binary formats,
// falling back to plain-text detection) - exported so a Knowledge connector
// (see internal/server/connectors) can extract synced content
// identically to an uploaded file, without duplicating the extraction logic.
func (s *Service) ExtractText(ctx context.Context, data []byte, contentType, filename string) string {
	return s.extractTextWithDocling(ctx, data, contentType, filename)
}

// IngestFromConnector upserts a CorpusFile for one item pulled in by a
// Knowledge connector sync (see internal/server/connectors) and
// enqueues it for ingestion through the exact same pipeline a manual upload
// uses (UploadFile). Called from the connector-sync background worker, so
// unlike every other method in this file it takes no *iam.Principal:
// permission was already enforced when the connector account was created,
// mirroring how processIngestionJob itself operates directly on DB rows
// without a live principal.
//
// Upserts by (corpus_id, connector_account_id, external_resource_id) so a
// re-sync of an unchanged-but-rediscovered resource replaces its content in
// place instead of duplicating the CorpusFile.
func (s *Service) IngestFromConnector(ctx context.Context, organizationID, corpusID, connectorAccountID, externalResourceID, createdByUserID, filename, text string) (*CorpusFile, error) {
	if s.artifacts == nil {
		return nil, ErrInvalidInput("artifact storage is not configured on this server")
	}
	filename = strings.TrimSpace(filename)
	if filename == "" {
		return nil, ErrInvalidInput("filename is required")
	}
	if strings.TrimSpace(text) == "" {
		return nil, ErrInvalidInput("connector item has no extractable text content")
	}
	data := []byte(text)

	var existing sdb.CorpusFile
	hasExisting := true
	err := s.db.Gorm().WithContext(ctx).
		Where("corpus_id = ? AND connector_account_id = ? AND external_resource_id = ?", corpusID, connectorAccountID, externalResourceID).
		First(&existing).Error
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		hasExisting = false
	}

	fileID := existing.ID
	if !hasExisting {
		var idErr error
		fileID, idErr = newID("file")
		if idErr != nil {
			return nil, idErr
		}
	}
	// Deterministic key so a re-sync overwrites the same blob in place
	// rather than leaking one per sync, same reasoning as UploadFile's.
	storageKey := fmt.Sprintf("knowledge/%s/%s", corpusID, fileID)
	if _, err := s.artifacts.Put(ctx, storageKey, data, "text/plain"); err != nil {
		return nil, ErrInvalidInput("store connector content: " + err.Error())
	}

	accountID := connectorAccountID
	var record sdb.CorpusFile
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if hasExisting {
			updates := map[string]any{
				"filename":     filename,
				"content_type": "text/plain",
				"storage_key":  storageKey,
				"size":         int64(len(data)),
				"status":       CorpusFileStatusPending,
			}
			if err := tx.Model(&sdb.CorpusFile{}).Where("id = ?", fileID).Updates(updates).Error; err != nil {
				return err
			}
			return tx.First(&record, "id = ?", fileID).Error
		}
		record = sdb.CorpusFile{
			ID:                 fileID,
			CorpusID:           corpusID,
			OrganizationID:     organizationID,
			CreatedByUserID:    createdByUserID,
			Filename:           filename,
			ContentType:        "text/plain",
			StorageKey:         storageKey,
			Size:               int64(len(data)),
			Status:             CorpusFileStatusPending,
			ConnectorAccountID: &accountID,
			ExternalResourceID: externalResourceID,
		}
		return tx.Create(&record).Error
	})
	if err != nil {
		return nil, err
	}

	// Always enqueue - ingestion works vectorless (BM25-only) without an
	// embedder configured, see ragServiceFor. Best-effort, same as
	// UploadFile: the CorpusFile row is upserted either way.
	if _, jobErr := s.enqueueIngestionJob(ctx, organizationID, corpusID, record.ID, filename); jobErr != nil {
		_ = jobErr
	}

	result := toCorpusFile(record)
	return &result, nil
}
