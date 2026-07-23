package automation

import (
	"context"
	"errors"
	"strings"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// ProviderSetting is the caller-facing view of an organization's LLM
// provider credentials. The API key is caller-supplied, like
// iam.Provider.ClientSecret — it is never echoed back in any response, not
// even at creation, since (unlike a server-generated secret) there's no
// "shown once" moment the caller needs: they already have their own key.
type ProviderSetting struct {
	ID              string `json:"id"`
	OrganizationID  string `json:"organization_id"`
	CreatedByUserID string `json:"created_by_user_id"`
	Provider        string `json:"provider"`
	DefaultModel    string `json:"default_model"`
	BaseURL         string `json:"base_url,omitempty"`
	IsDefault       bool   `json:"is_default"`
}

type CreateProviderSettingParams struct {
	OrganizationID string
	Provider       string
	DefaultModel   string
	BaseURL        string
	APIKey         string
}

type UpdateProviderSettingParams struct {
	DefaultModel string
	BaseURL      string
	// APIKey empty means "keep the existing key" — avoids forcing the
	// caller to resupply a secret they're not trying to change.
	APIKey string
}

// ListProviderSettings returns the LLM providers configured for an
// organization. Scoped visibility like every other list endpoint: a caller
// lacking provider_settings.read/manage/organization.manage sees an empty
// list, not a 403.
func (s *Service) ListProviderSettings(ctx context.Context, principal *iam.Principal, organizationID string) ([]ProviderSetting, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "provider_settings.read", "provider_settings.manage", "organization.manage"); err != nil {
			return []ProviderSetting{}, nil
		}
	}
	var records []sdb.ProviderSetting
	if err := s.db.Gorm().WithContext(ctx).Where("organization_id = ?", organizationID).Order("provider asc").Find(&records).Error; err != nil {
		return nil, err
	}
	settings := make([]ProviderSetting, 0, len(records))
	for _, record := range records {
		settings = append(settings, toProviderSetting(record))
	}
	return settings, nil
}

// GetProviderSetting requires provider_settings.read/manage or
// organization.manage.
func (s *Service) GetProviderSetting(ctx context.Context, principal *iam.Principal, id string) (*ProviderSetting, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	var record sdb.ProviderSetting
	if err := s.db.Gorm().WithContext(ctx).First(&record, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("provider setting not found")
		}
		return nil, err
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, record.OrganizationID, "provider_settings.read", "provider_settings.manage", "organization.manage"); err != nil {
			return nil, err
		}
	}
	setting := toProviderSetting(record)
	return &setting, nil
}

// CreateProviderSetting stores encrypted credentials for one (organization,
// provider) pair. Requires provider_settings.manage or organization.manage.
func (s *Service) CreateProviderSetting(ctx context.Context, principal *iam.Principal, params CreateProviderSettingParams) (*ProviderSetting, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	provider := strings.ToLower(strings.TrimSpace(params.Provider))
	defaultModel := strings.TrimSpace(params.DefaultModel)
	apiKey := strings.TrimSpace(params.APIKey)
	if organizationID == "" || provider == "" || defaultModel == "" || apiKey == "" {
		return nil, ErrInvalidInput("organization_id, provider, default_model and api_key are required")
	}

	var setting sdb.ProviderSetting
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "provider_settings.manage", "organization.manage"); err != nil {
			return err
		}
		var existing sdb.ProviderSetting
		err := tx.Where("organization_id = ? AND provider = ?", organizationID, provider).First(&existing).Error
		if err == nil {
			return ErrConflict("a provider setting for " + provider + " already exists in this organization; use update instead")
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		encrypted, err := encryptSecret(apiKey)
		if err != nil {
			return err
		}
		providerSettingID, err := newID("provset")
		if err != nil {
			return err
		}
		setting = sdb.ProviderSetting{
			ID:              providerSettingID,
			OrganizationID:  organizationID,
			CreatedByUserID: principal.User.ID,
			Provider:        provider,
			DefaultModel:    defaultModel,
			BaseURL:         strings.TrimSpace(params.BaseURL),
			EncryptedAPIKey: encrypted,
		}
		if err := tx.Create(&setting).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "provider_setting.created", "provider_setting", setting.ID, map[string]string{"provider": provider})
	})
	if err != nil {
		return nil, err
	}
	result := toProviderSetting(setting)
	return &result, nil
}

// UpdateProviderSetting requires provider_settings.manage or
// organization.manage. An empty APIKey leaves the stored credential
// unchanged.
func (s *Service) UpdateProviderSetting(ctx context.Context, principal *iam.Principal, id string, params UpdateProviderSettingParams) (*ProviderSetting, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	var setting sdb.ProviderSetting
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := tx.First(&setting, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("provider setting not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, setting.OrganizationID, "provider_settings.manage", "organization.manage"); err != nil {
			return err
		}
		if defaultModel := strings.TrimSpace(params.DefaultModel); defaultModel != "" {
			setting.DefaultModel = defaultModel
		}
		setting.BaseURL = strings.TrimSpace(params.BaseURL)
		if apiKey := strings.TrimSpace(params.APIKey); apiKey != "" {
			encrypted, err := encryptSecret(apiKey)
			if err != nil {
				return err
			}
			setting.EncryptedAPIKey = encrypted
		}
		if err := tx.Save(&setting).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, setting.OrganizationID, "provider_setting.updated", "provider_setting", setting.ID, map[string]string{"provider": setting.Provider})
	})
	if err != nil {
		return nil, err
	}
	result := toProviderSetting(setting)
	return &result, nil
}

// DeleteProviderSetting requires provider_settings.manage or
// organization.manage. Any cloud job depending on this provider will start
// failing at execution time with a clear "no provider_settings configured"
// reason — deleting does not touch existing jobs.
func (s *Service) DeleteProviderSetting(ctx context.Context, principal *iam.Principal, id string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var setting sdb.ProviderSetting
		if err := tx.First(&setting, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("provider setting not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, setting.OrganizationID, "provider_settings.manage", "organization.manage"); err != nil {
			return err
		}
		if err := tx.Delete(&sdb.ProviderSetting{}, "id = ?", id).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, setting.OrganizationID, "provider_setting.deleted", "provider_setting", setting.ID, map[string]string{"provider": setting.Provider})
	})
}

// ResolvedProviderSetting is the effective, USABLE provider config for a
// caller — unlike ProviderSetting, it includes the decrypted API key, since
// the whole point is for a connected seshat-backend to actually make the
// LLM call with it.
type ResolvedProviderSetting struct {
	Provider     string `json:"provider"`
	DefaultModel string `json:"default_model"`
	BaseURL      string `json:"base_url,omitempty"`
	APIKey       string `json:"api_key"`
	// Source is "organization" or "platform" — which tier the config came
	// from. "platform" means the requesting organization had none of its
	// own and this was resolved from the organization currently flagged
	// IsDefault (see iam.Service.DefaultOrganizationID) — kept as the
	// string "platform" for API compatibility even though there's no
	// separate platform-level settings table anymore.
	Source string `json:"source"`
}

// ResolveProviderSetting returns the effective config (org setting if
// present, else the platform default) for organizationID+provider.
// Authorization is deliberately looser than provider_settings.read/.manage:
// any member of the organization (or a platform admin) can resolve "what
// should I use" — this is read access to what's already been configured for
// them, the same trust level as using their own session, not admin
// configuration of the setting itself.
func (s *Service) ResolveProviderSetting(ctx context.Context, principal *iam.Principal, organizationID, provider string) (*ResolvedProviderSetting, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	provider = strings.ToLower(strings.TrimSpace(provider))
	if organizationID == "" || provider == "" {
		return nil, ErrInvalidInput("organization_id and provider are required")
	}

	tx := s.db.Gorm().WithContext(ctx)
	allowed, err := s.iam.CanAccessOrganization(tx, principal, organizationID)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, ErrForbidden("not a member of this organization")
	}

	if orgSetting, found, err := s.findProviderSetting(ctx, organizationID, provider); err != nil {
		return nil, err
	} else if found {
		apiKey, err := decryptSecret(orgSetting.EncryptedAPIKey)
		if err != nil {
			return nil, err
		}
		return &ResolvedProviderSetting{
			Provider: orgSetting.Provider, DefaultModel: orgSetting.DefaultModel,
			BaseURL: orgSetting.BaseURL, APIKey: apiKey, Source: "organization",
		}, nil
	}

	defaultOrgID, found, err := s.iam.DefaultOrganizationID(tx)
	if err != nil {
		return nil, err
	}
	if found && defaultOrgID != organizationID {
		if defaultSetting, found, err := s.findProviderSetting(ctx, defaultOrgID, provider); err != nil {
			return nil, err
		} else if found {
			apiKey, err := decryptSecret(defaultSetting.EncryptedAPIKey)
			if err != nil {
				return nil, err
			}
			return &ResolvedProviderSetting{
				Provider: defaultSetting.Provider, DefaultModel: defaultSetting.DefaultModel,
				BaseURL: defaultSetting.BaseURL, APIKey: apiKey, Source: "platform",
			}, nil
		}
	}
	return nil, ErrNotFound("no provider setting configured for " + provider + " (checked this organization and the platform default)")
}

// findProviderSetting looks up the credentials for one (organization,
// provider) pair — used internally at cloud-execution time, not
// permission-gated (the caller is the scheduler acting on the job's own
// behalf, not a user request).
func (s *Service) findProviderSetting(ctx context.Context, organizationID, provider string) (sdb.ProviderSetting, bool, error) {
	var record sdb.ProviderSetting
	err := s.db.Gorm().WithContext(ctx).Where("organization_id = ? AND provider = ?", organizationID, provider).First(&record).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return sdb.ProviderSetting{}, false, nil
		}
		return sdb.ProviderSetting{}, false, err
	}
	return record, true, nil
}

func toProviderSetting(record sdb.ProviderSetting) ProviderSetting {
	return ProviderSetting{
		ID:              record.ID,
		OrganizationID:  record.OrganizationID,
		CreatedByUserID: record.CreatedByUserID,
		Provider:        record.Provider,
		DefaultModel:    record.DefaultModel,
		BaseURL:         record.BaseURL,
		IsDefault:       record.IsDefault,
	}
}

// SetProviderSettingDefault marks (or unmarks) this provider setting as its
// organization's "main" one. Administrative/UI only - see
// sdb.ProviderSetting.IsDefault's doc comment. Requires
// provider_settings.manage or organization.manage, same as every other
// mutation on this resource.
func (s *Service) SetProviderSettingDefault(ctx context.Context, principal *iam.Principal, id string, isDefault bool) (*ProviderSetting, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	var setting sdb.ProviderSetting
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := tx.First(&setting, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("provider setting not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, setting.OrganizationID, "provider_settings.manage", "organization.manage"); err != nil {
			return err
		}

		if isDefault {
			if err := tx.Model(&sdb.ProviderSetting{}).
				Where("organization_id = ? AND is_default = ? AND id <> ?", setting.OrganizationID, true, id).
				Update("is_default", false).Error; err != nil {
				return err
			}
		}

		setting.IsDefault = isDefault
		if err := tx.Save(&setting).Error; err != nil {
			return err
		}

		action := "provider_setting.default_unset"
		if isDefault {
			action = "provider_setting.default_set"
		}
		return s.iam.AppendAuditEvent(tx, principal, setting.OrganizationID, action, "provider_setting", setting.ID, map[string]string{"provider": setting.Provider})
	})
	if err != nil {
		return nil, err
	}
	result := toProviderSetting(setting)
	return &result, nil
}
