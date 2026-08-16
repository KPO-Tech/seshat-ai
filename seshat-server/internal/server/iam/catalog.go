package iam

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// UpdateApplicationParams contains mutable application fields.
// The organization binding stays immutable in the first version to keep
// ownership and provider validation straightforward.
type UpdateApplicationParams struct {
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

// UpdateProviderParams contains mutable provider fields.
// Provider organization membership also remains immutable for now.
type UpdateProviderParams struct {
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

// GetApplication resolves one application and enforces organization visibility.
func (s *Service) GetApplication(ctx context.Context, principal *Principal, applicationID string) (*Application, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	applicationID = strings.TrimSpace(applicationID)
	if applicationID == "" {
		return nil, ErrInvalidInput("application_id is required")
	}

	tx := s.db.Gorm().WithContext(ctx)
	var record sdb.Application
	if err := tx.First(&record, "id = ?", applicationID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("application not found")
		}
		return nil, err
	}
	if !principal.User.IsAdmin {
		ok, err := hasAnyOrganizationPermission(tx, principal, record.OrganizationID, "applications.read", "applications.manage", "organization.manage")
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, ErrNotFound("application not found")
		}
	}
	application := toApplication(tx, record)
	return &application, nil
}

// UpdateApplication updates the mutable application metadata.
func (s *Service) UpdateApplication(ctx context.Context, principal *Principal, applicationID string, params UpdateApplicationParams) (*Application, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	applicationID = strings.TrimSpace(applicationID)
	name := strings.TrimSpace(params.Name)
	slug := normalizeSlug(params.Slug)
	displayName := strings.TrimSpace(params.DisplayName)
	if applicationID == "" || name == "" || slug == "" || displayName == "" {
		return nil, ErrInvalidInput("application_id, name, slug and display_name are required")
	}

	var application *Application
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Application
		if err := tx.First(&record, "id = ?", applicationID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("application not found")
			}
			return err
		}
		if err := requireOrganizationPermission(tx, principal, record.OrganizationID, "applications.manage", "organization.manage"); err != nil {
			return err
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
		}, record.Enabled)
		if err != nil {
			return err
		}

		// Provider bindings must stay within the same organization boundary.
		for _, providerID := range config.ProviderIDs {
			var provider sdb.Provider
			if err := tx.First(&provider, "id = ?", providerID).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrNotFound("provider not found")
				}
				return err
			}
			if provider.OrganizationID != record.OrganizationID {
				return ErrInvalidInput("provider must belong to the same organization")
			}
		}

		var conflicting int64
		if err := tx.Model(&sdb.Application{}).Where("organization_id = ? AND slug = ? AND id <> ?", record.OrganizationID, slug, record.ID).Count(&conflicting).Error; err != nil {
			return err
		}
		if conflicting > 0 {
			return ErrConflict("application slug already exists in organization")
		}

		record.Name = name
		record.Slug = slug
		record.DisplayName = displayName
		record.Description = config.Description
		record.Protocol = config.Protocol
		record.Enabled = config.Enabled
		record.HomepageURL = config.HomepageURL
		record.CallbackURL = config.CallbackURL
		record.RedirectURLs = append([]string(nil), config.RedirectURLs...)
		record.PostLogoutRedirectURLs = append([]string(nil), config.PostLogoutRedirectURLs...)
		record.AllowedOrigins = append([]string(nil), config.AllowedOrigins...)
		record.GrantTypes = append([]string(nil), config.GrantTypes...)
		record.ResponseTypes = append([]string(nil), config.ResponseTypes...)
		record.Scopes = append([]string(nil), config.Scopes...)
		record.ProviderIDs = append([]string(nil), config.ProviderIDs...)
		record.SigninURL = config.SigninURL
		record.SignupURL = config.SignupURL
		record.AllowSignup = config.AllowSignup
		record.AllowPasswordLogin = config.AllowPasswordLogin
		record.PKCERequired = config.PKCERequired
		record.SkipConsent = config.SkipConsent
		record.IssueRefreshToken = config.IssueRefreshToken
		record.Configuration = normalizeStringMap(config.Configuration)
		record.UpdatedAt = time.Now().UTC()
		if err := tx.Save(&record).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("application slug already exists in organization")
			}
			return err
		}
		if err := appendAuditEvent(tx, principal, record.OrganizationID, "application.updated", "application", record.ID, map[string]string{"slug": record.Slug, "protocol": record.Protocol}); err != nil {
			return err
		}

		converted := toApplication(tx, record)
		application = &converted
		return nil
	})
	return application, err
}

// DeleteApplication removes one application registration from the control plane.
func (s *Service) DeleteApplication(ctx context.Context, principal *Principal, applicationID string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	applicationID = strings.TrimSpace(applicationID)
	if applicationID == "" {
		return ErrInvalidInput("application_id is required")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Application
		if err := tx.First(&record, "id = ?", applicationID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("application not found")
			}
			return err
		}
		if err := requireOrganizationPermission(tx, principal, record.OrganizationID, "applications.manage", "organization.manage"); err != nil {
			return err
		}
		if err := tx.Delete(&sdb.Application{}, "id = ?", record.ID).Error; err != nil {
			return err
		}
		return appendAuditEvent(tx, principal, record.OrganizationID, "application.deleted", "application", record.ID, map[string]string{"slug": record.Slug, "protocol": record.Protocol})
	})
}

// GetProvider resolves one upstream identity provider.
func (s *Service) GetProvider(ctx context.Context, principal *Principal, providerID string) (*Provider, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	providerID = strings.TrimSpace(providerID)
	if providerID == "" {
		return nil, ErrInvalidInput("provider_id is required")
	}

	tx := s.db.Gorm().WithContext(ctx)
	var record sdb.Provider
	if err := tx.First(&record, "id = ?", providerID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("provider not found")
		}
		return nil, err
	}
	if !principal.User.IsAdmin {
		ok, err := hasAnyOrganizationPermission(tx, principal, record.OrganizationID, "providers.read", "providers.manage", "organization.manage")
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, ErrNotFound("provider not found")
		}
	}
	provider := toProvider(tx, record)
	return &provider, nil
}

// UpdateProvider updates provider metadata and secret material references.
func (s *Service) UpdateProvider(ctx context.Context, principal *Principal, providerID string, params UpdateProviderParams) (*Provider, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	providerID = strings.TrimSpace(providerID)
	name := strings.TrimSpace(params.Name)
	slug := normalizeSlug(params.Slug)
	if providerID == "" || name == "" || slug == "" || strings.TrimSpace(params.Kind) == "" {
		return nil, ErrInvalidInput("provider_id, name, slug and kind are required")
	}

	var provider *Provider
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Provider
		if err := tx.First(&record, "id = ?", providerID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("provider not found")
			}
			return err
		}
		if err := requireOrganizationPermission(tx, principal, record.OrganizationID, "providers.manage", "organization.manage"); err != nil {
			return err
		}
		var conflicting int64
		if err := tx.Model(&sdb.Provider{}).Where("organization_id = ? AND slug = ? AND id <> ?", record.OrganizationID, slug, record.ID).Count(&conflicting).Error; err != nil {
			return err
		}
		if conflicting > 0 {
			return ErrConflict("provider slug already exists in organization")
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
		}, record.Enabled)
		if err != nil {
			return err
		}

		storedClientSecret := config.ClientSecret
		if storedClientSecret != "" {
			encryptedClientSecret, err := sdb.EncryptSecret(tx, record.OrganizationID, storedClientSecret)
			if err != nil {
				return fmt.Errorf("encrypt provider client secret: %w", err)
			}
			storedClientSecret = encryptedClientSecret
		}

		record.Name = name
		record.Slug = slug
		record.Kind = config.Kind
		record.Enabled = config.Enabled
		record.ClientID = config.ClientID
		record.ClientSecret = storedClientSecret
		record.IssuerURL = config.IssuerURL
		record.DiscoveryURL = config.DiscoveryURL
		record.AuthorizationURL = config.AuthorizationURL
		record.TokenURL = config.TokenURL
		record.UserInfoURL = config.UserInfoURL
		record.JWKSURL = config.JWKSURL
		record.LogoutURL = config.LogoutURL
		record.MetadataURL = config.MetadataURL
		record.EntityID = config.EntityID
		record.SSOURL = config.SSOURL
		record.X509Certificate = config.X509Certificate
		record.Scopes = append([]string(nil), config.Scopes...)
		record.AllowedDomains = append([]string(nil), config.AllowedDomains...)
		record.ClaimMappings = normalizeStringMap(config.ClaimMappings)
		record.AllowAutoLink = config.AllowAutoLink
		record.AllowSignup = config.AllowSignup
		record.PKCERequired = config.PKCERequired
		record.Configuration = normalizeStringMap(config.Configuration)
		record.UpdatedAt = time.Now().UTC()
		if err := tx.Save(&record).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("provider slug already exists in organization")
			}
			return err
		}
		if err := appendAuditEvent(tx, principal, record.OrganizationID, "provider.updated", "provider", record.ID, map[string]string{"slug": record.Slug, "kind": record.Kind}); err != nil {
			return err
		}

		// See the matching comment in CreateProvider — never echo a
		// caller-supplied secret back, toProvider's mask must stand.
		converted := toProvider(tx, record)
		provider = &converted
		return nil
	})
	return provider, err
}

// DeleteProvider removes a provider only when no application still references it.
func (s *Service) DeleteProvider(ctx context.Context, principal *Principal, providerID string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	providerID = strings.TrimSpace(providerID)
	if providerID == "" {
		return ErrInvalidInput("provider_id is required")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Provider
		if err := tx.First(&record, "id = ?", providerID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("provider not found")
			}
			return err
		}
		if err := requireOrganizationPermission(tx, principal, record.OrganizationID, "providers.manage", "organization.manage"); err != nil {
			return err
		}
		var applications []sdb.Application
		if err := tx.Where("organization_id = ?", record.OrganizationID).Find(&applications).Error; err != nil {
			return err
		}
		for _, application := range applications {
			if containsString(application.ProviderIDs, providerID) {
				return ErrConflict("provider is still referenced by an application")
			}
		}
		if err := tx.Delete(&sdb.Provider{}, "id = ?", record.ID).Error; err != nil {
			return err
		}
		return appendAuditEvent(tx, principal, record.OrganizationID, "provider.deleted", "provider", record.ID, map[string]string{"slug": record.Slug, "kind": record.Kind})
	})
}
