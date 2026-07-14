package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/websearchsettings"
)

func writeWebSearchSettingsError(w http.ResponseWriter, err error) { writeControlPlaneError(w, err) }

type createWebSearchProviderSettingRequest struct {
	OrganizationID string `json:"organization_id"`
	Provider       string `json:"provider"`
	BaseURL        string `json:"base_url"`
	AuthUsername   string `json:"auth_username"`
	APIKey         string `json:"api_key"`
}

type updateWebSearchProviderSettingRequest struct {
	BaseURL      string `json:"base_url"`
	AuthUsername string `json:"auth_username"`
	APIKey       string `json:"api_key"`
}

func (app *App) handleWebSearchProviderSettings(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		settings, err := app.backend.WebSearchSettings.ListProviderSettings(r.Context(), principal, organizationID)
		if err != nil {
			writeWebSearchSettingsError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"web_search_provider_settings": settings, "count": len(settings)})
	case http.MethodPost:
		var req createWebSearchProviderSettingRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		setting, err := app.backend.WebSearchSettings.CreateProviderSetting(r.Context(), principal, websearchsettings.CreateProviderSettingParams{
			OrganizationID: req.OrganizationID, Provider: req.Provider,
			BaseURL: req.BaseURL, AuthUsername: req.AuthUsername, APIKey: req.APIKey,
		})
		if err != nil {
			writeWebSearchSettingsError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, setting)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleWebSearchProviderSettingByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	id := strings.TrimSpace(r.PathValue("webSearchProviderSettingID"))
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "missing web search provider setting id")
		return
	}
	switch r.Method {
	case http.MethodPut:
		var req updateWebSearchProviderSettingRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		setting, err := app.backend.WebSearchSettings.UpdateProviderSetting(r.Context(), principal, id, websearchsettings.UpdateProviderSettingParams{
			BaseURL: req.BaseURL, AuthUsername: req.AuthUsername, APIKey: req.APIKey,
		})
		if err != nil {
			writeWebSearchSettingsError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, setting)
	case http.MethodDelete:
		if err := app.backend.WebSearchSettings.DeleteProviderSetting(r.Context(), principal, id); err != nil {
			writeWebSearchSettingsError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleWebSearchProviderSettingResolve — GET /api/v1/web-search-provider-settings/resolve.
// Same trust boundary as the LLM provider-settings resolve endpoint: any
// member of the org, includes the decrypted key.
func (app *App) handleWebSearchProviderSettingResolve(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
	provider := strings.TrimSpace(r.URL.Query().Get("provider"))
	resolved, err := app.backend.WebSearchSettings.ResolveProviderSetting(r.Context(), principal, organizationID, provider)
	if err != nil {
		writeWebSearchSettingsError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resolved)
}

type upsertWebSearchOrgPolicyRequest struct {
	OrganizationID string   `json:"organization_id"`
	AllowedDomains []string `json:"allowed_domains"`
	BlockedDomains []string `json:"blocked_domains"`
}

// handleWebSearchOrgPolicy — GET/PUT /api/v1/web-search-org-policy?organization_id=.
// GET is open to any org member (a policy isn't secret, and every member
// needs to read it to have it applied locally); PUT requires
// web_search_settings.manage.
func (app *App) handleWebSearchOrgPolicy(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		policy, err := app.backend.WebSearchSettings.GetOrgPolicy(r.Context(), principal, organizationID)
		if err != nil {
			writeWebSearchSettingsError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, policy)
	case http.MethodPut:
		var req upsertWebSearchOrgPolicyRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		policy, err := app.backend.WebSearchSettings.UpsertOrgPolicy(r.Context(), principal, websearchsettings.UpsertOrgPolicyParams{
			OrganizationID: req.OrganizationID, AllowedDomains: req.AllowedDomains, BlockedDomains: req.BlockedDomains,
		})
		if err != nil {
			writeWebSearchSettingsError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, policy)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
