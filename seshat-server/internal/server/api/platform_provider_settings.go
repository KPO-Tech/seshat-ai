package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/automation"
)

type createPlatformProviderSettingRequest struct {
	Provider     string `json:"provider"`
	DefaultModel string `json:"default_model"`
	BaseURL      string `json:"base_url"`
	APIKey       string `json:"api_key"`
}

type updatePlatformProviderSettingRequest struct {
	DefaultModel string `json:"default_model"`
	BaseURL      string `json:"base_url"`
	APIKey       string `json:"api_key"`
}

func (app *App) handlePlatformProviderSettings(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	switch r.Method {
	case http.MethodGet:
		settings, err := app.backend.Automation.ListPlatformProviderSettings(r.Context(), principal)
		if err != nil {
			writeAutomationError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"platform_provider_settings": settings, "count": len(settings)})
	case http.MethodPost:
		var req createPlatformProviderSettingRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		setting, err := app.backend.Automation.CreatePlatformProviderSetting(r.Context(), principal, automation.CreatePlatformProviderSettingParams{
			Provider:     req.Provider,
			DefaultModel: req.DefaultModel,
			BaseURL:      req.BaseURL,
			APIKey:       req.APIKey,
		})
		if err != nil {
			writeAutomationError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, setting)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handlePlatformProviderSettingByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	id := strings.TrimSpace(r.PathValue("platformProviderSettingID"))
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "missing platform provider setting id")
		return
	}

	switch r.Method {
	case http.MethodGet:
		setting, err := app.backend.Automation.GetPlatformProviderSetting(r.Context(), principal, id)
		if err != nil {
			writeAutomationError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, setting)
	case http.MethodPut:
		var req updatePlatformProviderSettingRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		setting, err := app.backend.Automation.UpdatePlatformProviderSetting(r.Context(), principal, id, automation.UpdatePlatformProviderSettingParams{
			DefaultModel: req.DefaultModel,
			BaseURL:      req.BaseURL,
			APIKey:       req.APIKey,
		})
		if err != nil {
			writeAutomationError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, setting)
	case http.MethodDelete:
		if err := app.backend.Automation.DeletePlatformProviderSetting(r.Context(), principal, id); err != nil {
			writeAutomationError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
