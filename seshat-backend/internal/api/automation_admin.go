package api

import (
	"encoding/json"
	"net/http"
	"strings"
)

// ─── Response types ────────────────────────────────────────────────────────────

type automationActivationResponse struct {
	UserID    string `json:"user_id"`
	Enabled   bool   `json:"enabled"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

// ─── Handlers ──────────────────────────────────────────────────────────────────

// handleAdminAutomationActivations lists all activation records.
// GET /api/v1/admin/automation/activations
func (a *App) handleAdminAutomationActivations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if a.backend.AutomationActivationStore == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "automation activation store unavailable")
		return
	}
	activations, err := a.backend.AutomationActivationStore.List(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	resp := make([]automationActivationResponse, 0, len(activations))
	for _, a := range activations {
		resp = append(resp, automationActivationResponse{
			UserID:    a.UserID,
			Enabled:   a.Enabled,
			UpdatedAt: a.UpdatedAt.Format("2006-01-02T15:04:05Z"),
		})
	}
	writeJSON(w, http.StatusOK, resp)
}

// handleAdminAutomationActivateUser enables automation for a user.
// POST /api/v1/admin/automation/users/{user_id}/activate
func (a *App) handleAdminAutomationActivateUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if a.backend.AutomationActivationStore == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "automation activation store unavailable")
		return
	}
	userID := strings.TrimPrefix(r.URL.Path, "/api/v1/admin/automation/users/")
	userID = strings.TrimSuffix(userID, "/activate")
	userID = strings.TrimSpace(userID)
	if userID == "" {
		writeJSONError(w, http.StatusBadRequest, "user_id required in path")
		return
	}
	if err := a.backend.AutomationActivationStore.Enable(r.Context(), userID); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, automationActivationResponse{UserID: userID, Enabled: true})
}

// handleAdminAutomationDeactivateUser disables automation for a user.
// DELETE /api/v1/admin/automation/users/{user_id}/activate
func (a *App) handleAdminAutomationDeactivateUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if a.backend.AutomationActivationStore == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "automation activation store unavailable")
		return
	}
	userID := strings.TrimPrefix(r.URL.Path, "/api/v1/admin/automation/users/")
	userID = strings.TrimSuffix(userID, "/activate")
	userID = strings.TrimSpace(userID)
	if userID == "" {
		writeJSONError(w, http.StatusBadRequest, "user_id required in path")
		return
	}
	if err := a.backend.AutomationActivationStore.Disable(r.Context(), userID); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, automationActivationResponse{UserID: userID, Enabled: false})
}

// handleAdminAutomationUserStatus returns the activation status for one user.
// GET /api/v1/admin/automation/users/{user_id}/activate
func (a *App) handleAdminAutomationUserStatus(w http.ResponseWriter, r *http.Request) {
	if a.backend.AutomationActivationStore == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "automation activation store unavailable")
		return
	}
	userID := strings.TrimPrefix(r.URL.Path, "/api/v1/admin/automation/users/")
	userID = strings.TrimSuffix(userID, "/activate")
	userID = strings.TrimSpace(userID)
	if userID == "" {
		writeJSONError(w, http.StatusBadRequest, "user_id required in path")
		return
	}
	enabled, err := a.backend.AutomationActivationStore.IsEnabled(r.Context(), userID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, automationActivationResponse{UserID: userID, Enabled: enabled})
}

// automationActivateDispatch routes GET/POST/DELETE for /admin/automation/users/{id}/activate.
func (a *App) automationActivateDispatch(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		a.handleAdminAutomationUserStatus(w, r)
	case http.MethodPost:
		a.handleAdminAutomationActivateUser(w, r)
	case http.MethodDelete:
		a.handleAdminAutomationDeactivateUser(w, r)
	default:
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// handleAdminAutomationDispatch routes /admin/automation/users/{id}/activate
// and /admin/automation/users/{id}/keys to the appropriate sub-handlers.
func (a *App) handleAdminAutomationDispatch(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Path
	switch {
	case strings.HasSuffix(p, "/activate"):
		a.automationActivateDispatch(w, r)
	case strings.HasSuffix(p, "/keys"):
		a.handleAdminAutomationGenerateKey(w, r)
	default:
		writeJSONError(w, http.StatusNotFound, "not found")
	}
}

// handleAdminAutomationGenerateKey calls the daemon's admin API to create a
// sats_ key for a user and returns the raw key (shown once).
// POST /api/v1/admin/automation/users/{user_id}/keys
func (a *App) handleAdminAutomationGenerateKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if a.automationClient == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "automation service not configured")
		return
	}

	userID := strings.TrimPrefix(r.URL.Path, "/api/v1/admin/automation/users/")
	userID = strings.TrimSuffix(userID, "/keys")
	userID = strings.TrimSpace(userID)
	if userID == "" {
		writeJSONError(w, http.StatusBadRequest, "user_id required in path")
		return
	}

	var body struct {
		Label string `json:"label"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	result, err := a.automationClient.CreateAPIKey(r.Context(), userID, body.Label)
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, "daemon error: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, result)
}
