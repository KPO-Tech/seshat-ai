package api

import (
	"net/http"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/preferences"
)

type upsertPreferencesRequest struct {
	PreferredName             string `json:"preferred_name"`
	Profession                string `json:"profession"`
	About                     string `json:"about"`
	WorkingStyle              string `json:"working_style"`
	ResponseStyle             string `json:"response_style"`
	ExtraContext              string `json:"extra_context"`
	InteractivePermissionMode string `json:"interactive_permission_mode"`
	AutomationPermissionMode  string `json:"automation_permission_mode"`
	MaxSubAgentDepth          int    `json:"max_sub_agent_depth"`
}

// handleUserPreferences — GET/PUT /api/v1/users/me/preferences. Self-service
// only: there is no {userID} path variant — a preference only ever means
// "mine," see preferences.Service's doc comment.
func (app *App) handleUserPreferences(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	switch r.Method {
	case http.MethodGet:
		prefs, err := app.backend.Preferences.GetMyPreferences(r.Context(), principal)
		if err != nil {
			writePreferencesError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, prefs)
	case http.MethodPut:
		var req upsertPreferencesRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		prefs, err := app.backend.Preferences.UpsertMyPreferences(r.Context(), principal, preferences.UpsertParams{
			PreferredName:             req.PreferredName,
			Profession:                req.Profession,
			About:                     req.About,
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
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
