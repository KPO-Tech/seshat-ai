package api

import (
	"net/http"
	"strings"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

type createUserRequest struct {
	Email          string `json:"email"`
	Password       string `json:"password"`
	DisplayName    string `json:"display_name"`
	OrganizationID string `json:"organization_id"`
	Role           string `json:"role"`
	IsAdmin        bool   `json:"is_admin"`
}

type updateUserRequest struct {
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	IsAdmin     bool   `json:"is_admin"`
}

func (app *App) handleUsers(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	switch r.Method {
	case http.MethodGet:
		query, err := parseListQuery(r, "email", "asc")
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}

		users, total, err := app.backend.IAM.ListUsers(r.Context(), principal, sdb.ListParams{
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
		writeListResponse(w, http.StatusOK, "users", users, query, int(total))
	case http.MethodPost:
		var req createUserRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		user, err := app.backend.IAM.CreateUser(r.Context(), principal, iam.CreateUserParams{
			Email:          req.Email,
			Password:       req.Password,
			DisplayName:    req.DisplayName,
			OrganizationID: req.OrganizationID,
			Role:           req.Role,
			IsAdmin:        req.IsAdmin,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, user)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleUserByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	userID := strings.TrimSpace(r.PathValue("userID"))
	if userID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing user id")
		return
	}

	switch r.Method {
	case http.MethodGet:
		user, err := app.backend.IAM.GetUser(r.Context(), principal, userID)
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, user)
	case http.MethodPut:
		var req updateUserRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		user, err := app.backend.IAM.UpdateUser(r.Context(), principal, userID, iam.UpdateUserParams{
			Email:       req.Email,
			DisplayName: req.DisplayName,
			IsAdmin:     req.IsAdmin,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, user)
	case http.MethodDelete:
		if err := app.backend.IAM.DeleteUser(r.Context(), principal, userID); err != nil {
			writeIAMError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleUserSessionsDelete(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	userID := strings.TrimSpace(r.PathValue("userID"))
	if userID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing user id")
		return
	}

	count, err := app.backend.IAM.RevokeUserSessions(r.Context(), principal, userID)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"revoked_count": count})
}
