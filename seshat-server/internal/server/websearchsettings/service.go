// Package websearchsettings mirrors automation's provider-settings org→
// platform hierarchy, but for web-search providers (Tavily/Exa/Jina/
// LangSearch/SearXNG) — a deliberately separate domain, not a reuse of
// ProviderSetting: DefaultModel has no meaning here, and SearXNG needs a
// second credential field (AuthUsername, basic auth) no LLM provider uses.
// Also owns the organization's web-search domain allow/block policy, a
// strictly org-wide singleton merged client-side into each user's own local
// policy (see helps/seshat-architecture-target.md §3, "Web search (config)").
package websearchsettings

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// ─── Provider credentials (org → platform) ─────────────────────────────────────

type WebSearchProviderSetting struct {
	ID              string `json:"id"`
	OrganizationID  string `json:"organization_id"`
	CreatedByUserID string `json:"created_by_user_id"`
	Provider        string `json:"provider"`
	BaseURL         string `json:"base_url,omitempty"`
	AuthUsername    string `json:"auth_username,omitempty"`
}

type PlatformWebSearchProviderSetting struct {
	ID              string `json:"id"`
	CreatedByUserID string `json:"created_by_user_id"`
	Provider        string `json:"provider"`
	BaseURL         string `json:"base_url,omitempty"`
	AuthUsername    string `json:"auth_username,omitempty"`
}

// ResolvedWebSearchProviderSetting includes the decrypted API key — same
// redaction stance as automation.ResolvedProviderSetting: this is the one
// response in this domain meant to actually be used, not just displayed.
type ResolvedWebSearchProviderSetting struct {
	Provider     string `json:"provider"`
	BaseURL      string `json:"base_url,omitempty"`
	AuthUsername string `json:"auth_username,omitempty"`
	APIKey       string `json:"api_key"`
	Source       string `json:"source"` // "organization" | "platform"
}

type CreateProviderSettingParams struct {
	OrganizationID, Provider, BaseURL, AuthUsername, APIKey string
}

type UpdateProviderSettingParams struct {
	BaseURL, AuthUsername, APIKey string
}

type CreatePlatformProviderSettingParams struct {
	Provider, BaseURL, AuthUsername, APIKey string
}

type UpdatePlatformProviderSettingParams struct {
	BaseURL, AuthUsername, APIKey string
}

// ─── Org domain policy ──────────────────────────────────────────────────────────

type OrgPolicy struct {
	OrganizationID  string    `json:"organization_id"`
	CreatedByUserID string    `json:"created_by_user_id,omitempty"`
	AllowedDomains  []string  `json:"allowed_domains"`
	BlockedDomains  []string  `json:"blocked_domains"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type UpsertOrgPolicyParams struct {
	OrganizationID string
	AllowedDomains []string
	BlockedDomains []string
}

type Service struct {
	db  *sdb.DB
	iam *iam.Service
}

func New(database *sdb.DB, iamService *iam.Service) *Service {
	return &Service{db: database, iam: iamService}
}

// ─── Org-scoped provider settings ───────────────────────────────────────────────

func (s *Service) ListProviderSettings(ctx context.Context, principal *iam.Principal, organizationID string) ([]WebSearchProviderSetting, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, iam.ErrInvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "web_search_settings.manage", "organization.manage"); err != nil {
			return []WebSearchProviderSetting{}, nil
		}
	}
	var records []sdb.WebSearchProviderSetting
	if err := s.db.Gorm().WithContext(ctx).Where("organization_id = ?", organizationID).Order("provider asc").Find(&records).Error; err != nil {
		return nil, err
	}
	out := make([]WebSearchProviderSetting, 0, len(records))
	for _, r := range records {
		out = append(out, toProviderSetting(r))
	}
	return out, nil
}

func (s *Service) CreateProviderSetting(ctx context.Context, principal *iam.Principal, params CreateProviderSettingParams) (*WebSearchProviderSetting, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	provider := strings.ToLower(strings.TrimSpace(params.Provider))
	apiKey := strings.TrimSpace(params.APIKey)
	if organizationID == "" || provider == "" || apiKey == "" {
		return nil, iam.ErrInvalidInput("organization_id, provider and api_key are required")
	}

	var record sdb.WebSearchProviderSetting
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "web_search_settings.manage", "organization.manage"); err != nil {
			return err
		}
		var conflicting int64
		if err := tx.Model(&sdb.WebSearchProviderSetting{}).Where("organization_id = ? AND provider = ?", organizationID, provider).Count(&conflicting).Error; err != nil {
			return err
		}
		if conflicting > 0 {
			return iam.ErrConflict("a web search provider setting for " + provider + " already exists in this organization; use update instead")
		}
		encrypted, err := sdb.EncryptSecret(apiKey)
		if err != nil {
			return err
		}
		id, err := sdb.NewID("wsprovset")
		if err != nil {
			return err
		}
		record = sdb.WebSearchProviderSetting{
			ID: id, OrganizationID: organizationID, CreatedByUserID: principal.User.ID,
			Provider: provider, BaseURL: strings.TrimSpace(params.BaseURL),
			AuthUsername: strings.TrimSpace(params.AuthUsername), EncryptedAPIKey: encrypted,
		}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "web_search_provider_setting.created", "web_search_provider_setting", record.ID, map[string]string{"provider": provider})
	})
	if err != nil {
		return nil, err
	}
	result := toProviderSetting(record)
	return &result, nil
}

func (s *Service) UpdateProviderSetting(ctx context.Context, principal *iam.Principal, id string, params UpdateProviderSettingParams) (*WebSearchProviderSetting, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	var record sdb.WebSearchProviderSetting
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := tx.First(&record, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return iam.ErrNotFound("web search provider setting not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "web_search_settings.manage", "organization.manage"); err != nil {
			return err
		}
		record.BaseURL = strings.TrimSpace(params.BaseURL)
		record.AuthUsername = strings.TrimSpace(params.AuthUsername)
		if apiKey := strings.TrimSpace(params.APIKey); apiKey != "" {
			encrypted, err := sdb.EncryptSecret(apiKey)
			if err != nil {
				return err
			}
			record.EncryptedAPIKey = encrypted
		}
		if err := tx.Save(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "web_search_provider_setting.updated", "web_search_provider_setting", record.ID, map[string]string{"provider": record.Provider})
	})
	if err != nil {
		return nil, err
	}
	result := toProviderSetting(record)
	return &result, nil
}

func (s *Service) DeleteProviderSetting(ctx context.Context, principal *iam.Principal, id string) error {
	if principal == nil {
		return iam.ErrUnauthorized("authentication required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.WebSearchProviderSetting
		if err := tx.First(&record, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return iam.ErrNotFound("web search provider setting not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "web_search_settings.manage", "organization.manage"); err != nil {
			return err
		}
		if err := tx.Delete(&sdb.WebSearchProviderSetting{}, "id = ?", id).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "web_search_provider_setting.deleted", "web_search_provider_setting", record.ID, map[string]string{"provider": record.Provider})
	})
}

// ─── Platform-wide provider settings (superadmin only) ─────────────────────────

func (s *Service) ListPlatformProviderSettings(ctx context.Context, principal *iam.Principal) ([]PlatformWebSearchProviderSetting, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	if !principal.User.IsAdmin {
		return nil, iam.ErrForbidden("platform admin privileges required")
	}
	var records []sdb.PlatformWebSearchProviderSetting
	if err := s.db.Gorm().WithContext(ctx).Order("provider asc").Find(&records).Error; err != nil {
		return nil, err
	}
	out := make([]PlatformWebSearchProviderSetting, 0, len(records))
	for _, r := range records {
		out = append(out, toPlatformProviderSetting(r))
	}
	return out, nil
}

func (s *Service) CreatePlatformProviderSetting(ctx context.Context, principal *iam.Principal, params CreatePlatformProviderSettingParams) (*PlatformWebSearchProviderSetting, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	if !principal.User.IsAdmin {
		return nil, iam.ErrForbidden("platform admin privileges required")
	}
	provider := strings.ToLower(strings.TrimSpace(params.Provider))
	apiKey := strings.TrimSpace(params.APIKey)
	if provider == "" || apiKey == "" {
		return nil, iam.ErrInvalidInput("provider and api_key are required")
	}
	var record sdb.PlatformWebSearchProviderSetting
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var existing sdb.PlatformWebSearchProviderSetting
		err := tx.Where("provider = ?", provider).First(&existing).Error
		if err == nil {
			return iam.ErrConflict("a platform web search provider setting for " + provider + " already exists; use update instead")
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		encrypted, err := sdb.EncryptSecret(apiKey)
		if err != nil {
			return err
		}
		id, err := sdb.NewID("platwsprovset")
		if err != nil {
			return err
		}
		record = sdb.PlatformWebSearchProviderSetting{
			ID: id, CreatedByUserID: principal.User.ID, Provider: provider,
			BaseURL: strings.TrimSpace(params.BaseURL), AuthUsername: strings.TrimSpace(params.AuthUsername),
			EncryptedAPIKey: encrypted,
		}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, "", "platform_web_search_provider_setting.created", "platform_web_search_provider_setting", record.ID, map[string]string{"provider": provider})
	})
	if err != nil {
		return nil, err
	}
	result := toPlatformProviderSetting(record)
	return &result, nil
}

func (s *Service) UpdatePlatformProviderSetting(ctx context.Context, principal *iam.Principal, id string, params UpdatePlatformProviderSettingParams) (*PlatformWebSearchProviderSetting, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	if !principal.User.IsAdmin {
		return nil, iam.ErrForbidden("platform admin privileges required")
	}
	var record sdb.PlatformWebSearchProviderSetting
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := tx.First(&record, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return iam.ErrNotFound("platform web search provider setting not found")
			}
			return err
		}
		record.BaseURL = strings.TrimSpace(params.BaseURL)
		record.AuthUsername = strings.TrimSpace(params.AuthUsername)
		if apiKey := strings.TrimSpace(params.APIKey); apiKey != "" {
			encrypted, err := sdb.EncryptSecret(apiKey)
			if err != nil {
				return err
			}
			record.EncryptedAPIKey = encrypted
		}
		if err := tx.Save(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, "", "platform_web_search_provider_setting.updated", "platform_web_search_provider_setting", record.ID, map[string]string{"provider": record.Provider})
	})
	if err != nil {
		return nil, err
	}
	result := toPlatformProviderSetting(record)
	return &result, nil
}

func (s *Service) DeletePlatformProviderSetting(ctx context.Context, principal *iam.Principal, id string) error {
	if principal == nil {
		return iam.ErrUnauthorized("authentication required")
	}
	if !principal.User.IsAdmin {
		return iam.ErrForbidden("platform admin privileges required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.PlatformWebSearchProviderSetting
		if err := tx.First(&record, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return iam.ErrNotFound("platform web search provider setting not found")
			}
			return err
		}
		if err := tx.Delete(&sdb.PlatformWebSearchProviderSetting{}, "id = ?", id).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, "", "platform_web_search_provider_setting.deleted", "platform_web_search_provider_setting", record.ID, map[string]string{"provider": record.Provider})
	})
}

// ─── Resolve (member-permitted, includes the decrypted key) ───────────────────

func (s *Service) ResolveProviderSetting(ctx context.Context, principal *iam.Principal, organizationID, provider string) (*ResolvedWebSearchProviderSetting, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	provider = strings.ToLower(strings.TrimSpace(provider))
	if organizationID == "" || provider == "" {
		return nil, iam.ErrInvalidInput("organization_id and provider are required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	allowed, err := s.iam.CanAccessOrganization(tx, principal, organizationID)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, iam.ErrForbidden("not a member of this organization")
	}

	var orgSetting sdb.WebSearchProviderSetting
	err = tx.Where("organization_id = ? AND provider = ?", organizationID, provider).First(&orgSetting).Error
	if err == nil {
		apiKey, decErr := sdb.DecryptSecret(orgSetting.EncryptedAPIKey)
		if decErr != nil {
			return nil, decErr
		}
		return &ResolvedWebSearchProviderSetting{
			Provider: orgSetting.Provider, BaseURL: orgSetting.BaseURL, AuthUsername: orgSetting.AuthUsername,
			APIKey: apiKey, Source: "organization",
		}, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	var platformSetting sdb.PlatformWebSearchProviderSetting
	err = tx.Where("provider = ?", provider).First(&platformSetting).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, iam.ErrNotFound("no web search provider setting configured for " + provider + " (checked this organization and the platform default)")
		}
		return nil, err
	}
	apiKey, err := sdb.DecryptSecret(platformSetting.EncryptedAPIKey)
	if err != nil {
		return nil, err
	}
	return &ResolvedWebSearchProviderSetting{
		Provider: platformSetting.Provider, BaseURL: platformSetting.BaseURL, AuthUsername: platformSetting.AuthUsername,
		APIKey: apiKey, Source: "platform",
	}, nil
}

// ─── Org domain policy ──────────────────────────────────────────────────────────

// GetOrgPolicy is open to any org member — a policy of which domains are
// allowed/blocked is not secret, and every member needs to read it to have
// it applied locally.
func (s *Service) GetOrgPolicy(ctx context.Context, principal *iam.Principal, organizationID string) (*OrgPolicy, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, iam.ErrInvalidInput("organization_id is required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	allowed, err := s.iam.CanAccessOrganization(tx, principal, organizationID)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, iam.ErrForbidden("not a member of this organization")
	}
	var record sdb.WebSearchOrgPolicy
	err = tx.First(&record, "organization_id = ?", organizationID).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &OrgPolicy{OrganizationID: organizationID, AllowedDomains: []string{}, BlockedDomains: []string{}}, nil
		}
		return nil, err
	}
	policy := toOrgPolicy(record)
	return &policy, nil
}

func (s *Service) UpsertOrgPolicy(ctx context.Context, principal *iam.Principal, params UpsertOrgPolicyParams) (*OrgPolicy, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	if organizationID == "" {
		return nil, iam.ErrInvalidInput("organization_id is required")
	}
	allowedJSON, err := json.Marshal(sdb.NonNilStrings(params.AllowedDomains))
	if err != nil {
		return nil, err
	}
	blockedJSON, err := json.Marshal(sdb.NonNilStrings(params.BlockedDomains))
	if err != nil {
		return nil, err
	}

	var record sdb.WebSearchOrgPolicy
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "web_search_settings.manage", "organization.manage"); err != nil {
			return err
		}
		record = sdb.WebSearchOrgPolicy{
			OrganizationID: organizationID, CreatedByUserID: principal.User.ID,
			AllowedDomainsJSON: string(allowedJSON), BlockedDomainsJSON: string(blockedJSON),
		}
		if err := tx.Save(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "web_search_org_policy.updated", "web_search_org_policy", organizationID, nil)
	})
	if err != nil {
		return nil, err
	}
	policy := toOrgPolicy(record)
	return &policy, nil
}

// ─── converters ───────────────────────────────────────────────────────────────

func toProviderSetting(r sdb.WebSearchProviderSetting) WebSearchProviderSetting {
	return WebSearchProviderSetting{
		ID: r.ID, OrganizationID: r.OrganizationID, CreatedByUserID: r.CreatedByUserID,
		Provider: r.Provider, BaseURL: r.BaseURL, AuthUsername: r.AuthUsername,
	}
}

func toPlatformProviderSetting(r sdb.PlatformWebSearchProviderSetting) PlatformWebSearchProviderSetting {
	return PlatformWebSearchProviderSetting{
		ID: r.ID, CreatedByUserID: r.CreatedByUserID, Provider: r.Provider,
		BaseURL: r.BaseURL, AuthUsername: r.AuthUsername,
	}
}

func toOrgPolicy(r sdb.WebSearchOrgPolicy) OrgPolicy {
	var allowed, blocked []string
	_ = json.Unmarshal([]byte(r.AllowedDomainsJSON), &allowed)
	_ = json.Unmarshal([]byte(r.BlockedDomainsJSON), &blocked)
	if allowed == nil {
		allowed = []string{}
	}
	if blocked == nil {
		blocked = []string{}
	}
	return OrgPolicy{
		OrganizationID: r.OrganizationID, CreatedByUserID: r.CreatedByUserID,
		AllowedDomains: allowed, BlockedDomains: blocked, UpdatedAt: r.UpdatedAt,
	}
}
