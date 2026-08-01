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

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/docconvert"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/officeconvert"
	"github.com/KPO-Tech/seshat/pkg/docling"
	"github.com/KPO-Tech/seshat/pkg/storage"
	"github.com/KPO-Tech/seshat/pkg/workspace"
)

type Service struct {
	files                *db.FileStore
	store                storage.ArtifactStore
	resolveDoclingClient func(ctx context.Context) *docling.Client
}

func NewService(files *db.FileStore, store storage.ArtifactStore) *Service {
	return &Service{files: files, store: store}
}

// WithDocling attaches a resolver that returns the docling client to use for
// a given call, re-evaluated every time rather than cached — the user can
// change which docling-serve instance to use at runtime (Settings >
// Knowledge), see internal/config/bootstrap.go's resolveDocling closure.
func (s *Service) WithDocling(resolve func(ctx context.Context) *docling.Client) *Service {
	s.resolveDoclingClient = resolve
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

// ReadMarkdown returns the docling-converted markdown text for a file that
// has one (MarkdownPath set at upload time), enforcing ownership. workspacePath
// is the caller-resolved workspace root for the file's session - the same
// value UploadSessionFile was given when it wrote the sidecar in the first
// place, since MarkdownPath is stored workspace-relative.
func (s *Service) ReadMarkdown(ctx context.Context, principal *backendauth.Principal, fileID, workspacePath string) (string, *File, error) {
	if s == nil || s.files == nil {
		return "", nil, bkerr.Unavailable("file store not configured", nil)
	}
	record, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return "", nil, bkerr.NotFound("file not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return "", nil, err
	}
	if record.MarkdownPath == "" {
		return "", nil, bkerr.NotFound("no markdown conversion available for this file", nil)
	}
	if workspacePath == "" {
		return "", nil, bkerr.NotFound("workspace unavailable", nil)
	}

	// MarkdownPath is always server-generated (never user input), but resolve
	// defensively anyway: reject anything that would land outside workspacePath.
	absWorkspace, err := filepath.Abs(workspacePath)
	if err != nil {
		return "", nil, bkerr.Internal("resolve workspace path: "+err.Error(), err)
	}
	mdPath, err := filepath.Abs(filepath.Join(absWorkspace, record.MarkdownPath))
	if err != nil || (mdPath != absWorkspace && !strings.HasPrefix(mdPath, absWorkspace+string(filepath.Separator))) {
		return "", nil, bkerr.Internal("markdown path escapes workspace", err)
	}

	data, err := os.ReadFile(mdPath)
	if err != nil {
		return "", nil, bkerr.NotFound("markdown file not found on disk", err)
	}
	return string(data), fileFromDB(*record), nil
}

// GetOrCreatePDFPreview returns a LibreOffice-rendered PDF for a non-PDF
// office document (DOCX/PPTX/XLSX/HTML/TEX/...), so it can go through the
// same interactive PDF viewer real .pdf attachments use instead of a flat
// text dump. Conversion happens lazily on first request and is cached via
// PDFPreviewPath - most attachments are never opened, so paying the
// LibreOffice cost only when someone actually views the document mirrors
// the lazy-conversion fix already applied to docling (see the SDK's
// sidecarMarkdown and this package's UploadSessionFile doc comment).
// Callers should treat a bkerr.Unavailable error as "no preview possible,
// fall back to the markdown text preview" rather than a hard failure.
func (s *Service) GetOrCreatePDFPreview(ctx context.Context, principal *backendauth.Principal, fileID, workspacePath string) ([]byte, *File, error) {
	if s == nil || s.files == nil {
		return nil, nil, bkerr.Unavailable("file store not configured", nil)
	}
	record, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return nil, nil, bkerr.NotFound("file not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, nil, err
	}
	if record.LocalPath == "" || workspacePath == "" {
		return nil, nil, bkerr.NotFound("no local file available to convert", nil)
	}

	absWorkspace, err := filepath.Abs(workspacePath)
	if err != nil {
		return nil, nil, bkerr.Internal("resolve workspace path: "+err.Error(), err)
	}

	// Serve the cached conversion if it's still on disk.
	if record.PDFPreviewPath != "" {
		if previewPath, resolveErr := resolveWorkspacePath(absWorkspace, record.PDFPreviewPath); resolveErr == nil {
			if data, readErr := os.ReadFile(previewPath); readErr == nil {
				return data, fileFromDB(*record), nil
			}
		}
		// Cached path is stale or missing on disk - fall through and reconvert.
	}

	if !officeconvert.Default.IsAvailable() {
		return nil, nil, bkerr.Unavailable("document preview conversion is not available", nil)
	}

	srcPath, err := resolveWorkspacePath(absWorkspace, record.LocalPath)
	if err != nil {
		return nil, nil, bkerr.Internal("local file path escapes workspace", err)
	}

	// Convert into a directory keyed by file ID, not the shared uploads/
	// directory the source lives in - LibreOffice names its output after the
	// source's basename, and two unrelated uploads sharing a stem (e.g. a
	// "report.docx" and an unrelated "report.pdf") would otherwise collide.
	outDir := filepath.Join(filepath.Dir(srcPath), ".previews", fileID)
	pdfPath, err := officeconvert.Default.ConvertToPDF(ctx, srcPath, outDir)
	if err != nil {
		return nil, nil, bkerr.Internal("convert document to pdf: "+err.Error(), err)
	}

	rel, err := filepath.Rel(absWorkspace, pdfPath)
	if err != nil {
		return nil, nil, bkerr.Internal("resolve preview path: "+err.Error(), err)
	}
	rel = filepath.ToSlash(rel)
	if err := s.files.SetPDFPreviewPath(ctx, fileID, rel); err != nil {
		return nil, nil, bkerr.Internal("record pdf preview path: "+err.Error(), err)
	}

	data, err := os.ReadFile(pdfPath)
	if err != nil {
		return nil, nil, bkerr.Internal("read converted pdf: "+err.Error(), err)
	}
	record.PDFPreviewPath = rel
	return data, fileFromDB(*record), nil
}

// resolveWorkspacePath joins a workspace-relative path (always
// server-generated, never user input) onto absWorkspace and rejects the
// result if it would land outside absWorkspace.
func resolveWorkspacePath(absWorkspace, rel string) (string, error) {
	joined, err := filepath.Abs(filepath.Join(absWorkspace, rel))
	if err != nil {
		return "", err
	}
	if joined != absWorkspace && !strings.HasPrefix(joined, absWorkspace+string(filepath.Separator)) {
		return "", fmt.Errorf("path escapes workspace")
	}
	return joined, nil
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

// DeleteBySessionID removes every file record and blob attached to
// sessionID, regardless of whether any of them were ever attached to a sent
// message. Called when the session itself is deleted (see
// query.Service.DeleteSession) - the workspace directory those files were
// also written to is a separate, unrelated cleanup the caller handles
// itself (os.RemoveAll on the workspace path), since this package only
// owns the DB records and blob store, not the filesystem layout.
// Best-effort per file: a failure on one record doesn't stop the rest from
// being cleaned up, since the session is already gone either way.
func (s *Service) DeleteBySessionID(ctx context.Context, sessionID string) error {
	if s == nil || s.files == nil {
		return nil
	}
	records, err := s.files.ListBySessionID(ctx, sessionID)
	if err != nil {
		return fmt.Errorf("list session files: %w", err)
	}
	var firstErr error
	for _, record := range records {
		if s.store != nil {
			_ = s.store.Delete(ctx, record.StorageKey)
		}
		if err := s.files.Delete(ctx, record.ID); err != nil && firstErr == nil {
			firstErr = fmt.Errorf("delete file %s: %w", record.ID, err)
		}
	}
	return firstErr
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
		ID:               r.ID,
		UserID:           r.UserID,
		WorkspaceID:      r.WorkspaceID,
		SessionID:        r.SessionID,
		Category:         r.Category,
		LocalPath:        r.LocalPath,
		MarkdownPath:     r.MarkdownPath,
		Filename:         r.Filename,
		ContentType:      r.ContentType,
		Size:             r.Size,
		SHA256:           r.SHA256,
		UserMessageIndex: r.UserMessageIndex,
		CreatedAt:        r.CreatedAt,
		UpdatedAt:        r.UpdatedAt,
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

	// Auto-conversion to markdown: native extraction first (DOCX/PPTX/XLSX,
	// PDF with a text layer - no docling-serve needed), docling as the
	// fallback for scans, audio, and images. See internal/docconvert.
	if destPath != "" && docconvert.AllConvertibleExtensions[strings.ToLower(filepath.Ext(params.Filename))] {
		var doclingClient *docling.Client
		if s.resolveDoclingClient != nil {
			doclingClient = s.resolveDoclingClient(ctx)
		}
		if result, ok, _ := docconvert.Convert(ctx, destPath, doclingClient); ok {
			mdPath := strings.TrimSuffix(destPath, filepath.Ext(destPath)) + ".md"
			if writeErr := os.WriteFile(mdPath, []byte(result.Markdown), 0o600); writeErr == nil {
				if rel, relErr := filepath.Rel(workspacePath, mdPath); relErr == nil {
					markdownRelPath = rel
				}
			}
			// Also write extracted images next to the document (docling only).
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

// AttachToMessage records that fileIDs belong to the user message at
// messageIndex within sessionID, so the transcript can still show them once
// the sender's in-memory optimistic attachment state is gone.
func (s *Service) AttachToMessage(ctx context.Context, fileIDs []string, sessionID string, messageIndex int) error {
	if s == nil || s.files == nil {
		return bkerr.Unavailable("file store not configured", nil)
	}
	if err := s.files.AttachToMessage(ctx, fileIDs, sessionID, messageIndex); err != nil {
		return bkerr.Internal("attach files to message: "+err.Error(), err)
	}
	return nil
}

// ListMessageAttachments returns every file in sessionID that's been
// associated with a specific sent message via AttachToMessage.
func (s *Service) ListMessageAttachments(ctx context.Context, sessionID string) ([]File, error) {
	if s == nil || s.files == nil {
		return nil, bkerr.Unavailable("file store not configured", nil)
	}
	records, err := s.files.ListMessageAttachments(ctx, sessionID)
	if err != nil {
		return nil, bkerr.Internal("list message attachments: "+err.Error(), err)
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
