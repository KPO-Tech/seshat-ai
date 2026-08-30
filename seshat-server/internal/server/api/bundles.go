package api

import (
	"fmt"
	"net/http"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/bundles"
)

func writeBundlesError(w http.ResponseWriter, err error) { writeControlPlaneError(w, err) }

type exportBundleRequest struct {
	OrganizationID string   `json:"organization_id"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	SkillRepoIDs   []string `json:"skill_repo_ids"`
	MCPServerIDs   []string `json:"mcp_server_ids"`
	AgentPresetIDs []string `json:"agent_preset_ids"`
	HookConfigIDs  []string `json:"hook_config_ids"`
}

// handleBundlesExport — POST /api/v1/bundles/export. Builds a portable
// manifest from an explicit selection of existing rows and returns it
// directly as the response body (Content-Disposition set so a browser/HTTP
// client downloads it as a file) - there is no server-side "bundle" record
// to fetch later, the manifest only ever exists as this one response and
// whatever the caller saves it as. See bundles.Service.Export.
func (app *App) handleBundlesExport(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req exportBundleRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	manifest, err := app.backend.Bundles.Export(r.Context(), principal, bundles.ExportSelection{
		OrganizationID: req.OrganizationID, Name: req.Name, Description: req.Description,
		SkillRepoIDs: req.SkillRepoIDs, MCPServerIDs: req.MCPServerIDs,
		AgentPresetIDs: req.AgentPresetIDs, HookConfigIDs: req.HookConfigIDs,
	})
	if err != nil {
		writeBundlesError(w, err)
		return
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", req.Name+".seshatbundle.json"))
	writeJSON(w, http.StatusOK, manifest)
}
