package api

import (
	"net/http"
	"strconv"

	backendaudit "github.com/EngineerProjects/nexus-product/internal/audit"
)

func (a *App) handleAuditLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	q := r.URL.Query()
	limit := 50
	if raw := q.Get("limit"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			limit = v
		}
	}
	offset := 0
	if raw := q.Get("offset"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v >= 0 {
			offset = v
		}
	}

	params := backendaudit.ListParams{
		Action:       q.Get("action"),
		ResourceType: q.Get("resource_type"),
		Limit:        limit,
		Offset:       offset,
	}
	// Admin may filter by actor_user_id; non-admin is always scoped to own.
	if principal.HasRole("admin") {
		params.ActorUserID = q.Get("actor_user_id")
	}

	entries, err := a.backend.Audit.List(r.Context(), principal, params)
	if err != nil {
		writeBackendError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"logs":   entries,
		"count":  len(entries),
		"limit":  limit,
		"offset": offset,
	})
}
