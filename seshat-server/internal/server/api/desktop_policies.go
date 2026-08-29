package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// handleDesktopPolicyCatalog — GET /api/v1/desktop-policies/catalog. Any
// authenticated member can read the fixed catalog (code, admin description,
// user-facing message, default value) — it's not organization-specific
// data, mirroring handlePermissions.
func (app *App) handleDesktopPolicyCatalog(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	catalog, err := app.backend.IAM.ListDesktopPolicyCatalog(r.Context(), principal)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"desktop_policies": catalog, "count": len(catalog)})
}

type setDesktopPolicyBindingRequest struct {
	OrganizationID string `json:"organization_id"`
	PolicyCode     string `json:"policy_code"`
	SubjectType    string `json:"subject_type"`
	SubjectID      string `json:"subject_id"`
	Value          bool   `json:"value"`
}

// handleDesktopPolicyBindings — GET (list, ?organization_id=...) and POST
// (upsert by (organization, policy_code, subject_type, subject_id), see
// iam.Service.SetDesktopPolicyBinding — there is no separate PUT-by-id
// route, since "update" and "create" are the same upsert operation here).
func (app *App) handleDesktopPolicyBindings(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		bindings, err := app.backend.IAM.ListDesktopPolicyBindings(r.Context(), principal, organizationID)
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"desktop_policy_bindings": bindings, "count": len(bindings)})
	case http.MethodPost:
		var req setDesktopPolicyBindingRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		binding, err := app.backend.IAM.SetDesktopPolicyBinding(r.Context(), principal, iam.SetDesktopPolicyBindingParams{
			OrganizationID: req.OrganizationID,
			PolicyCode:     req.PolicyCode,
			SubjectType:    req.SubjectType,
			SubjectID:      req.SubjectID,
			Value:          req.Value,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, binding)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleDesktopPolicyBindingByID — DELETE /api/v1/desktop-policy-bindings/{bindingID}.
// Removes one specific assignment; the affected subject falls back to
// whatever the next-most-specific applicable binding says, or the catalog
// default if none remain.
func (app *App) handleDesktopPolicyBindingByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	bindingID := strings.TrimSpace(r.PathValue("bindingID"))
	if bindingID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing desktop policy binding id")
		return
	}
	if r.Method != http.MethodDelete {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if err := app.backend.IAM.DeleteDesktopPolicyBinding(r.Context(), principal, bindingID); err != nil {
		writeIAMError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
