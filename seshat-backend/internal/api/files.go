package api

import (
	"fmt"
	"io"
	"net/http"
	"strings"

	backendaudit "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/audit"
	backendfiles "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/files"
	backendquotas "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/quotas"
)

const maxUploadSize = 100 << 20 // 100 MB

// handleFiles dispatches POST /api/v1/files (upload) and GET /api/v1/files (list).
func (app *App) handleFiles(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	switch r.Method {
	case http.MethodPost:
		if !app.requireFileUploadPermission(w, r, principal) {
			return
		}
		app.handleFileUpload(w, r, principal)
	case http.MethodGet:
		files, err := app.backend.Files.ListFiles(r.Context(), principal)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"files": toFileResponses(files), "count": len(files)})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleFileByID dispatches on /api/v1/files/{id} and /api/v1/files/{id}/content.
func (app *App) handleFileByID(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/files/")
	path = strings.Trim(path, "/")
	if path == "" {
		writeJSONError(w, http.StatusBadRequest, "file id is required")
		return
	}

	// Split on "/" to detect /files/{id}/content
	parts := strings.SplitN(path, "/", 2)
	fileID := parts[0]
	subpath := ""
	if len(parts) == 2 {
		subpath = parts[1]
	}

	principal, _ := authPrincipalFromContext(r.Context())

	switch {
	case subpath == "content" && r.Method == http.MethodGet:
		app.handleFileDownload(w, r, principal, fileID)
	case subpath == "markdown" && r.Method == http.MethodGet:
		app.handleFileMarkdown(w, r, fileID)
	case subpath == "":
		switch r.Method {
		case http.MethodGet:
			f, err := app.backend.Files.GetFile(r.Context(), principal, fileID)
			if err != nil {
				writeBackendError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, toFileResponse(*f))
		case http.MethodDelete:
			if !app.requireChatDeletePermission(w, r, principal) {
				return
			}
			if err := app.backend.Files.DeleteFile(r.Context(), principal, fileID); err != nil {
				writeBackendError(w, err)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	default:
		writeJSONError(w, http.StatusNotFound, fmt.Sprintf("unknown sub-resource: %s", subpath))
	}
}

func (app *App) handleFileUpload(w http.ResponseWriter, r *http.Request, principal any) {
	// principal here comes from authPrincipalFromContext — reuse the typed version
	p, _ := authPrincipalFromContext(r.Context())

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeJSONError(w, http.StatusBadRequest, "failed to parse multipart form: "+err.Error())
		return
	}

	mpFile, header, err := r.FormFile("file")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "missing 'file' field in form")
		return
	}
	defer mpFile.Close()

	data, err := io.ReadAll(mpFile)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to read uploaded file")
		return
	}

	params := backendfiles.UploadFileParams{
		Filename:    header.Filename,
		ContentType: header.Header.Get("Content-Type"),
		Data:        data,
		WorkspaceID: r.FormValue("workspace_id"),
	}

	f, err := app.backend.Files.Upload(r.Context(), p, params)
	if err != nil {
		writeBackendError(w, err)
		return
	}
	if p != nil {
		app.backend.Audit.Log(r.Context(), backendaudit.LogParams{
			ActorUserID:  p.User.ID,
			Action:       backendaudit.ActionFileUpload,
			ResourceType: "file",
			ResourceID:   f.ID,
			IPAddress:    app.clientIP(r),
			Metadata:     map[string]any{"filename": f.Filename, "size": f.Size},
		})
		app.backend.Quota.Increment(r.Context(), p, backendquotas.MetricFiles, 1)
	}
	writeJSON(w, http.StatusCreated, toFileResponse(*f))
}

func (app *App) handleFileDownload(w http.ResponseWriter, r *http.Request, _ any, fileID string) {
	principal, _ := authPrincipalFromContext(r.Context())

	reader, f, err := app.backend.Files.OpenFileReader(r.Context(), principal, fileID)
	if err != nil {
		writeBackendError(w, err)
		return
	}
	defer reader.Close()

	ct := f.ContentType
	if ct == "" {
		ct = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename=%q`, f.Filename))
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, reader)
}

// handleFileMarkdown handles GET /api/v1/files/{id}/markdown — returns the
// docling-converted plain-text/markdown rendering of a document attachment,
// used by the chat UI's split-screen document viewer (PDF/DOCX/PPTX/etc. are
// not rendered pixel-for-pixel; this reuses the same conversion the model
// itself already sees, so what the user reads matches what the agent read).
func (app *App) handleFileMarkdown(w http.ResponseWriter, r *http.Request, fileID string) {
	principal, _ := authPrincipalFromContext(r.Context())
	if app.backend.Files == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "file service not configured")
		return
	}
	f, err := app.backend.Files.GetFile(r.Context(), principal, fileID)
	if err != nil {
		writeBackendError(w, err)
		return
	}
	workspacePath := ""
	if f.SessionID != "" && app.backend.Query != nil {
		if detail, detailErr := app.backend.Query.GetSession(r.Context(), principal, f.SessionID); detailErr == nil {
			workspacePath = detail.WorkspacePath
		}
	}
	content, err := app.backend.Files.GetMarkdownContent(r.Context(), principal, fileID, workspacePath)
	if err != nil {
		writeBackendError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"filename": f.Filename, "markdown": content})
}

// handleSessionFiles handles:
//   - GET  /api/v1/sessions/:id/files   → list session uploads
//   - POST /api/v1/sessions/:id/files   → upload a file to the session workspace
func (app *App) handleSessionFiles(w http.ResponseWriter, r *http.Request, principal any, sessionID string) {
	if app.backend.Files == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "file service not configured")
		return
	}
	p, _ := authPrincipalFromContext(r.Context())

	switch r.Method {
	case http.MethodGet:
		files, err := app.backend.Files.ListSessionFiles(r.Context(), p, sessionID)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"files": toFileResponses(files), "count": len(files)})

	case http.MethodPost:
		if !app.requireFileUploadPermission(w, r, p) {
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
		if err := r.ParseMultipartForm(32 << 20); err != nil {
			writeJSONError(w, http.StatusBadRequest, "failed to parse multipart form: "+err.Error())
			return
		}
		mpFile, header, err := r.FormFile("file")
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "missing 'file' field in form")
			return
		}
		defer mpFile.Close()
		data, err := io.ReadAll(mpFile)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "failed to read uploaded file")
			return
		}

		// Resolve session workspace path.
		workspacePath := ""
		if app.backend.Query != nil {
			if detail, detailErr := app.backend.Query.GetSession(r.Context(), p, sessionID); detailErr == nil {
				workspacePath = detail.WorkspacePath
			}
		}

		f, err := app.backend.Files.UploadSessionFile(r.Context(), p, sessionID, workspacePath, backendfiles.UploadFileParams{
			Filename:    header.Filename,
			ContentType: header.Header.Get("Content-Type"),
			Data:        data,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		if p != nil {
			app.backend.Audit.Log(r.Context(), backendaudit.LogParams{
				ActorUserID:  p.User.ID,
				Action:       backendaudit.ActionFileUpload,
				ResourceType: "file",
				ResourceID:   f.ID,
				IPAddress:    app.clientIP(r),
				Metadata:     map[string]any{"filename": f.Filename, "size": f.Size, "session_id": sessionID},
			})
			app.backend.Quota.Increment(r.Context(), p, backendquotas.MetricFiles, 1)
		}
		writeJSON(w, http.StatusCreated, toFileResponse(*f))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// --- response helpers ---

type fileResponse struct {
	ID           string `json:"id"`
	UserID       string `json:"user_id"`
	WorkspaceID  string `json:"workspace_id,omitempty"`
	SessionID    string `json:"session_id,omitempty"`
	Category     string `json:"category,omitempty"`
	LocalPath    string `json:"local_path,omitempty"`
	MarkdownPath string `json:"markdown_path,omitempty"`
	Filename     string `json:"filename"`
	ContentType  string `json:"content_type"`
	Size         int64  `json:"size"`
	SHA256       string `json:"sha256,omitempty"`
	CreatedAt    int64  `json:"created_at"`
	UpdatedAt    int64  `json:"updated_at"`
}

func toFileResponse(f backendfiles.File) fileResponse {
	return fileResponse{
		ID:           f.ID,
		UserID:       f.UserID,
		WorkspaceID:  f.WorkspaceID,
		SessionID:    f.SessionID,
		Category:     f.Category,
		LocalPath:    f.LocalPath,
		MarkdownPath: f.MarkdownPath,
		Filename:     f.Filename,
		ContentType:  f.ContentType,
		Size:         f.Size,
		SHA256:       f.SHA256,
		CreatedAt:    f.CreatedAt.Unix(),
		UpdatedAt:    f.UpdatedAt.Unix(),
	}
}

func toFileResponses(fs []backendfiles.File) []fileResponse {
	out := make([]fileResponse, 0, len(fs))
	for _, f := range fs {
		out = append(out, toFileResponse(f))
	}
	return out
}
