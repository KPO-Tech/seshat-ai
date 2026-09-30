package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/automation"
)

type createProviderSettingRequest struct {
	OrganizationID string `json:"organization_id"`
	Provider       string `json:"provider"`
	DefaultModel   string `json:"default_model"`
	BaseURL        string `json:"base_url"`
	APIKey         string `json:"api_key"`
}

type updateProviderSettingRequest struct {
	DefaultModel string `json:"default_model"`
	BaseURL      string `json:"base_url"`
	APIKey       string `json:"api_key"`
}

func (app *App) handleProviderSettings(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		settings, err := app.backend.Automation.ListProviderSettings(r.Context(), principal, organizationID)
		if err != nil {
			writeAutomationError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"provider_settings": settings, "count": len(settings)})
	case http.MethodPost:
		var req createProviderSettingRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		setting, err := app.backend.Automation.CreateProviderSetting(r.Context(), principal, automation.CreateProviderSettingParams{
			OrganizationID: req.OrganizationID,
			Provider:       req.Provider,
			DefaultModel:   req.DefaultModel,
			BaseURL:        req.BaseURL,
			APIKey:         req.APIKey,
		})
		if err != nil {
			writeAutomationError(w, err)
			return
		}
		app.autoConfigureEmbedderFromProvider(r.Context(), principal, req.OrganizationID, req.Provider, req.BaseURL, req.APIKey)
		writeJSON(w, http.StatusCreated, setting)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleProviderSettingsUsable — GET /api/v1/provider-settings/usable.
// Unlike handleProviderSettings' GET (admin-only, for the settings/
// credentials page), this is the list a chat provider picker should call:
// any member of the organization gets back whichever provider settings they
// are actually allowed to use (see ListUsableProviderSettings).
func (app *App) handleProviderSettingsUsable(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
	settings, err := app.backend.Automation.ListUsableProviderSettings(r.Context(), principal, organizationID)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"provider_settings": settings, "count": len(settings)})
}

// handleProviderSettingResolve — GET /api/v1/provider-settings/resolve.
// Unlike the CRUD handlers above, this returns a USABLE config (decrypted API
// key included) for any member of the organization, not just
// provider_settings.read/.manage holders — see ResolveProviderSetting's doc
// comment for why that's the correct trust boundary here.
func (app *App) handleProviderSettingResolve(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
	provider := strings.TrimSpace(r.URL.Query().Get("provider"))
	resolved, err := app.backend.Automation.ResolveProviderSetting(r.Context(), principal, organizationID, provider)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resolved)
}

func (app *App) handleProviderSettingByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	id := strings.TrimSpace(r.PathValue("providerSettingID"))
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "missing provider setting id")
		return
	}

	switch r.Method {
	case http.MethodGet:
		setting, err := app.backend.Automation.GetProviderSetting(r.Context(), principal, id)
		if err != nil {
			writeAutomationError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, setting)
	case http.MethodPut:
		var req updateProviderSettingRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		setting, err := app.backend.Automation.UpdateProviderSetting(r.Context(), principal, id, automation.UpdateProviderSettingParams{
			DefaultModel: req.DefaultModel,
			BaseURL:      req.BaseURL,
			APIKey:       req.APIKey,
		})
		if err != nil {
			writeAutomationError(w, err)
			return
		}
		if req.APIKey != "" {
			app.autoConfigureEmbedderFromProvider(r.Context(), principal, setting.OrganizationID, setting.Provider, setting.BaseURL, req.APIKey)
		}
		writeJSON(w, http.StatusOK, setting)
	case http.MethodDelete:
		if err := app.backend.Automation.DeleteProviderSetting(r.Context(), principal, id); err != nil {
			writeAutomationError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleProviderSettingSetDefault(w http.ResponseWriter, r *http.Request) {
	app.setProviderSettingDefault(w, r, true)
}

func (app *App) handleProviderSettingUnsetDefault(w http.ResponseWriter, r *http.Request) {
	app.setProviderSettingDefault(w, r, false)
}

func (app *App) setProviderSettingDefault(w http.ResponseWriter, r *http.Request, isDefault bool) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	id := strings.TrimSpace(r.PathValue("providerSettingID"))
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "missing provider setting id")
		return
	}
	setting, err := app.backend.Automation.SetProviderSettingDefault(r.Context(), principal, id, isDefault)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, setting)
}
