package api

import (
	"encoding/json"
	"net/http"
)

// These handlers cover pairing this device and read-only run visibility.
// Job management (create/edit/pause/delete/trigger) lives in automation_jobs.go.

func (a *App) cloudAutomationAvailable(w http.ResponseWriter) bool {
	if a.cloudAutomation == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "cloud automation is not available")
		return false
	}
	return true
}

// handleAutomationStatus — GET /api/v1/automation/status
func (a *App) handleAutomationStatus(w http.ResponseWriter, r *http.Request) {
	if !a.cloudAutomationAvailable(w) {
		return
	}
	status, err := a.cloudAutomation.Status(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, status)
}

type connectAutomationRequest struct {
	ServerURL   string `json:"server_url"`
	DeviceToken string `json:"device_token"`
}

// handleAutomationConnect — POST /api/v1/automation/connect
func (a *App) handleAutomationConnect(w http.ResponseWriter, r *http.Request) {
	if !a.cloudAutomationAvailable(w) {
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req connectAutomationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	status, err := a.cloudAutomation.Connect(r.Context(), principal.User.ID, req.ServerURL, req.DeviceToken)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, status)
}

// handleAutomationRegisterDevice: POST /api/v1/automation/register-device.
// One-click pairing: registers this machine as a device using the caller's
// existing authenticated session (no manual server_url/device_token entry),
// only available when this backend is itself running in connected mode.
func (a *App) handleAutomationRegisterDevice(w http.ResponseWriter, r *http.Request) {
	if !a.cloudAutomationAvailable(w) {
		return
	}
	if a.connectedServerURL == "" {
		writeJSONError(w, http.StatusBadRequest, "this device is not connected to an organization server")
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req) // name is optional; a missing/invalid body just means "use the default"

	status, err := a.cloudAutomation.RegisterAndConnect(
		r.Context(),
		principal.User.ID,
		a.connectedServerURL,
		principal.AuthSession.ID,
		principal.OrganizationID(),
		req.Name,
	)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, status)
}

// handleAutomationDisconnect — POST /api/v1/automation/disconnect
func (a *App) handleAutomationDisconnect(w http.ResponseWriter, r *http.Request) {
	if !a.cloudAutomationAvailable(w) {
		return
	}
	if _, ok := authPrincipalFromContext(r.Context()); !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if err := a.cloudAutomation.Disconnect(r.Context()); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleAutomationRuns — GET /api/v1/automation/runs (read-only visibility
// of runs assigned to this device; management stays in seshat-console).
func (a *App) handleAutomationRuns(w http.ResponseWriter, r *http.Request) {
	if !a.cloudAutomationAvailable(w) {
		return
	}
	if _, ok := authPrincipalFromContext(r.Context()); !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	runs, err := a.cloudAutomation.RecentRuns(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"runs": runs, "count": len(runs)})
}
