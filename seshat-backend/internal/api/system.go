package api

import "net/http"

type systemStatusResponse struct {
	Mode      string `json:"mode"` // "standalone" | "connected"
	ServerURL string `json:"server_url,omitempty"`
}

// handleSystemStatus — GET /api/v1/system/status. Reports whether identity
// runs standalone or connected to a seshat-server (a boot-time deployment
// choice, not a live toggle — see helps/seshat-architecture-target.md §1).
func (a *App) handleSystemStatus(w http.ResponseWriter, r *http.Request) {
	if a.connectedServerURL == "" {
		writeJSON(w, http.StatusOK, systemStatusResponse{Mode: "standalone"})
		return
	}
	writeJSON(w, http.StatusOK, systemStatusResponse{Mode: "connected", ServerURL: a.connectedServerURL})
}
