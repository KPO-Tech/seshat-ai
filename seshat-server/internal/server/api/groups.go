package api

import (
	"net/http"
	"strings"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

type createGroupRequest struct {
	OrganizationID string   `json:"organization_id"`
	Name           string   `json:"name"`
	Slug           string   `json:"slug"`
	Description    string   `json:"description"`
	MemberUserIDs  []string `json:"member_user_ids"`
}

type updateGroupRequest struct {
	Name          string   `json:"name"`
	Slug          string   `json:"slug"`
	Description   string   `json:"description"`
	MemberUserIDs []string `json:"member_user_ids"`
}

func (app *App) handleGroups(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))

	switch r.Method {
	case http.MethodGet:
		query, err := parseListQuery(r, "name", "asc")
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		groups, total, err := app.backend.IAM.ListGroups(r.Context(), principal, organizationID, sdb.ListParams{
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
		writeListResponse(w, http.StatusOK, "groups", groups, query, int(total))
	case http.MethodPost:
		var req createGroupRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		group, err := app.backend.IAM.CreateGroup(r.Context(), principal, iam.CreateGroupParams{
			OrganizationID: req.OrganizationID,
			Name:           req.Name,
			Slug:           req.Slug,
			Description:    req.Description,
			MemberUserIDs:  req.MemberUserIDs,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, group)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleGroupByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	groupID := strings.TrimSpace(r.PathValue("groupID"))
	if groupID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing group id")
		return
	}

	switch r.Method {
	case http.MethodGet:
		group, err := app.backend.IAM.GetGroup(r.Context(), principal, groupID)
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, group)
	case http.MethodPut:
		var req updateGroupRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		group, err := app.backend.IAM.UpdateGroup(r.Context(), principal, groupID, iam.UpdateGroupParams{
			Name:          req.Name,
			Slug:          req.Slug,
			Description:   req.Description,
			MemberUserIDs: req.MemberUserIDs,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, group)
	case http.MethodDelete:
		if err := app.backend.IAM.DeleteGroup(r.Context(), principal, groupID); err != nil {
			writeIAMError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
