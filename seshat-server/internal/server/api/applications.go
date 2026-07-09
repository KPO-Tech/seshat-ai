package api

import (
	"net/http"
	"strings"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

type createApplicationRequest struct {
	OrganizationID         string            `json:"organization_id"`
	Name                   string            `json:"name"`
	Slug                   string            `json:"slug"`
	DisplayName            string            `json:"display_name"`
	Description            string            `json:"description"`
	Protocol               string            `json:"protocol"`
	Enabled                *bool             `json:"enabled"`
	HomepageURL            string            `json:"homepage_url"`
	CallbackURL            string            `json:"callback_url"`
	RedirectURLs           []string          `json:"redirect_urls"`
	PostLogoutRedirectURLs []string          `json:"post_logout_redirect_urls"`
	AllowedOrigins         []string          `json:"allowed_origins"`
	GrantTypes             []string          `json:"grant_types"`
	ResponseTypes          []string          `json:"response_types"`
	Scopes                 []string          `json:"scopes"`
	ProviderIDs            []string          `json:"provider_ids"`
	SigninURL              string            `json:"signin_url"`
	SignupURL              string            `json:"signup_url"`
	AllowSignup            bool              `json:"allow_signup"`
	AllowPasswordLogin     bool              `json:"allow_password_login"`
	PKCERequired           bool              `json:"pkce_required"`
	SkipConsent            bool              `json:"skip_consent"`
	IssueRefreshToken      bool              `json:"issue_refresh_token"`
	Configuration          map[string]string `json:"configuration"`
}

type updateApplicationRequest struct {
	Name                   string            `json:"name"`
	Slug                   string            `json:"slug"`
	DisplayName            string            `json:"display_name"`
	Description            string            `json:"description"`
	Protocol               string            `json:"protocol"`
	Enabled                *bool             `json:"enabled"`
	HomepageURL            string            `json:"homepage_url"`
	CallbackURL            string            `json:"callback_url"`
	RedirectURLs           []string          `json:"redirect_urls"`
	PostLogoutRedirectURLs []string          `json:"post_logout_redirect_urls"`
	AllowedOrigins         []string          `json:"allowed_origins"`
	GrantTypes             []string          `json:"grant_types"`
	ResponseTypes          []string          `json:"response_types"`
	Scopes                 []string          `json:"scopes"`
	ProviderIDs            []string          `json:"provider_ids"`
	SigninURL              string            `json:"signin_url"`
	SignupURL              string            `json:"signup_url"`
	AllowSignup            bool              `json:"allow_signup"`
	AllowPasswordLogin     bool              `json:"allow_password_login"`
	PKCERequired           bool              `json:"pkce_required"`
	SkipConsent            bool              `json:"skip_consent"`
	IssueRefreshToken      bool              `json:"issue_refresh_token"`
	Configuration          map[string]string `json:"configuration"`
}

func (app *App) handleApplications(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	// The optional organization_id query keeps the API flexible for future
	// organization-scoped admin pages.
	organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))

	switch r.Method {
	case http.MethodGet:
		query, err := parseListQuery(r, "name", "asc")
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}

		applications, total, err := app.backend.IAM.ListApplications(r.Context(), principal, organizationID, sdb.ListParams{
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
		for i := range applications {
			applications[i].ClientSecret = redactSecret(applications[i].ClientSecret)
		}
		writeListResponse(w, http.StatusOK, "applications", applications, query, int(total))
	case http.MethodPost:
		var req createApplicationRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		application, err := app.backend.IAM.CreateApplication(r.Context(), principal, iam.CreateApplicationParams{
			OrganizationID:         req.OrganizationID,
			Name:                   req.Name,
			Slug:                   req.Slug,
			DisplayName:            req.DisplayName,
			Description:            req.Description,
			Protocol:               req.Protocol,
			Enabled:                req.Enabled,
			HomepageURL:            req.HomepageURL,
			CallbackURL:            req.CallbackURL,
			RedirectURLs:           req.RedirectURLs,
			PostLogoutRedirectURLs: req.PostLogoutRedirectURLs,
			AllowedOrigins:         req.AllowedOrigins,
			GrantTypes:             req.GrantTypes,
			ResponseTypes:          req.ResponseTypes,
			Scopes:                 req.Scopes,
			ProviderIDs:            req.ProviderIDs,
			SigninURL:              req.SigninURL,
			SignupURL:              req.SignupURL,
			AllowSignup:            req.AllowSignup,
			AllowPasswordLogin:     req.AllowPasswordLogin,
			PKCERequired:           req.PKCERequired,
			SkipConsent:            req.SkipConsent,
			IssueRefreshToken:      req.IssueRefreshToken,
			Configuration:          req.Configuration,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, application)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleApplicationByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	applicationID := strings.TrimSpace(r.PathValue("applicationID"))
	if applicationID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing application id")
		return
	}

	switch r.Method {
	case http.MethodGet:
		application, err := app.backend.IAM.GetApplication(r.Context(), principal, applicationID)
		if err != nil {
			writeIAMError(w, err)
			return
		}
		application.ClientSecret = redactSecret(application.ClientSecret)
		writeJSON(w, http.StatusOK, application)
	case http.MethodPut:
		var req updateApplicationRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}

		// Update payloads intentionally omit organization_id for now because
		// moving an app across organizations would require extra invariants.
		application, err := app.backend.IAM.UpdateApplication(r.Context(), principal, applicationID, iam.UpdateApplicationParams{
			Name:                   req.Name,
			Slug:                   req.Slug,
			DisplayName:            req.DisplayName,
			Description:            req.Description,
			Protocol:               req.Protocol,
			Enabled:                req.Enabled,
			HomepageURL:            req.HomepageURL,
			CallbackURL:            req.CallbackURL,
			RedirectURLs:           req.RedirectURLs,
			PostLogoutRedirectURLs: req.PostLogoutRedirectURLs,
			AllowedOrigins:         req.AllowedOrigins,
			GrantTypes:             req.GrantTypes,
			ResponseTypes:          req.ResponseTypes,
			Scopes:                 req.Scopes,
			ProviderIDs:            req.ProviderIDs,
			SigninURL:              req.SigninURL,
			SignupURL:              req.SignupURL,
			AllowSignup:            req.AllowSignup,
			AllowPasswordLogin:     req.AllowPasswordLogin,
			PKCERequired:           req.PKCERequired,
			SkipConsent:            req.SkipConsent,
			IssueRefreshToken:      req.IssueRefreshToken,
			Configuration:          req.Configuration,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		application.ClientSecret = redactSecret(application.ClientSecret)
		writeJSON(w, http.StatusOK, application)
	case http.MethodDelete:
		if err := app.backend.IAM.DeleteApplication(r.Context(), principal, applicationID); err != nil {
			writeIAMError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
