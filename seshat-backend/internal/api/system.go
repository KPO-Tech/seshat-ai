package api

import (
	"net/http"

	"github.com/KPO-Tech/seshat/pkg/sdk"
)

type systemStatusResponse struct {
	Mode      string `json:"mode"` // "standalone" | "connected"
	ServerURL string `json:"server_url,omitempty"`
	// SandboxConfined reports whether bash tool execution is confined by an
	// OS-level sandbox (currently: Landlock, Linux-only) on this host. False
	// on every non-Linux desktop install today.
	SandboxConfined bool `json:"sandbox_confined"`
}

// handleSystemStatus reports whether identity runs standalone or connected to
// a seshat-server, plus host capabilities the UI should make visible.
func (a *App) handleSystemStatus(w http.ResponseWriter, r *http.Request) {
	sandboxConfined := sdk.SandboxAvailable()
	if a.connectedServerURL == "" {
		writeJSON(w, http.StatusOK, systemStatusResponse{Mode: "standalone", SandboxConfined: sandboxConfined})
		return
	}
	writeJSON(w, http.StatusOK, systemStatusResponse{Mode: "connected", ServerURL: a.connectedServerURL, SandboxConfined: sandboxConfined})
}
