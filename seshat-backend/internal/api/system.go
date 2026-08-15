package api

import (
	"context"
	"net/http"
	"os"
	"strings"

	backendsettings "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/settings"
	"github.com/KPO-Tech/seshat/pkg/sdk"
)

type systemStatusResponse struct {
	Mode      string `json:"mode"` // "standalone" | "connected"
	ServerURL string `json:"server_url,omitempty"`
	// SandboxConfined reports whether bash tool execution is confined by an
	// OS-level sandbox on this host - either a Docker sandbox container
	// (desktop default since query client construction, any OS with Docker
	// installed and running) or Landlock (Linux-only, used when Docker isn't
	// available). False only when neither backend is available.
	SandboxConfined bool `json:"sandbox_confined"`
	// SandboxKind is which of the two backends above is actually active:
	// "docker", "landlock", or "" when neither is.
	SandboxKind string `json:"sandbox_kind,omitempty"`
	// DoclingConfigured/LocalSTTConfigured report whether the optional
	// binary-document-conversion and local-speech-to-text backends are set
	// up on this install — both degrade gracefully when unset (plain-text
	// fallback for docling, no voice input for local STT), but the app
	// should say so explicitly rather than silently drop the capability.
	// See helps/audit-2026-08-10.md §Phase 2 for why this was added.
	DoclingConfigured  bool `json:"docling_configured"`
	LocalSTTConfigured bool `json:"local_stt_configured"`
	// ImageGenerationConfigured mirrors internal/config/bootstrap.go's
	// defaultImageGenerationConfig resolution order (capability link first,
	// then OPENAI_API_KEY/GOOGLE_API_KEY) without importing that package
	// (config -> api is the only allowed direction). Kept in sync manually;
	// update both if the resolution order there ever changes.
	ImageGenerationConfigured bool `json:"image_generation_configured"`
}

// handleSystemStatus reports whether identity runs standalone or connected to
// a seshat-server, plus host capabilities the UI should make visible.
func (a *App) handleSystemStatus(w http.ResponseWriter, r *http.Request) {
	sandboxKind := ""
	sandboxConfined := false
	switch {
	case a.sandboxKind == string(sdk.SandboxKindDocker):
		sandboxKind = "docker"
		sandboxConfined = true
	case sdk.SandboxAvailable():
		sandboxKind = "landlock"
		sandboxConfined = true
	}
	doclingConfigured := false
	if a.doclingStore != nil {
		if cfg, err := a.doclingStore.Get(r.Context()); err == nil && cfg != nil {
			doclingConfigured = cfg.Enabled && strings.TrimSpace(cfg.BaseURL) != ""
		}
	}
	localSTTConfigured := false
	if a.localSTTStore != nil {
		if cfg, err := a.localSTTStore.Get(r.Context()); err == nil && cfg != nil {
			localSTTConfigured = cfg.Enabled && strings.TrimSpace(cfg.BaseURL) != ""
		}
	}
	resp := systemStatusResponse{
		SandboxConfined:           sandboxConfined,
		SandboxKind:               sandboxKind,
		DoclingConfigured:         doclingConfigured,
		LocalSTTConfigured:        localSTTConfigured,
		ImageGenerationConfigured: a.imageGenerationConfigured(r.Context()),
	}
	if a.connectedServerURL == "" {
		resp.Mode = "standalone"
	} else {
		resp.Mode = "connected"
		resp.ServerURL = a.connectedServerURL
	}
	writeJSON(w, http.StatusOK, resp)
}

// imageGenerationConfigured reports whether the generate_image tool has a
// usable credential, following the same order as bootstrap.go's
// defaultImageGenerationConfig: an opt-in capability link to an
// already-configured chat provider first, then the standalone
// OPENAI_API_KEY/GOOGLE_API_KEY env vars set via Settings > Environment.
func (a *App) imageGenerationConfigured(ctx context.Context) bool {
	if a.capabilityLinkStore != nil && a.providerSettingStore != nil {
		if providerSettingID, linked, err := a.capabilityLinkStore.Get(ctx, string(backendsettings.CapabilityImage)); err == nil && linked {
			if setting, err := a.providerSettingStore.GetByID(ctx, providerSettingID); err == nil && setting.HasAPIKey {
				return true
			}
		}
	}
	return strings.TrimSpace(os.Getenv("OPENAI_API_KEY")) != "" || strings.TrimSpace(os.Getenv("GOOGLE_API_KEY")) != ""
}
