package api

import (
	"fmt"
	"net/http"
	"strings"

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

type importBundleRequest struct {
	OrganizationID string           `json:"organization_id"`
	Manifest       bundles.Manifest `json:"manifest"`
}

// handleBundlesImport — POST /api/v1/bundles/import. Takes a manifest
// (typically the exact JSON a previous export produced) and creates
// everything in it for organization_id, tagging every row it actually
// creates. See bundles.Service.Import for exactly what "success" means
// here - a response can report some items created and others failed, never
// silently one or the other.
func (app *App) handleBundlesImport(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req importBundleRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	result, err := app.backend.Bundles.Import(r.Context(), principal, bundles.ImportParams{
		OrganizationID: req.OrganizationID, Manifest: req.Manifest,
	})
	if err != nil {
		writeBundlesError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// handleBundlesProvenance — GET /api/v1/bundles/provenance. Given a
// resource_type and a comma-separated resource_ids, reports which of those
// (normally exactly the IDs a registry's own List endpoint just returned to
// this same caller) were created via a bundle import and by which one - the
// third provenance signal alongside a registry's own already-present
// CreatedByUserID and Source fields. See bundles.Service.ResolveProvenance.
func (app *App) handleBundlesProvenance(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
	resourceType := strings.TrimSpace(r.URL.Query().Get("resource_type"))
	var resourceIDs []string
	for _, id := range strings.Split(r.URL.Query().Get("resource_ids"), ",") {
		id = strings.TrimSpace(id)
		if id != "" {
			resourceIDs = append(resourceIDs, id)
		}
	}
	provenance, err := app.backend.Bundles.ResolveProvenance(r.Context(), principal, organizationID, resourceType, resourceIDs)
	if err != nil {
		writeBundlesError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"provenance": provenance})
}
