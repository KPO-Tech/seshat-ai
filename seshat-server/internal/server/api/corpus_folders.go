package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
)

type createCorpusFolderRequest struct {
	OrganizationID string `json:"organization_id"`
	Name           string `json:"name"`
	Description    string `json:"description"`
	Icon           string `json:"icon"`
}

type updateCorpusFolderRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
}

func (app *App) handleCorpusFolders(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		folders, err := app.backend.Knowledge.ListCorpusFolders(r.Context(), principal, organizationID)
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"corpus_folders": folders, "count": len(folders)})
	case http.MethodPost:
		var req createCorpusFolderRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		folder, err := app.backend.Knowledge.CreateCorpusFolder(r.Context(), principal, knowledge.CreateCorpusFolderParams{
			OrganizationID: req.OrganizationID,
			Name:           req.Name,
			Description:    req.Description,
			Icon:           req.Icon,
		})
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, folder)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleCorpusFolderSearch searches every corpus filed under a folder at
// once, merging results by score - see knowledge.Service.SearchFolder's
// doc comment for why that's valid (every corpus in an org shares that
// org's one embedder).
func (app *App) handleCorpusFolderSearch(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	folderID := strings.TrimSpace(r.PathValue("folderID"))
	if folderID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing folder id")
		return
	}
	var req searchCorpusRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	resp, err := app.backend.Knowledge.SearchFolder(r.Context(), principal, folderID, req.Query, req.TopK)
	if err != nil {
		writeKnowledgeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (app *App) handleCorpusFolderByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	folderID := strings.TrimSpace(r.PathValue("folderID"))
	if folderID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing folder id")
		return
	}

	switch r.Method {
	case http.MethodPut:
		var req updateCorpusFolderRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		folder, err := app.backend.Knowledge.UpdateCorpusFolder(r.Context(), principal, folderID, knowledge.UpdateCorpusFolderParams{
			Name:        req.Name,
			Description: req.Description,
			Icon:        req.Icon,
		})
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, folder)
	case http.MethodDelete:
		if err := app.backend.Knowledge.DeleteCorpusFolder(r.Context(), principal, folderID); err != nil {
			writeKnowledgeError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
