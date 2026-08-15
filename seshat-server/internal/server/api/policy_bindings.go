package api

import (
	"net/http"
	"strings"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

type createPolicyBindingRequest struct {
	OrganizationID  string   `json:"organization_id"`
	Name            string   `json:"name"`
	Description     string   `json:"description"`
	SubjectType     string   `json:"subject_type"`
	SubjectID       string   `json:"subject_id"`
	PermissionCodes []string `json:"permission_codes"`
	ResourceType    string   `json:"resource_type"`
	ResourceID      string   `json:"resource_id"`
}

type updatePolicyBindingRequest struct {
	Name            string   `json:"name"`
	Description     string   `json:"description"`
	SubjectType     string   `json:"subject_type"`
	SubjectID       string   `json:"subject_id"`
	PermissionCodes []string `json:"permission_codes"`
	ResourceType    string   `json:"resource_type"`
	ResourceID      string   `json:"resource_id"`
}

func (app *App) handlePolicyBindings(w http.ResponseWriter, r *http.Request) {
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
		bindings, total, err := app.backend.IAM.ListPolicyBindings(r.Context(), principal, organizationID, sdb.ListParams{
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
		writeListResponse(w, http.StatusOK, "policy_bindings", bindings, query, int(total))
	case http.MethodPost:
		var req createPolicyBindingRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		binding, err := app.backend.IAM.CreatePolicyBinding(r.Context(), principal, iam.CreatePolicyBindingParams{
			OrganizationID:  req.OrganizationID,
			Name:            req.Name,
			Description:     req.Description,
			SubjectType:     req.SubjectType,
			SubjectID:       req.SubjectID,
			PermissionCodes: req.PermissionCodes,
			ResourceType:    req.ResourceType,
			ResourceID:      req.ResourceID,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, binding)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handlePolicyBindingByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	bindingID := strings.TrimSpace(r.PathValue("bindingID"))
	if bindingID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing policy binding id")
		return
	}

	switch r.Method {
	case http.MethodGet:
		binding, err := app.backend.IAM.GetPolicyBinding(r.Context(), principal, bindingID)
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, binding)
	case http.MethodPut:
		var req updatePolicyBindingRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		binding, err := app.backend.IAM.UpdatePolicyBinding(r.Context(), principal, bindingID, iam.UpdatePolicyBindingParams{
			Name:            req.Name,
			Description:     req.Description,
			SubjectType:     req.SubjectType,
			SubjectID:       req.SubjectID,
			PermissionCodes: req.PermissionCodes,
			ResourceType:    req.ResourceType,
			ResourceID:      req.ResourceID,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, binding)
	case http.MethodDelete:
		if err := app.backend.IAM.DeletePolicyBinding(r.Context(), principal, bindingID); err != nil {
			writeIAMError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
