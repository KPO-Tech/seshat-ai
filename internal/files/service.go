package files

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	backendauth "github.com/EngineerProjects/seshat-ai/internal/auth"
	"github.com/EngineerProjects/seshat-ai/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/internal/db"
	"github.com/EngineerProjects/seshat/pkg/docling"
	"github.com/EngineerProjects/seshat/pkg/storage"
	"github.com/EngineerProjects/seshat/pkg/workspace"
)

type Service struct {
	files         *db.FileStore
	store         storage.ArtifactStore
	doclingClient *docling.Client
}

func NewService(files *db.FileStore, store storage.ArtifactStore) *Service {
	return &Service{files: files, store: store}
}

// WithDocling attaches a docling client so uploaded documents are auto-converted to markdown.
func (s *Service) WithDocling(client *docling.Client) *Service {
	s.doclingClient = client
	return s
}

// Upload stores the blob in ArtifactStore and records product metadata in DB.
func (s *Service) Upload(ctx context.Context, principal *backendauth.Principal, params UploadFileParams) (*File, error) {
	if s == nil || s.files == nil {
		return nil, bkerr.Unavailable("file store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	if strings.TrimSpace(params.Filename) == "" {
		return nil, bkerr.InvalidInput("filename is required", nil)
	}
	if len(params.Data) == 0 {
		return nil, bkerr.InvalidInput("file content is empty", nil)
	}

	contentType := strings.TrimSpace(params.ContentType)
	if contentType == "" {
		contentType = storage.DetectContentType(params.Filename)
	}

	sum := sha256.Sum256(params.Data)
	hash := hex.EncodeToString(sum[:])

	storageKey := fmt.Sprintf("files/%s", newBlobID())

	if s.store != nil {
		if _, err := s.store.Put(ctx, storageKey, params.Data, contentType); err != nil {
			return nil, bkerr.Internal("store file blob: "+err.Error(), err)
		}
	}

	record, err := s.files.Create(ctx, db.CreateFileParams{
		UserID:      principal.User.ID,
		WorkspaceID: params.WorkspaceID,
		Filename:    params.Filename,
		ContentType: contentType,
		Size:        int64(len(params.Data)),
		StorageKey:  storageKey,
		SHA256:      hash,
	})
	if err != nil {
		if s.store != nil {
			_ = s.store.Delete(ctx, storageKey)
		}
		return nil, bkerr.Internal("record file metadata: "+err.Error(), err)
	}

	return fileFromDB(*record), nil
}

// ListFiles returns files visible to the principal.
func (s *Service) ListFiles(ctx context.Context, principal *backendauth.Principal) ([]File, error) {
	if s == nil || s.files == nil {
		return nil, bkerr.Unavailable("file store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}

	var records []db.File
	var err error
	if principal.HasRole("admin") {
		records, err = s.files.ListAll(ctx)
	} else {
		records, err = s.files.ListByUserID(ctx, principal.User.ID)
	}
	if err != nil {
		return nil, bkerr.Internal("list files: "+err.Error(), err)
	}

	result := make([]File, 0, len(records))
	for _, r := range records {
		result = append(result, *fileFromDB(r))
	}
	return result, nil
}

// GetFile returns file metadata, enforcing ownership.
func (s *Service) GetFile(ctx context.Context, principal *backendauth.Principal, fileID string) (*File, error) {
	if s == nil || s.files == nil {
		return nil, bkerr.Unavailable("file store not configured", nil)
	}
	record, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return nil, bkerr.NotFound("file not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, err
	}
	return fileFromDB(*record), nil
}

// DownloadFile returns raw bytes of a file, enforcing ownership.
func (s *Service) DownloadFile(ctx context.Context, principal *backendauth.Principal, fileID string) ([]byte, *File, error) {
	if s == nil || s.files == nil {
		return nil, nil, bkerr.Unavailable("file store not configured", nil)
	}
	if s.store == nil {
		return nil, nil, bkerr.Unavailable("blob storage not configured", nil)
	}
	record, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return nil, nil, bkerr.NotFound("file not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, nil, err
	}
	data, err := s.store.Get(ctx, record.StorageKey)
	if err != nil {
		return nil, nil, bkerr.Internal("read file blob: "+err.Error(), err)
	}
	return data, fileFromDB(*record), nil
}

// OpenFileReader returns a streaming reader for a file, enforcing ownership.
func (s *Service) OpenFileReader(ctx context.Context, principal *backendauth.Principal, fileID string) (io.ReadCloser, *File, error) {
	if s == nil || s.files == nil {
		return nil, nil, bkerr.Unavailable("file store not configured", nil)
	}
	if s.store == nil {
		return nil, nil, bkerr.Unavailable("blob storage not configured", nil)
	}
	record, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return nil, nil, bkerr.NotFound("file not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, nil, err
	}
	reader, _, err := s.store.OpenReader(ctx, record.StorageKey)
	if err != nil {
		return nil, nil, bkerr.Internal("open file reader: "+err.Error(), err)
	}
	return reader, fileFromDB(*record), nil
}

// DeleteFile removes the blob and DB record, enforcing ownership.
func (s *Service) DeleteFile(ctx context.Context, principal *backendauth.Principal, fileID string) error {
	if s == nil || s.files == nil {
		return bkerr.Unavailable("file store not configured", nil)
	}
	if principal == nil {
		return bkerr.Unauthorized("authentication required", nil)
	}
	record, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return bkerr.NotFound("file not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return err
	}
	if s.store != nil {
		_ = s.store.Delete(ctx, record.StorageKey)
	}
	if err := s.files.Delete(ctx, fileID); err != nil {
		return bkerr.Internal("delete file record: "+err.Error(), err)
	}
	return nil
}

func (s *Service) checkAccess(principal *backendauth.Principal, record *db.File) error {
	if principal == nil {
		return bkerr.Unauthorized("authentication required", nil)
	}
	if principal.HasRole("admin") {
		return nil
	}
	if record.UserID != principal.User.ID {
		return bkerr.Forbidden("file belongs to another user", nil)
	}
	return nil
}

func fileFromDB(r db.File) *File {
	return &File{
		ID:           r.ID,
		UserID:       r.UserID,
		WorkspaceID:  r.WorkspaceID,
		SessionID:    r.SessionID,
		Category:     r.Category,
		LocalPath:    r.LocalPath,
		MarkdownPath: r.MarkdownPath,
		Filename:     r.Filename,
		ContentType:  r.ContentType,
		Size:         r.Size,
		SHA256:       r.SHA256,
		CreatedAt:    r.CreatedAt,
		UpdatedAt:    r.UpdatedAt,
	}
}

// ClassifyCategory returns "images", "documents", "audio", or "other".
func ClassifyCategory(filename, contentType string) string {
	ct := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))

	// Audio check first.
	if strings.HasPrefix(ct, "audio/") {
		return CategoryAudio
	}
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac", ".webm":
		return CategoryAudio
	}

	if strings.HasPrefix(ct, "image/") {
		return CategoryImages
	}
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".tiff", ".ico":
		return CategoryImages
	case ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
		".txt", ".md", ".markdown", ".csv", ".tsv", ".rtf", ".odt",
		".tex", ".html", ".htm", ".latex":
		return CategoryDocuments
	}
	switch ct {
	case "application/pdf",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.ms-excel",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"application/vnd.ms-powerpoint",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation":
		return CategoryDocuments
	}
	if strings.HasPrefix(ct, "text/") {
		return CategoryDocuments
	}
	return CategoryOther
}

// UploadSessionFile stores a file in the session workspace + blob store and records it in DB.
// The file is written to workspacePath/uploads/{category}/{filename} (collision-safe).
// If a docling client is configured and the format is supported, a markdown conversion
// is also stored at the same path with a .md extension and recorded in MarkdownPath.
func (s *Service) UploadSessionFile(ctx context.Context, principal *backendauth.Principal, sessionID, workspacePath string, params UploadFileParams) (*File, error) {
	if s == nil || s.files == nil {
		return nil, bkerr.Unavailable("file store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	if strings.TrimSpace(params.Filename) == "" {
		return nil, bkerr.InvalidInput("filename is required", nil)
	}
	if len(params.Data) == 0 {
		return nil, bkerr.InvalidInput("file content is empty", nil)
	}

	contentType := strings.TrimSpace(params.ContentType)
	if contentType == "" {
		contentType = storage.DetectContentType(params.Filename)
	}

	category := ClassifyCategory(params.Filename, contentType)

	sum := sha256.Sum256(params.Data)
	hash := hex.EncodeToString(sum[:])

	// Write to workspace filesystem.
	localRelPath := ""
	markdownRelPath := ""
	destPath := ""

	if workspacePath != "" {
		ws, err := workspace.New(workspacePath)
		if err == nil {
			_ = ws.EnsureSubdirs()
			destDir := ws.UploadsPath(category)
			destPath = safeFilePath(destDir, params.Filename)
			if writeErr := os.WriteFile(destPath, params.Data, 0o600); writeErr == nil {
				if rel, relErr := filepath.Rel(workspacePath, destPath); relErr == nil {
					localRelPath = rel
				}
			}
		}
	}

	// Docling auto-conversion: convert to markdown if format is supported.
	if destPath != "" && s.doclingClient != nil {
		ext := strings.ToLower(filepath.Ext(params.Filename))
		if doclingExtensions[ext] && s.doclingClient.IsAvailable(ctx) {
			if result, convErr := s.doclingClient.ConvertFile(ctx, destPath); convErr == nil && result.Markdown != "" {
				mdPath := strings.TrimSuffix(destPath, filepath.Ext(destPath)) + ".md"
				if writeErr := os.WriteFile(mdPath, []byte(result.Markdown), 0o600); writeErr == nil {
					if rel, relErr := filepath.Rel(workspacePath, mdPath); relErr == nil {
						markdownRelPath = rel
					}
				}
				// Also write extracted images next to the document.
				for _, img := range result.Images {
					imgDir := filepath.Dir(destPath)
					imgPath := filepath.Join(imgDir, img.Filename)
					imgData, decErr := base64.StdEncoding.DecodeString(img.Base64)
					if decErr == nil {
						_ = os.WriteFile(imgPath, imgData, 0o600)
					}
				}
			}
		}
	}

	// Store in blob store (for download).
	storageKey := fmt.Sprintf("sessions/%s/uploads/%s", sessionID, newBlobID())
	if s.store != nil {
		if _, err := s.store.Put(ctx, storageKey, params.Data, contentType); err != nil {
			return nil, bkerr.Internal("store file blob: "+err.Error(), err)
		}
	}

	record, err := s.files.Create(ctx, db.CreateFileParams{
		UserID:       principal.User.ID,
		SessionID:    sessionID,
		Category:     category,
		LocalPath:    localRelPath,
		MarkdownPath: markdownRelPath,
		Filename:     params.Filename,
		ContentType:  contentType,
		Size:         int64(len(params.Data)),
		StorageKey:   storageKey,
		SHA256:       hash,
	})
	if err != nil {
		if s.store != nil {
			_ = s.store.Delete(ctx, storageKey)
		}
		return nil, bkerr.Internal("record file metadata: "+err.Error(), err)
	}

	return fileFromDB(*record), nil
}

// ListSessionFiles returns all active files attached to a session.
func (s *Service) ListSessionFiles(ctx context.Context, principal *backendauth.Principal, sessionID string) ([]File, error) {
	if s == nil || s.files == nil {
		return nil, bkerr.Unavailable("file store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	records, err := s.files.ListBySessionID(ctx, sessionID)
	if err != nil {
		return nil, bkerr.Internal("list session files: "+err.Error(), err)
	}
	result := make([]File, 0, len(records))
	for _, r := range records {
		result = append(result, *fileFromDB(r))
	}
	return result, nil
}

// safeFilePath returns a collision-safe absolute path for filename inside dir.
// If the file already exists it appends -1, -2, … before the extension.
func safeFilePath(dir, filename string) string {
	base := filepath.Base(filepath.Clean(filename))
	ext := filepath.Ext(base)
	stem := strings.TrimSuffix(base, ext)
	candidate := filepath.Join(dir, base)
	for i := 1; i <= 999; i++ {
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate
		}
		candidate = filepath.Join(dir, fmt.Sprintf("%s-%d%s", stem, i, ext))
	}
	return candidate
}

func newBlobID() string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		// fallback: sha256 of rand failure is still unique enough for blob keys
		h := sha256.Sum256([]byte(fmt.Sprintf("fallback-%p", &b)))
		return hex.EncodeToString(h[:12])
	}
	return hex.EncodeToString(b[:])
}
