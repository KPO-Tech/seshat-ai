package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/preferences"
)

type upsertOrganizationPreferencesRequest struct {
	OrganizationID            string `json:"organization_id"`
	WorkingStyle              string `json:"working_style"`
	ResponseStyle             string `json:"response_style"`
	ExtraContext              string `json:"extra_context"`
	InteractivePermissionMode string `json:"interactive_permission_mode"`
	AutomationPermissionMode  string `json:"automation_permission_mode"`
	MaxSubAgentDepth          int    `json:"max_sub_agent_depth"`
}

// handleOrganizationPreferences is a singleton settings resource (at most
// one OrganizationPreference per organization — see its doc comment in
// db/models.go), so like handleEmbedderSettings this is GET/PUT/DELETE
// keyed by organization_id rather than a resource id path. Requires
// organization.manage — a member sees this domain's effect only, merged
// transparently into GET /api/v1/users/me/preferences (see
// preferences.Service.GetMyPreferences), not this endpoint directly.
func (app *App) handleOrganizationPreferences(w http.ResponseWriter, r *http.Request) {
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
		prefs, err := app.backend.Preferences.GetOrganizationPreferences(r.Context(), principal, organizationID)
		if err != nil {
			writePreferencesError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, prefs)
	case http.MethodPut:
		var req upsertOrganizationPreferencesRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		organizationID := strings.TrimSpace(req.OrganizationID)
		if organizationID == "" {
			writeJSONError(w, http.StatusBadRequest, "organization_id is required")
			return
		}
		prefs, err := app.backend.Preferences.UpsertOrganizationPreferences(r.Context(), principal, organizationID, preferences.UpsertOrganizationPreferencesParams{
			WorkingStyle:              req.WorkingStyle,
			ResponseStyle:             req.ResponseStyle,
			ExtraContext:              req.ExtraContext,
			InteractivePermissionMode: req.InteractivePermissionMode,
			AutomationPermissionMode:  req.AutomationPermissionMode,
			MaxSubAgentDepth:          req.MaxSubAgentDepth,
		})
		if err != nil {
			writePreferencesError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, prefs)
	case http.MethodDelete:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		if organizationID == "" {
			writeJSONError(w, http.StatusBadRequest, "organization_id is required")
			return
		}
		if err := app.backend.Preferences.DeleteOrganizationPreferences(r.Context(), principal, organizationID); err != nil {
			writePreferencesError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
