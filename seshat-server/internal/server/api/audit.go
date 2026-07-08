package api

import (
	"net/http"
	"strings"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func (app *App) handleAuditEvents(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	query, err := parseListQuery(r, "created_at", "desc")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	params := iam.ListAuditEventsParams{
		OrganizationID: strings.TrimSpace(r.URL.Query().Get("organization_id")),
		ActorUserID:    strings.TrimSpace(r.URL.Query().Get("actor_user_id")),
		Action:         strings.TrimSpace(r.URL.Query().Get("action")),
		ResourceType:   strings.TrimSpace(r.URL.Query().Get("resource_type")),
	}

	events, total, err := app.backend.IAM.ListAuditEvents(r.Context(), principal, params, sdb.ListParams{
		Search: query.Search,
		Sort:   query.Sort,
		Order:  query.Order,
		Limit:  query.Limit,
		Offset: query.Offset,
	})
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeListResponse(w, http.StatusOK, "audit_events", events, query, int(total))
}
