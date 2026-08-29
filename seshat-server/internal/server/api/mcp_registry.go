package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mcpregistry"
)

func writeMCPRegistryError(w http.ResponseWriter, err error) { writeControlPlaneError(w, err) }

type createMCPServerConfigRequest struct {
	OrganizationID string            `json:"organization_id"`
	Name           string            `json:"name"`
	DisplayName    string            `json:"display_name"`
	ServerType     string            `json:"server_type"`
	Command        string            `json:"command"`
	Args           []string          `json:"args"`
	Env            map[string]string `json:"env"`
	URL            string            `json:"url"`
	Headers        map[string]string `json:"headers"`
	TimeoutSecs    int               `json:"timeout_secs"`
	Icon           string            `json:"icon"`
}

type updateMCPServerConfigRequest struct {
	DisplayName string            `json:"display_name"`
	ServerType  string            `json:"server_type"`
	Command     string            `json:"command"`
	Args        []string          `json:"args"`
	Env         map[string]string `json:"env"`
	URL         string            `json:"url"`
	Headers     map[string]string `json:"headers"`
	TimeoutSecs int               `json:"timeout_secs"`
	Icon        string            `json:"icon"`
}

type probeMCPServerConfigRequest struct {
	OrganizationID   string `json:"organization_id"`
	URL              string `json:"url"`
	CredentialHeader string `json:"credential_header"`
	CredentialValue  string `json:"credential_value"`
}

// handleMCPServerConfigsProbe — POST /api/v1/mcp-server-configs/probe. The
// Smart-Add entry point (see docs/helps/audit-2026-08-29-openwork-den-comparison.md
// § 8): probes a candidate URL and classifies whether it needs a credential,
// without creating anything - see mcpregistry.ProbeServerConfig.
func (app *App) handleMCPServerConfigsProbe(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req probeMCPServerConfigRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	result, err := app.backend.MCPRegistry.ProbeServerConfig(r.Context(), principal, req.OrganizationID, req.URL, req.CredentialHeader, req.CredentialValue)
	if err != nil {
		writeMCPRegistryError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (app *App) handleMCPServerConfigs(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		configs, err := app.backend.MCPRegistry.ListServerConfigs(r.Context(), principal, organizationID)
		if err != nil {
			writeMCPRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"mcp_server_configs": configs, "count": len(configs)})
	case http.MethodPost:
		var req createMCPServerConfigRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		config, err := app.backend.MCPRegistry.CreateServerConfig(r.Context(), principal, mcpregistry.CreateServerConfigParams{
			OrganizationID: req.OrganizationID, Name: req.Name, DisplayName: req.DisplayName, ServerType: req.ServerType,
			Command: req.Command, Args: req.Args, Env: req.Env, URL: req.URL, Headers: req.Headers,
			TimeoutSecs: req.TimeoutSecs, Icon: req.Icon,
		})
		if err != nil {
			writeMCPRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, config)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleMCPServerConfigByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	id := strings.TrimSpace(r.PathValue("mcpServerConfigID"))
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "missing mcp server config id")
		return
	}
	switch r.Method {
	case http.MethodPut:
		var req updateMCPServerConfigRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		config, err := app.backend.MCPRegistry.UpdateServerConfig(r.Context(), principal, id, mcpregistry.UpdateServerConfigParams{
			DisplayName: req.DisplayName, ServerType: req.ServerType, Command: req.Command, Args: req.Args,
			Env: req.Env, URL: req.URL, Headers: req.Headers, TimeoutSecs: req.TimeoutSecs, Icon: req.Icon,
		})
		if err != nil {
			writeMCPRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, config)
	case http.MethodDelete:
		if err := app.backend.MCPRegistry.DeleteServerConfig(r.Context(), principal, id); err != nil {
			writeMCPRegistryError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleMCPServerConfigResolve — GET /api/v1/mcp-server-configs/resolve.
// Same trust boundary as the other resolve endpoints: any member of the
// org, includes decrypted env/headers — the point is for a connected
// seshat-backend to actually load these servers locally, once the user has
// explicitly approved each one.
func (app *App) handleMCPServerConfigResolve(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
	configs, err := app.backend.MCPRegistry.ResolveServerConfigs(r.Context(), principal, organizationID)
	if err != nil {
		writeMCPRegistryError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"mcp_server_configs": configs, "count": len(configs)})
}
