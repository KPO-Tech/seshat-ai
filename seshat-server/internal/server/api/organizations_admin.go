package api

import (
	"net/http"
	"strings"
)

// handleOrganizationSetDefault flags this organization as the platform's
// default (its ProviderSetting/EmbedderSetting rows become the fallback
// used by every other org with none of its own). Superadmin-only.
func (app *App) handleOrganizationSetDefault(w http.ResponseWriter, r *http.Request) {
	app.setOrganizationDefault(w, r, true)
}

// handleOrganizationUnsetDefault clears the default flag from this
// organization, if it currently holds it. Superadmin-only.
func (app *App) handleOrganizationUnsetDefault(w http.ResponseWriter, r *http.Request) {
	app.setOrganizationDefault(w, r, false)
}

func (app *App) setOrganizationDefault(w http.ResponseWriter, r *http.Request, isDefault bool) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	organizationID := strings.TrimSpace(r.PathValue("organizationID"))
	if organizationID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing organization id")
		return
	}
	organization, err := app.backend.IAM.SetOrganizationDefault(r.Context(), principal, organizationID, isDefault)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, organization)
}

// handleOrganizationActivate/Deactivate flag an organization active/inactive
// — administrative/visual only for now, no request-path enforcement.
// Superadmin-only.
func (app *App) handleOrganizationActivate(w http.ResponseWriter, r *http.Request) {
	app.setOrganizationActive(w, r, true)
}

func (app *App) handleOrganizationDeactivate(w http.ResponseWriter, r *http.Request) {
	app.setOrganizationActive(w, r, false)
}

func (app *App) setOrganizationActive(w http.ResponseWriter, r *http.Request, isActive bool) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	organizationID := strings.TrimSpace(r.PathValue("organizationID"))
	if organizationID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing organization id")
		return
	}
	organization, err := app.backend.IAM.SetOrganizationActive(r.Context(), principal, organizationID, isActive)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, organization)
}

type organizationSharedDomainsRequest struct {
	ShareProviderSettings        *bool `json:"share_provider_settings"`
	ShareEmbedderSettings        *bool `json:"share_embedder_settings"`
	ShareWebSearchSettings       *bool `json:"share_web_search_settings"`
	ShareMCPServers              *bool `json:"share_mcp_servers"`
	ShareSkillRepos              *bool `json:"share_skill_repos"`
	ShareOrganizationPreferences *bool `json:"share_organization_preferences"`
}

// handleOrganizationSharedDomains lets a superadmin choose which settings
// domains this organization shares with every other organization while it
// holds IsDefault - independently per domain, instead of IsDefault sharing
// everything unconditionally. Any field omitted from the body leaves that
// domain's flag unchanged. Superadmin-only.
func (app *App) handleOrganizationSharedDomains(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	organizationID := strings.TrimSpace(r.PathValue("organizationID"))
	if organizationID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing organization id")
		return
	}
	var req organizationSharedDomainsRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	organization, err := app.backend.IAM.SetOrganizationSharedDomains(
		r.Context(), principal, organizationID,
		req.ShareProviderSettings, req.ShareEmbedderSettings, req.ShareWebSearchSettings, req.ShareMCPServers, req.ShareSkillRepos,
		req.ShareOrganizationPreferences,
	)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, organization)
}
