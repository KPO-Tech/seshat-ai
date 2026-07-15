package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
)

type setEmbedderSettingRequest struct {
	OrganizationID string `json:"organization_id"`
	Provider       string `json:"provider"`
	Model          string `json:"model"`
	BaseURL        string `json:"base_url"`
	APIKey         string `json:"api_key"`
}

// handleEmbedderSettings is a singleton settings resource (at most one
// EmbedderSetting per organization — see knowledge.EmbedderSetting's doc
// comment), so unlike the list-shaped provider-settings endpoints this is
// GET/PUT/DELETE keyed by organization_id rather than a resource id path.
func (app *App) handleEmbedderSettings(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		if organizationID == "" {
			writeJSONError(w, http.StatusBadRequest, "organization_id is required")
			return
		}
		setting, err := app.backend.Knowledge.GetEmbedderSetting(r.Context(), principal, organizationID)
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, setting)
	case http.MethodPut:
		var req setEmbedderSettingRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		setting, err := app.backend.Knowledge.SetEmbedderSetting(r.Context(), principal, req.OrganizationID, knowledge.SetEmbedderSettingParams{
			Provider: req.Provider,
			Model:    req.Model,
			BaseURL:  req.BaseURL,
			APIKey:   req.APIKey,
		})
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		if req.APIKey != "" {
			app.autoConfigureProviderFromEmbedder(r.Context(), principal, req.OrganizationID, req.Provider, req.BaseURL, req.APIKey)
		}
		writeJSON(w, http.StatusOK, setting)
	case http.MethodDelete:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		if organizationID == "" {
			writeJSONError(w, http.StatusBadRequest, "organization_id is required")
			return
		}
		if err := app.backend.Knowledge.DeleteEmbedderSetting(r.Context(), principal, organizationID); err != nil {
			writeKnowledgeError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
