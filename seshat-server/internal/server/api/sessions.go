package api

import (
	"net/http"
	"strings"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func (app *App) handleSessions(w http.ResponseWriter, r *http.Request) {
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

	params := iam.ListSessionsParams{
		UserID:         strings.TrimSpace(r.URL.Query().Get("user_id")),
		OrganizationID: strings.TrimSpace(r.URL.Query().Get("organization_id")),
	}

	sessions, total, err := app.backend.IAM.ListSessions(r.Context(), principal, params, sdb.ListParams{
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
	writeListResponse(w, http.StatusOK, "sessions", sessions, query, int(total))
}

func (app *App) handleSessionByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	sessionID := strings.TrimSpace(r.PathValue("sessionID"))
	if sessionID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing session id")
		return
	}

	if err := app.backend.IAM.RevokeSession(r.Context(), principal, sessionID); err != nil {
		writeIAMError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
