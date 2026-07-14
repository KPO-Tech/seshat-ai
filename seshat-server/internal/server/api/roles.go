package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

type createRoleRequest struct {
	OrganizationID string   `json:"organization_id"`
	Code           string   `json:"code"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Permissions    []string `json:"permissions"`
}

type updateRoleRequest struct {
	OrganizationID string   `json:"organization_id"`
	Code           string   `json:"code"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Permissions    []string `json:"permissions"`
}

func (app *App) handleRoles(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		roles, err := app.backend.IAM.ListRoles(r.Context(), principal, organizationID)
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"roles": roles, "count": len(roles)})
	case http.MethodPost:
		var req createRoleRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		role, err := app.backend.IAM.CreateRole(r.Context(), principal, iam.CreateRoleParams{
			OrganizationID: req.OrganizationID,
			Code:           req.Code,
			Name:           req.Name,
			Description:    req.Description,
			Permissions:    req.Permissions,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, role)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleRoleByCode(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	roleCode := strings.TrimSpace(r.PathValue("roleCode"))
	if roleCode == "" {
		writeJSONError(w, http.StatusBadRequest, "missing role code")
		return
	}

	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		role, err := app.backend.IAM.GetRole(r.Context(), principal, organizationID, roleCode)
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, role)
	case http.MethodPut:
		var req updateRoleRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		role, err := app.backend.IAM.UpdateRole(r.Context(), principal, roleCode, iam.UpdateRoleParams{
			OrganizationID: req.OrganizationID,
			Code:           req.Code,
			Name:           req.Name,
			Description:    req.Description,
			Permissions:    req.Permissions,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, role)
	case http.MethodDelete:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		if err := app.backend.IAM.DeleteRole(r.Context(), principal, organizationID, roleCode); err != nil {
			writeIAMError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
