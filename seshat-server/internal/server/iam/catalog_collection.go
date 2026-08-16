package iam

import (
	"context"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

var applicationSortFields = map[string]sdb.SortField{
	"name":         {Column: "name"},
	"slug":         {Column: "slug"},
	"display_name": {Column: "display_name"},
	"protocol":     {Column: "protocol"},
	"enabled":      {Column: "enabled"},
	"created_at":   {Column: "created_at"},
	"updated_at":   {Column: "updated_at"},
}

var applicationSearchColumns = []string{
	"id", "organization_id", "name", "slug", "display_name", "description",
	"protocol", "homepage_url", "callback_url", "redirect_urls", "grant_types",
	"response_types", "scopes", "client_id", "signin_url", "signup_url", "configuration",
}

// ListApplications returns a page of applications visible to the caller,
// with search/sort/pagination applied in SQL rather than by loading every
// matching row into memory first. Admins can see every application while
// regular members are scoped to their orgs.
func (s *Service) ListApplications(ctx context.Context, principal *Principal, organizationID string, params sdb.ListParams) ([]Application, int64, error) {
	if principal == nil {
		return nil, 0, ErrUnauthorized("authentication required")
	}

	tx := s.db.Gorm().WithContext(ctx)
	query, allowed, err := restrictQueryToPrincipalOrganizations(tx.Model(&sdb.Application{}), principal, organizationID, "applications.read", "applications.manage", "organization.manage")
	if err != nil {
		return nil, 0, err
	}
	if !allowed {
		return []Application{}, 0, nil
	}
	sortField, err := sdb.ResolveSortField(applicationSortFields, params.Sort)
	if err != nil {
		return nil, 0, ErrInvalidInput(err.Error())
	}
	query = sdb.ApplySearch(query, params.Search, applicationSearchColumns...)
	query = sdb.ApplySort(query, sortField, params.Order)

	records, total, err := sdb.Page[sdb.Application](query, params.Limit, params.Offset)
	if err != nil {
		return nil, 0, err
	}
	applications := make([]Application, 0, len(records))
	for _, record := range records {
		applications = append(applications, toApplication(tx, record))
	}
	return applications, total, nil
}

// CreateApplication registers a new local client application.
// The generated client credentials are owned by the control plane.
func (s *Service) CreateApplication(ctx context.Context, principal *Principal, params CreateApplicationParams) (*Application, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	name := strings.TrimSpace(params.Name)
	slug := normalizeSlug(params.Slug)
	displayName := strings.TrimSpace(params.DisplayName)
	if organizationID == "" || name == "" || slug == "" || displayName == "" {
		return nil, ErrInvalidInput("organization_id, name, slug and display_name are required")
	}

	config, err := normalizeApplicationConfig(applicationConfigInput{
		Protocol:               params.Protocol,
		Enabled:                params.Enabled,
		Description:            params.Description,
		HomepageURL:            params.HomepageURL,
		CallbackURL:            params.CallbackURL,
		RedirectURLs:           params.RedirectURLs,
		PostLogoutRedirectURLs: params.PostLogoutRedirectURLs,
		AllowedOrigins:         params.AllowedOrigins,
		GrantTypes:             params.GrantTypes,
		ResponseTypes:          params.ResponseTypes,
		Scopes:                 params.Scopes,
		ProviderIDs:            params.ProviderIDs,
		SigninURL:              params.SigninURL,
		SignupURL:              params.SignupURL,
		AllowSignup:            params.AllowSignup,
		AllowPasswordLogin:     params.AllowPasswordLogin,
		PKCERequired:           params.PKCERequired,
		SkipConsent:            params.SkipConsent,
		IssueRefreshToken:      params.IssueRefreshToken,
		Configuration:          params.Configuration,
	}, true)
	if err != nil {
		return nil, err
	}

	var application *Application
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := requireOrganizationPermission(tx, principal, organizationID, "applications.manage", "organization.manage"); err != nil {
			return err
		}
		var conflicting int64
		if err := tx.Model(&sdb.Application{}).Where("organization_id = ? AND slug = ?", organizationID, slug).Count(&conflicting).Error; err != nil {
			return err
		}
		if conflicting > 0 {
			return ErrConflict("application slug already exists in organization")
		}

		// Provider links are validated early so the stored application always
		// stays internally consistent.
		for _, providerID := range config.ProviderIDs {
			var provider sdb.Provider
			if err := tx.First(&provider, "id = ?", providerID).Error; err != nil {
				return ErrNotFound("provider not found")
			}
			if provider.OrganizationID != organizationID {
				return ErrInvalidInput("provider must belong to the same organization")
			}
		}

		now := time.Now().UTC()
		clientSecretToken, err := newToken()
		if err != nil {
			return err
		}
		rawClientSecret := "secret_" + clientSecretToken[:32]
		encryptedClientSecret, err := sdb.EncryptSecret(tx, organizationID, rawClientSecret)
		if err != nil {
			return fmt.Errorf("encrypt application client secret: %w", err)
		}
		applicationID, err := newID("app")
		if err != nil {
			return err
		}
		clientIDToken, err := newToken()
		if err != nil {
			return err
		}
		record := sdb.Application{
			ID:                     applicationID,
			OrganizationID:         organizationID,
			Name:                   name,
			Slug:                   slug,
			DisplayName:            displayName,
			Description:            config.Description,
			Protocol:               config.Protocol,
			Enabled:                config.Enabled,
			HomepageURL:            config.HomepageURL,
			CallbackURL:            config.CallbackURL,
			RedirectURLs:           append([]string(nil), config.RedirectURLs...),
			PostLogoutRedirectURLs: append([]string(nil), config.PostLogoutRedirectURLs...),
			AllowedOrigins:         append([]string(nil), config.AllowedOrigins...),
			GrantTypes:             append([]string(nil), config.GrantTypes...),
			ResponseTypes:          append([]string(nil), config.ResponseTypes...),
			Scopes:                 append([]string(nil), config.Scopes...),
			ClientID:               "client_" + clientIDToken[:18],
			ClientSecret:           encryptedClientSecret,
			ProviderIDs:            append([]string(nil), config.ProviderIDs...),
			SigninURL:              config.SigninURL,
			SignupURL:              config.SignupURL,
			AllowSignup:            config.AllowSignup,
			AllowPasswordLogin:     config.AllowPasswordLogin,
			PKCERequired:           config.PKCERequired,
			SkipConsent:            config.SkipConsent,
			IssueRefreshToken:      config.IssueRefreshToken,
			Configuration:          normalizeStringMap(config.Configuration),
			CreatedAt:              now,
			UpdatedAt:              now,
		}
		if err := tx.Create(&record).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("application slug already exists in organization")
			}
			return err
		}
		if err := appendAuditEvent(tx, principal, record.OrganizationID, "application.created", "application", record.ID, map[string]string{"slug": record.Slug, "protocol": record.Protocol}); err != nil {
			return err
		}
		converted := toApplication(tx, record)
		converted.ClientSecret = rawClientSecret
		application = &converted
		return nil
	})
	return application, err
}

var providerSortFields = map[string]sdb.SortField{
	"name":       {Column: "name"},
	"slug":       {Column: "slug"},
	"kind":       {Column: "kind"},
	"enabled":    {Column: "enabled"},
	"created_at": {Column: "created_at"},
	"updated_at": {Column: "updated_at"},
}

var providerSearchColumns = []string{
	"id", "organization_id", "name", "slug", "kind", "client_id", "issuer_url",
	"discovery_url", "authorization_url", "token_url", "metadata_url", "entity_id",
	"sso_url", "scopes", "allowed_domains", "claim_mappings", "configuration",
}

// ListProviders returns a page of upstream identity providers visible to the
// caller, with search/sort/pagination applied in SQL.
func (s *Service) ListProviders(ctx context.Context, principal *Principal, organizationID string, params sdb.ListParams) ([]Provider, int64, error) {
	if principal == nil {
		return nil, 0, ErrUnauthorized("authentication required")
	}

	tx := s.db.Gorm().WithContext(ctx)
	query, allowed, err := restrictQueryToPrincipalOrganizations(tx.Model(&sdb.Provider{}), principal, organizationID, "providers.read", "providers.manage", "organization.manage")
	if err != nil {
		return nil, 0, err
	}
	if !allowed {
		return []Provider{}, 0, nil
	}
	sortField, err := sdb.ResolveSortField(providerSortFields, params.Sort)
	if err != nil {
		return nil, 0, ErrInvalidInput(err.Error())
	}
	query = sdb.ApplySearch(query, params.Search, providerSearchColumns...)
	query = sdb.ApplySort(query, sortField, params.Order)

	records, total, err := sdb.Page[sdb.Provider](query, params.Limit, params.Offset)
	if err != nil {
		return nil, 0, err
	}
	providers := make([]Provider, 0, len(records))
	for _, record := range records {
		providers = append(providers, toProvider(tx, record))
	}
	return providers, total, nil
}

// CreateProvider stores an upstream identity provider configuration.
func (s *Service) CreateProvider(ctx context.Context, principal *Principal, params CreateProviderParams) (*Provider, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	name := strings.TrimSpace(params.Name)
	slug := normalizeSlug(params.Slug)
	if organizationID == "" || name == "" || slug == "" || strings.TrimSpace(params.Kind) == "" {
		return nil, ErrInvalidInput("organization_id, name, slug and kind are required")
	}

	config, err := normalizeProviderConfig(providerConfigInput{
		Kind:             params.Kind,
		Enabled:          params.Enabled,
		ClientID:         params.ClientID,
		ClientSecret:     params.ClientSecret,
		IssuerURL:        params.IssuerURL,
		DiscoveryURL:     params.DiscoveryURL,
		AuthorizationURL: params.AuthorizationURL,
		TokenURL:         params.TokenURL,
		UserInfoURL:      params.UserInfoURL,
		JWKSURL:          params.JWKSURL,
		LogoutURL:        params.LogoutURL,
		MetadataURL:      params.MetadataURL,
		EntityID:         params.EntityID,
		SSOURL:           params.SSOURL,
		X509Certificate:  params.X509Certificate,
		Scopes:           params.Scopes,
		AllowedDomains:   params.AllowedDomains,
		ClaimMappings:    params.ClaimMappings,
		AllowAutoLink:    params.AllowAutoLink,
		AllowSignup:      params.AllowSignup,
		PKCERequired:     params.PKCERequired,
		Configuration:    params.Configuration,
	}, true)
	if err != nil {
		return nil, err
	}

	var provider *Provider
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := requireOrganizationPermission(tx, principal, organizationID, "providers.manage", "organization.manage"); err != nil {
			return err
		}
		var conflicting int64
		if err := tx.Model(&sdb.Provider{}).Where("organization_id = ? AND slug = ?", organizationID, slug).Count(&conflicting).Error; err != nil {
			return err
		}
		if conflicting > 0 {
			return ErrConflict("provider slug already exists in organization")
		}
		now := time.Now().UTC()
		storedClientSecret := config.ClientSecret
		if storedClientSecret != "" {
			encryptedClientSecret, err := sdb.EncryptSecret(tx, organizationID, storedClientSecret)
			if err != nil {
				return fmt.Errorf("encrypt provider client secret: %w", err)
			}
			storedClientSecret = encryptedClientSecret
		}
		providerID, err := newID("prv")
		if err != nil {
			return err
		}
		record := sdb.Provider{
			ID:               providerID,
			OrganizationID:   organizationID,
			Name:             name,
			Slug:             slug,
			Kind:             config.Kind,
			Enabled:          config.Enabled,
			ClientID:         config.ClientID,
			ClientSecret:     storedClientSecret,
			IssuerURL:        config.IssuerURL,
			DiscoveryURL:     config.DiscoveryURL,
			AuthorizationURL: config.AuthorizationURL,
			TokenURL:         config.TokenURL,
			UserInfoURL:      config.UserInfoURL,
			JWKSURL:          config.JWKSURL,
			LogoutURL:        config.LogoutURL,
			MetadataURL:      config.MetadataURL,
			EntityID:         config.EntityID,
			SSOURL:           config.SSOURL,
			X509Certificate:  config.X509Certificate,
			Scopes:           append([]string(nil), config.Scopes...),
			AllowedDomains:   append([]string(nil), config.AllowedDomains...),
			ClaimMappings:    normalizeStringMap(config.ClaimMappings),
			AllowAutoLink:    config.AllowAutoLink,
			AllowSignup:      config.AllowSignup,
			PKCERequired:     config.PKCERequired,
			Configuration:    normalizeStringMap(config.Configuration),
			CreatedAt:        now,
			UpdatedAt:        now,
		}
		if err := tx.Create(&record).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("provider slug already exists in organization")
			}
			return err
		}
		if err := appendAuditEvent(tx, principal, record.OrganizationID, "provider.created", "provider", record.ID, map[string]string{"slug": record.Slug, "kind": record.Kind}); err != nil {
			return err
		}
		// Unlike CreateApplication (server-generated secret, the caller's
		// only chance to see it), the caller supplied this secret themselves
		// — never echo it back, not even once. toProvider already masks it;
		// previously this line overwrote that mask with the real plaintext,
		// an actual bug silently papered over by a redundant re-mask at the
		// API layer (removed 2026-08-06, see maskedStoredSecret's comment).
		converted := toProvider(tx, record)
		provider = &converted
		return nil
	})
	return provider, err
}
