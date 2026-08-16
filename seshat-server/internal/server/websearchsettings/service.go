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

// ResolvedWebSearchProviderSetting includes the decrypted API key — same
// redaction stance as automation.ResolvedProviderSetting: this is the one
// response in this domain meant to actually be used, not just displayed.
type ResolvedWebSearchProviderSetting struct {
	Provider     string `json:"provider"`
	BaseURL      string `json:"base_url,omitempty"`
	AuthUsername string `json:"auth_username,omitempty"`
	APIKey       string `json:"api_key"`
	// Source is "organization" or "platform" - "platform" means the
	// requesting organization had none of its own and this was resolved
	// from the organization currently flagged IsDefault (see
	// iam.Service.DefaultOrganizationID) - kept as the string "platform"
	// for API compatibility even though there's no separate platform-level
	// settings table anymore.
	Source string `json:"source"`
}

type CreateProviderSettingParams struct {
	OrganizationID, Provider, BaseURL, AuthUsername, APIKey string
}

type UpdateProviderSettingParams struct {
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
	if organizationID == "" || provider == "" {
		return nil, iam.ErrInvalidInput("organization_id and provider are required")
	}
	// searxng is self-hosted and commonly run with no HTTP basic auth at
	// all (see the console's matching optional-password treatment) -
	// api_key doubles as that auth password for this provider, unlike
	// every other provider here, which is a real hosted-API credential
	// with no working "no key" mode.
	if provider != "searxng" && apiKey == "" {
		return nil, iam.ErrInvalidInput("api_key is required")
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
		encrypted, err := sdb.EncryptSecret(tx, organizationID, apiKey)
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
			encrypted, err := sdb.EncryptSecret(tx, record.OrganizationID, apiKey)
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
		apiKey, decErr := sdb.DecryptSecret(tx, organizationID, orgSetting.EncryptedAPIKey)
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

	defaultOrgID, found, err := s.iam.DefaultOrganizationIDForDomain(tx, iam.SharedDomainWebSearchSettings)
	if err != nil {
		return nil, err
	}
	if found && defaultOrgID != organizationID {
		var defaultSetting sdb.WebSearchProviderSetting
		err = tx.Where("organization_id = ? AND provider = ?", defaultOrgID, provider).First(&defaultSetting).Error
		if err == nil {
			// defaultOrgID, not organizationID - this secret was encrypted
			// with the DEFAULT organization's DEK.
			apiKey, decErr := sdb.DecryptSecret(tx, defaultOrgID, defaultSetting.EncryptedAPIKey)
			if decErr != nil {
				return nil, decErr
			}
			return &ResolvedWebSearchProviderSetting{
				Provider: defaultSetting.Provider, BaseURL: defaultSetting.BaseURL, AuthUsername: defaultSetting.AuthUsername,
				APIKey: apiKey, Source: "platform",
			}, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}
	return nil, iam.ErrNotFound("no web search provider setting configured for " + provider + " (checked this organization and the platform default)")
}

// keyBasedProviders lists the web-search providers the SDK's web_search tool
// accepts a flat API key for (see seshat/internal/tools/web/search.
// NewRunnerFromKeys) - searxng (needs a base_url, not just a key) and ddg
// (needs no key at all) aren't part of this map-based mechanism.
var keyBasedProviders = []string{"tavily", "exa", "jina", "langsearch"}

// ResolveAllProviderKeys resolves every key-based web-search provider this
// organization can use (its own setting, else the platform default) into a
// flat map ready for sdk.ClientConfig.WebSearchKeys. Providers with nothing
// configured (org or platform) are simply omitted, not an error - the
// web_search tool degrades to whichever providers do resolve.
func (s *Service) ResolveAllProviderKeys(ctx context.Context, principal *iam.Principal, organizationID string) (map[string]string, error) {
	keys := make(map[string]string, len(keyBasedProviders))
	for _, provider := range keyBasedProviders {
		resolved, err := s.ResolveProviderSetting(ctx, principal, organizationID, provider)
		if err != nil {
			if errors.Is(err, iam.ErrNotFound("")) {
				continue
			}
			return nil, err
		}
		keys[provider] = resolved.APIKey
	}
	return keys, nil
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
