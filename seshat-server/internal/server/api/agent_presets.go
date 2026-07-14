package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/agentregistry"
)

func writeAgentRegistryError(w http.ResponseWriter, err error) { writeControlPlaneError(w, err) }

type createAgentPresetRequest struct {
	OrganizationID  string   `json:"organization_id"`
	Slug            string   `json:"slug"`
	Name            string   `json:"name"`
	WhenToUse       string   `json:"when_to_use"`
	SystemPrompt    string   `json:"system_prompt"`
	Model           string   `json:"model"`
	Tools           []string `json:"tools"`
	DisallowedTools []string `json:"disallowed_tools"`
	MaxTurns        int      `json:"max_turns"`
	PermissionMode  string   `json:"permission_mode"`
	Isolation       string   `json:"isolation"`
	McpServers      []string `json:"mcp_servers"`
	Icon            string   `json:"icon"`
	Enabled         *bool    `json:"enabled"`
}

type updateAgentPresetRequest struct {
	Name            *string  `json:"name"`
	WhenToUse       *string  `json:"when_to_use"`
	SystemPrompt    *string  `json:"system_prompt"`
	Model           *string  `json:"model"`
	Tools           []string `json:"tools"`
	DisallowedTools []string `json:"disallowed_tools"`
	MaxTurns        *int     `json:"max_turns"`
	PermissionMode  *string  `json:"permission_mode"`
	Isolation       *string  `json:"isolation"`
	McpServers      []string `json:"mcp_servers"`
	Icon            *string  `json:"icon"`
	Enabled         *bool    `json:"enabled"`
}

func (app *App) handleAgentPresets(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		presets, err := app.backend.AgentRegistry.ListPresets(r.Context(), principal, organizationID)
		if err != nil {
			writeAgentRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"agent_presets": presets, "count": len(presets)})
	case http.MethodPost:
		var req createAgentPresetRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		preset, err := app.backend.AgentRegistry.CreatePreset(r.Context(), principal, agentregistry.CreatePresetParams{
			OrganizationID:  req.OrganizationID,
			Slug:            req.Slug,
			Name:            req.Name,
			WhenToUse:       req.WhenToUse,
			SystemPrompt:    req.SystemPrompt,
			Model:           req.Model,
			Tools:           req.Tools,
			DisallowedTools: req.DisallowedTools,
			MaxTurns:        req.MaxTurns,
			PermissionMode:  req.PermissionMode,
			Isolation:       req.Isolation,
			McpServers:      req.McpServers,
			Icon:            req.Icon,
			Enabled:         req.Enabled,
		})
		if err != nil {
			writeAgentRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, preset)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleAgentPresetByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	id := strings.TrimSpace(r.PathValue("agentPresetID"))
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "missing agent preset id")
		return
	}

	switch r.Method {
	case http.MethodPut:
		var req updateAgentPresetRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		preset, err := app.backend.AgentRegistry.UpdatePreset(r.Context(), principal, id, agentregistry.UpdatePresetParams{
			Name:            req.Name,
			WhenToUse:       req.WhenToUse,
			SystemPrompt:    req.SystemPrompt,
			Model:           req.Model,
			Tools:           req.Tools,
			DisallowedTools: req.DisallowedTools,
			MaxTurns:        req.MaxTurns,
			PermissionMode:  req.PermissionMode,
			Isolation:       req.Isolation,
			McpServers:      req.McpServers,
			Icon:            req.Icon,
			Enabled:         req.Enabled,
		})
		if err != nil {
			writeAgentRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, preset)
	case http.MethodDelete:
		if err := app.backend.AgentRegistry.DeletePreset(r.Context(), principal, id); err != nil {
			writeAgentRegistryError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
