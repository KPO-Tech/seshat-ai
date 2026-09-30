package api

import (
	"net/http"
	"strings"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

type createOrganizationRequest struct {
	Name         string `json:"name"`
	Slug         string `json:"slug"`
	Description  string `json:"description"`
	WebsiteURL   string `json:"website_url"`
	SupportEmail string `json:"support_email"`
	Domain       string `json:"domain"`
}

type updateOrganizationRequest struct {
	Name          string `json:"name"`
	Slug          string `json:"slug"`
	Description   string `json:"description"`
	WebsiteURL    string `json:"website_url"`
	SupportEmail  string `json:"support_email"`
	Domain        string `json:"domain"`
	MinAppVersion string `json:"min_app_version"`
}

func (app *App) handleOrganizations(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	switch r.Method {
	case http.MethodGet:
		query, err := parseListQuery(r, "name", "asc")
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}

		organizations, total, err := app.backend.IAM.ListOrganizations(r.Context(), principal, sdb.ListParams{
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
		writeListResponse(w, http.StatusOK, "organizations", organizations, query, int(total))
	case http.MethodPost:
		var req createOrganizationRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		organization, err := app.backend.IAM.CreateOrganization(r.Context(), principal, iam.CreateOrganizationParams{
			Name:         req.Name,
			Slug:         req.Slug,
			Description:  req.Description,
			WebsiteURL:   req.WebsiteURL,
			SupportEmail: req.SupportEmail,
			Domain:       req.Domain,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, organization)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleOrganizationByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	organizationID := strings.TrimSpace(r.PathValue("organizationID"))
	if organizationID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing organization id")
		return
	}

	switch r.Method {
	case http.MethodGet:
		organization, err := app.backend.IAM.GetOrganization(r.Context(), principal, organizationID)
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, organization)
	case http.MethodPut:
		var req updateOrganizationRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}

		// Organization updates keep the tenant identity stable while allowing the
		// admin console to edit human-facing settings and routing slugs.
		organization, err := app.backend.IAM.UpdateOrganization(r.Context(), principal, organizationID, iam.UpdateOrganizationParams{
			Name:          req.Name,
			Slug:          req.Slug,
			Description:   req.Description,
			WebsiteURL:    req.WebsiteURL,
			SupportEmail:  req.SupportEmail,
			Domain:        req.Domain,
			MinAppVersion: req.MinAppVersion,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, organization)
	case http.MethodDelete:
		if err := app.backend.IAM.DeleteOrganization(r.Context(), principal, organizationID); err != nil {
			writeIAMError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleOrganizationVerifyDomain — POST /api/v1/organizations/{organizationID}/verify-domain.
// Resolves the DNS TXT challenge published for the organization's claimed
// Domain and marks it verified on a match - see
// iam.Service.VerifyOrganizationDomain's doc comment for why this exists at
// all (closing a real domain-ownership gap, not a hardening nice-to-have).
func (app *App) handleOrganizationVerifyDomain(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	organizationID := strings.TrimSpace(r.PathValue("organizationID"))
	if organizationID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing organization id")
		return
	}
	organization, err := app.backend.IAM.VerifyOrganizationDomain(r.Context(), principal, organizationID)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, organization)
}
