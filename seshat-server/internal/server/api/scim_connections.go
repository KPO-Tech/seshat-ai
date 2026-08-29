package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/scim"
)

func writeScimConnectionError(w http.ResponseWriter, err error) { writeControlPlaneError(w, err) }

type createScimConnectionRequest struct {
	OrganizationID  string `json:"organization_id"`
	Name            string `json:"name"`
	SyncGroups      bool   `json:"sync_groups"`
	AutoCreateTeams bool   `json:"auto_create_teams"`
}

type updateScimConnectionRequest struct {
	Name            string `json:"name"`
	Enabled         bool   `json:"enabled"`
	SyncGroups      bool   `json:"sync_groups"`
	AutoCreateTeams bool   `json:"auto_create_teams"`
}

// handleScimConnection — GET/POST/PUT/DELETE /api/v1/scim-connections. A
// singleton per organization_id (query parameter), like
// GET/PUT /api/v1/web-search-org-policy — not a path-parameterized
// collection, since a client always operates on "this organization's one
// SCIM connection," never an arbitrary id it would otherwise have to look
// up first.
func (app *App) handleScimConnection(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		connection, err := app.backend.Scim.GetConnection(r.Context(), principal, organizationID)
		if err != nil {
			writeScimConnectionError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"connection": connection})

	case http.MethodPost:
		var req createScimConnectionRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		connection, err := app.backend.Scim.CreateConnection(r.Context(), principal, scim.CreateConnectionParams{
			OrganizationID: req.OrganizationID, Name: req.Name,
			SyncGroups: req.SyncGroups, AutoCreateTeams: req.AutoCreateTeams,
		})
		if err != nil {
			writeScimConnectionError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, connection)

	case http.MethodPut:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		var req updateScimConnectionRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		connection, err := app.backend.Scim.UpdateConnection(r.Context(), principal, organizationID, scim.UpdateConnectionParams{
			Name: req.Name, Enabled: req.Enabled, SyncGroups: req.SyncGroups, AutoCreateTeams: req.AutoCreateTeams,
		})
		if err != nil {
			writeScimConnectionError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, connection)

	case http.MethodDelete:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		if err := app.backend.Scim.DeleteConnection(r.Context(), principal, organizationID); err != nil {
			writeScimConnectionError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleScimConnectionEvents — GET /api/v1/scim-connections/events?organization_id=.
// The Étape 6 "recent activity" feed - see scim.Service.ListSyncEvents.
func (app *App) handleScimConnectionEvents(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	query, err := parseListQuery(r, "created_at", "desc")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
	events, total, err := app.backend.Scim.ListSyncEvents(r.Context(), principal, organizationID, query.Limit, query.Offset)
	if err != nil {
		writeScimConnectionError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": events, "total": total})
}

// handleScimConnectionRotateToken — POST /api/v1/scim-connections/rotate-token?organization_id=.
// Returns the new raw token - the one and only time it's ever readable
// again, same contract as create.
func (app *App) handleScimConnectionRotateToken(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
	connection, err := app.backend.Scim.RotateConnectionToken(r.Context(), principal, organizationID)
	if err != nil {
		writeScimConnectionError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, connection)
}
