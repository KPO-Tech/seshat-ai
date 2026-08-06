package api

import (
	"net/http"
	"strings"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

type createProviderRequest struct {
	OrganizationID   string            `json:"organization_id"`
	Name             string            `json:"name"`
	Slug             string            `json:"slug"`
	Kind             string            `json:"kind"`
	Enabled          *bool             `json:"enabled"`
	ClientID         string            `json:"client_id"`
	ClientSecret     string            `json:"client_secret"`
	IssuerURL        string            `json:"issuer_url"`
	DiscoveryURL     string            `json:"discovery_url"`
	AuthorizationURL string            `json:"authorization_url"`
	TokenURL         string            `json:"token_url"`
	UserInfoURL      string            `json:"userinfo_url"`
	JWKSURL          string            `json:"jwks_url"`
	LogoutURL        string            `json:"logout_url"`
	MetadataURL      string            `json:"metadata_url"`
	EntityID         string            `json:"entity_id"`
	SSOURL           string            `json:"sso_url"`
	X509Certificate  string            `json:"x509_certificate"`
	Scopes           []string          `json:"scopes"`
	AllowedDomains   []string          `json:"allowed_domains"`
	ClaimMappings    map[string]string `json:"claim_mappings"`
	AllowAutoLink    bool              `json:"allow_auto_link"`
	AllowSignup      bool              `json:"allow_signup"`
	PKCERequired     bool              `json:"pkce_required"`
	Configuration    map[string]string `json:"configuration"`
}

type updateProviderRequest struct {
	Name             string            `json:"name"`
	Slug             string            `json:"slug"`
	Kind             string            `json:"kind"`
	Enabled          *bool             `json:"enabled"`
	ClientID         string            `json:"client_id"`
	ClientSecret     string            `json:"client_secret"`
	IssuerURL        string            `json:"issuer_url"`
	DiscoveryURL     string            `json:"discovery_url"`
	AuthorizationURL string            `json:"authorization_url"`
	TokenURL         string            `json:"token_url"`
	UserInfoURL      string            `json:"userinfo_url"`
	JWKSURL          string            `json:"jwks_url"`
	LogoutURL        string            `json:"logout_url"`
	MetadataURL      string            `json:"metadata_url"`
	EntityID         string            `json:"entity_id"`
	SSOURL           string            `json:"sso_url"`
	X509Certificate  string            `json:"x509_certificate"`
	Scopes           []string          `json:"scopes"`
	AllowedDomains   []string          `json:"allowed_domains"`
	ClaimMappings    map[string]string `json:"claim_mappings"`
	AllowAutoLink    bool              `json:"allow_auto_link"`
	AllowSignup      bool              `json:"allow_signup"`
	PKCERequired     bool              `json:"pkce_required"`
	Configuration    map[string]string `json:"configuration"`
}

func (app *App) handleProviders(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	// The optional organization_id query supports organization-focused admin views.
	organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))

	switch r.Method {
	case http.MethodGet:
		query, err := parseListQuery(r, "name", "asc")
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}

		providers, total, err := app.backend.IAM.ListProviders(r.Context(), principal, organizationID, sdb.ListParams{
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
		writeListResponse(w, http.StatusOK, "providers", providers, query, int(total))
	case http.MethodPost:
		var req createProviderRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		provider, err := app.backend.IAM.CreateProvider(r.Context(), principal, iam.CreateProviderParams{
			OrganizationID:   req.OrganizationID,
			Name:             req.Name,
			Slug:             req.Slug,
			Kind:             req.Kind,
			Enabled:          req.Enabled,
			ClientID:         req.ClientID,
			ClientSecret:     req.ClientSecret,
			IssuerURL:        req.IssuerURL,
			DiscoveryURL:     req.DiscoveryURL,
			AuthorizationURL: req.AuthorizationURL,
			TokenURL:         req.TokenURL,
			UserInfoURL:      req.UserInfoURL,
			JWKSURL:          req.JWKSURL,
			LogoutURL:        req.LogoutURL,
			MetadataURL:      req.MetadataURL,
			EntityID:         req.EntityID,
			SSOURL:           req.SSOURL,
			X509Certificate:  req.X509Certificate,
			Scopes:           req.Scopes,
			AllowedDomains:   req.AllowedDomains,
			ClaimMappings:    req.ClaimMappings,
			AllowAutoLink:    req.AllowAutoLink,
			AllowSignup:      req.AllowSignup,
			PKCERequired:     req.PKCERequired,
			Configuration:    req.Configuration,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		// Unlike application secrets (server-generated, revealed once at
		// creation), provider secrets are supplied by the caller in the
		// request body, so the caller already has them — never echo them back.
		// (toProvider, called inside CreateProvider, already masks this.)
		writeJSON(w, http.StatusCreated, provider)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleProviderByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	providerID := strings.TrimSpace(r.PathValue("providerID"))
	if providerID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing provider id")
		return
	}

	switch r.Method {
	case http.MethodGet:
		provider, err := app.backend.IAM.GetProvider(r.Context(), principal, providerID)
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, provider)
	case http.MethodPut:
		var req updateProviderRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}

		// Provider edits keep the same owning organization to avoid accidental
		// cross-tenant reconfiguration in the early control-plane versions.
		provider, err := app.backend.IAM.UpdateProvider(r.Context(), principal, providerID, iam.UpdateProviderParams{
			Name:             req.Name,
			Slug:             req.Slug,
			Kind:             req.Kind,
			Enabled:          req.Enabled,
			ClientID:         req.ClientID,
			ClientSecret:     req.ClientSecret,
			IssuerURL:        req.IssuerURL,
			DiscoveryURL:     req.DiscoveryURL,
			AuthorizationURL: req.AuthorizationURL,
			TokenURL:         req.TokenURL,
			UserInfoURL:      req.UserInfoURL,
			JWKSURL:          req.JWKSURL,
			LogoutURL:        req.LogoutURL,
			MetadataURL:      req.MetadataURL,
			EntityID:         req.EntityID,
			SSOURL:           req.SSOURL,
			X509Certificate:  req.X509Certificate,
			Scopes:           req.Scopes,
			AllowedDomains:   req.AllowedDomains,
			ClaimMappings:    req.ClaimMappings,
			AllowAutoLink:    req.AllowAutoLink,
			AllowSignup:      req.AllowSignup,
			PKCERequired:     req.PKCERequired,
			Configuration:    req.Configuration,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, provider)
	case http.MethodDelete:
		if err := app.backend.IAM.DeleteProvider(r.Context(), principal, providerID); err != nil {
			writeIAMError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
