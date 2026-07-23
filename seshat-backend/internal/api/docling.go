package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	"github.com/KPO-Tech/seshat/pkg/docling"
)

type doclingConfigResponse struct {
	BaseURL   string `json:"base_url,omitempty"`
	Enabled   bool   `json:"enabled"`
	UpdatedAt int64  `json:"updated_at,omitempty"`
}

func doclingConfigToResponse(cfg *db.DoclingConfig) doclingConfigResponse {
	if cfg == nil {
		return doclingConfigResponse{Enabled: true}
	}
	var updatedAt int64
	if !cfg.UpdatedAt.IsZero() && cfg.UpdatedAt.Unix() > 0 {
		updatedAt = cfg.UpdatedAt.Unix()
	}
	return doclingConfigResponse{
		BaseURL:   cfg.BaseURL,
		Enabled:   cfg.Enabled,
		UpdatedAt: updatedAt,
	}
}

// GET  /api/v1/settings/docling
// PUT  /api/v1/settings/docling
// POST /api/v1/settings/docling/test
func (a *App) handleDoclingConfig(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}

	store := a.doclingStore
	if store == nil {
		writeBackendError(w, bkerr.Unavailable("docling config store not available", nil))
		return
	}

	tail := strings.TrimRight(r.URL.Path, "/")

	// POST .../test
	if strings.HasSuffix(tail, "/test") {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		a.handleDoclingTest(w, r, store)
		return
	}

	switch r.Method {
	case http.MethodGet:
		cfg, err := store.Get(r.Context())
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to get docling config", err))
			return
		}
		writeJSON(w, http.StatusOK, doclingConfigToResponse(cfg))

	case http.MethodPut:
		var body struct {
			BaseURL string `json:"base_url"`
			Enabled bool   `json:"enabled"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		cfg, err := store.Upsert(r.Context(), db.UpsertDoclingConfigParams{
			BaseURL: body.BaseURL,
			Enabled: body.Enabled,
		})
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to save docling config: "+err.Error(), err))
			return
		}
		writeJSON(w, http.StatusOK, doclingConfigToResponse(cfg))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleDoclingTest checks whether a docling-serve instance is reachable —
// either the one in the request body (test-before-save) or, if omitted, the
// currently saved one.
func (a *App) handleDoclingTest(w http.ResponseWriter, r *http.Request, store *db.DoclingConfigStore) {
	// Accept an optional body to test a not-yet-saved URL.
	var body struct {
		BaseURL string `json:"base_url"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	baseURL := strings.TrimSpace(body.BaseURL)
	if baseURL == "" {
		if cfg, err := store.Get(r.Context()); err == nil && cfg != nil {
			baseURL = cfg.BaseURL
		}
	}

	if baseURL == "" {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":         false,
			"latency_ms": 0,
			"error":      "base_url is required",
		})
		return
	}

	client := docling.NewClient(baseURL)
	start := time.Now()
	available := client.IsAvailable(r.Context())
	latency := time.Since(start).Milliseconds()

	if !available {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":         false,
			"latency_ms": latency,
			"error":      "docling-serve is not reachable at this URL",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"latency_ms": latency,
		"error":      nil,
	})
}
