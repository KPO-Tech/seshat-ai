package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
)

type setRerankerSettingRequest struct {
	OrganizationID string `json:"organization_id"`
	BaseURL        string `json:"base_url"`
	Model          string `json:"model"`
	APIKey         string `json:"api_key"`
	Enabled        bool   `json:"enabled"`
}

// handleRerankerSettings is a singleton settings resource (at most one
// RerankerSetting per organization - see knowledge.RerankerSetting's doc
// comment), same GET/PUT/DELETE-keyed-by-organization_id shape as
// handleEmbedderSettings.
func (app *App) handleRerankerSettings(w http.ResponseWriter, r *http.Request) {
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
		setting, err := app.backend.Knowledge.GetRerankerSetting(r.Context(), principal, organizationID)
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, setting)
	case http.MethodPut:
		var req setRerankerSettingRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		setting, err := app.backend.Knowledge.SetRerankerSetting(r.Context(), principal, req.OrganizationID, knowledge.SetRerankerSettingParams{
			BaseURL: req.BaseURL,
			Model:   req.Model,
			APIKey:  req.APIKey,
			Enabled: req.Enabled,
		})
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, setting)
	case http.MethodDelete:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		if organizationID == "" {
			writeJSONError(w, http.StatusBadRequest, "organization_id is required")
			return
		}
		if err := app.backend.Knowledge.DeleteRerankerSetting(r.Context(), principal, organizationID); err != nil {
			writeKnowledgeError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

type detectRerankerModelRequest struct {
	BaseURL string `json:"base_url"`
}

// handleRerankerSettingsDetectModel probes a TEI instance's /info endpoint
// and returns the model_id it reports - the console's equivalent of the
// desktop Settings page's "Detect" button, since TEI (unlike a hosted
// Cohere/LangSearch endpoint) always serves exactly one model and can
// describe itself rather than requiring an admin to know/copy its id by
// hand. POST /api/v1/reranker-settings/detect-model
func (app *App) handleRerankerSettingsDetectModel(w http.ResponseWriter, r *http.Request) {
	if _, ok := authPrincipalFromContext(r.Context()); !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	var req detectRerankerModelRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	modelID, err := detectTEIModel(r.Context(), req.BaseURL)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"model": "", "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"model": modelID, "error": nil})
}
