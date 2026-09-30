package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/hookregistry"
)

func writeHookRegistryError(w http.ResponseWriter, err error) { writeControlPlaneError(w, err) }

type createHookConfigRequest struct {
	OrganizationID string `json:"organization_id"`
	Name           string `json:"name"`
	Matcher        string `json:"matcher"`
	Command        string `json:"command"`
	TimeoutSecs    int    `json:"timeout_secs"`
	Enabled        *bool  `json:"enabled"`
}

type updateHookConfigRequest struct {
	Matcher     string `json:"matcher"`
	Command     string `json:"command"`
	TimeoutSecs int    `json:"timeout_secs"`
	Enabled     *bool  `json:"enabled"`
}

// handleHookConfigs — GET/POST /api/v1/hook-configs. Same shape as
// handleMCPServerConfigs.
func (app *App) handleHookConfigs(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		configs, err := app.backend.HookRegistry.ListHookConfigs(r.Context(), principal, organizationID)
		if err != nil {
			writeHookRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"hook_configs": configs, "count": len(configs)})
	case http.MethodPost:
		var req createHookConfigRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		config, err := app.backend.HookRegistry.CreateHookConfig(r.Context(), principal, hookregistry.CreateHookConfigParams{
			OrganizationID: req.OrganizationID, Name: req.Name, Matcher: req.Matcher, Command: req.Command,
			TimeoutSecs: req.TimeoutSecs, Enabled: req.Enabled,
		})
		if err != nil {
			writeHookRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, config)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleHookConfigByID — PUT/DELETE /api/v1/hook-configs/{hookConfigID}.
func (app *App) handleHookConfigByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	id := strings.TrimSpace(r.PathValue("hookConfigID"))
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "missing hook config id")
		return
	}
	switch r.Method {
	case http.MethodPut:
		var req updateHookConfigRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		config, err := app.backend.HookRegistry.UpdateHookConfig(r.Context(), principal, id, hookregistry.UpdateHookConfigParams{
			Matcher: req.Matcher, Command: req.Command, TimeoutSecs: req.TimeoutSecs, Enabled: req.Enabled,
		})
		if err != nil {
			writeHookRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, config)
	case http.MethodDelete:
		if err := app.backend.HookRegistry.DeleteHookConfig(r.Context(), principal, id); err != nil {
			writeHookRegistryError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleHookConfigResolve — GET /api/v1/hook-configs/resolve. Same trust
// boundary as handleMCPServerConfigResolve: any member of the org, so a
// connected seshat-backend device can present each org-defined hook to its
// own user for explicit local approval before ever running it.
func (app *App) handleHookConfigResolve(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
	configs, err := app.backend.HookRegistry.ResolveHookConfigs(r.Context(), principal, organizationID)
	if err != nil {
		writeHookRegistryError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"hook_configs": configs, "count": len(configs)})
}
