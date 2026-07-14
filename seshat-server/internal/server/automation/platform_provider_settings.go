package automation

import (
	"context"
	"errors"
	"strings"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// PlatformProviderSetting is the caller-facing view of a platform-wide
// default LLM credential. Same redaction stance as ProviderSetting: the API
// key is caller-supplied and never echoed back, not even at creation — the
// DTO has no field for it at all, so there's no redaction step to forget.
type PlatformProviderSetting struct {
	ID              string `json:"id"`
	CreatedByUserID string `json:"created_by_user_id"`
	Provider        string `json:"provider"`
	DefaultModel    string `json:"default_model"`
	BaseURL         string `json:"base_url,omitempty"`
}

type CreatePlatformProviderSettingParams struct {
	Provider     string
	DefaultModel string
	BaseURL      string
	APIKey       string
}

type UpdatePlatformProviderSettingParams struct {
	DefaultModel string
	BaseURL      string
	// APIKey empty means "keep the existing key".
	APIKey string
}

// ListPlatformProviderSettings requires platform-admin (User.IsAdmin) —
// there is no organization to scope visibility to, so unlike every other
// list endpoint in this control plane, a non-admin gets a 403, not an empty
// list, matching how iam.ListUsers (also platform-admin-only) behaves.
func (s *Service) ListPlatformProviderSettings(ctx context.Context, principal *iam.Principal) ([]PlatformProviderSetting, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	if !principal.User.IsAdmin {
		return nil, ErrForbidden("platform admin privileges required")
	}
	var records []sdb.PlatformProviderSetting
	if err := s.db.Gorm().WithContext(ctx).Order("provider asc").Find(&records).Error; err != nil {
		return nil, err
	}
	settings := make([]PlatformProviderSetting, 0, len(records))
	for _, record := range records {
		settings = append(settings, toPlatformProviderSetting(record))
	}
	return settings, nil
}

func (s *Service) GetPlatformProviderSetting(ctx context.Context, principal *iam.Principal, id string) (*PlatformProviderSetting, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	if !principal.User.IsAdmin {
		return nil, ErrForbidden("platform admin privileges required")
	}
	var record sdb.PlatformProviderSetting
	if err := s.db.Gorm().WithContext(ctx).First(&record, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("platform provider setting not found")
		}
		return nil, err
	}
	setting := toPlatformProviderSetting(record)
	return &setting, nil
}

// CreatePlatformProviderSetting stores the platform-wide default
// credentials for one provider. Any organization without its own
// ProviderSetting for that provider falls back to this at cloud-execution
// time (see resolveProviderCredentials).
func (s *Service) CreatePlatformProviderSetting(ctx context.Context, principal *iam.Principal, params CreatePlatformProviderSettingParams) (*PlatformProviderSetting, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	if !principal.User.IsAdmin {
		return nil, ErrForbidden("platform admin privileges required")
	}
	provider := strings.ToLower(strings.TrimSpace(params.Provider))
	defaultModel := strings.TrimSpace(params.DefaultModel)
	apiKey := strings.TrimSpace(params.APIKey)
	if provider == "" || defaultModel == "" || apiKey == "" {
		return nil, ErrInvalidInput("provider, default_model and api_key are required")
	}

	var setting sdb.PlatformProviderSetting
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var existing sdb.PlatformProviderSetting
		err := tx.Where("provider = ?", provider).First(&existing).Error
		if err == nil {
			return ErrConflict("a platform provider setting for " + provider + " already exists; use update instead")
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		encrypted, err := encryptSecret(apiKey)
		if err != nil {
			return err
		}
		settingID, err := newID("platprovset")
		if err != nil {
			return err
		}
		setting = sdb.PlatformProviderSetting{
			ID:              settingID,
			CreatedByUserID: principal.User.ID,
			Provider:        provider,
			DefaultModel:    defaultModel,
			BaseURL:         strings.TrimSpace(params.BaseURL),
			EncryptedAPIKey: encrypted,
		}
		if err := tx.Create(&setting).Error; err != nil {
			return err
		}
		// Platform-level action, not scoped to any organization.
		return s.iam.AppendAuditEvent(tx, principal, "", "platform_provider_setting.created", "platform_provider_setting", setting.ID, map[string]string{"provider": provider})
	})
	if err != nil {
		return nil, err
	}
	result := toPlatformProviderSetting(setting)
	return &result, nil
}

func (s *Service) UpdatePlatformProviderSetting(ctx context.Context, principal *iam.Principal, id string, params UpdatePlatformProviderSettingParams) (*PlatformProviderSetting, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	if !principal.User.IsAdmin {
		return nil, ErrForbidden("platform admin privileges required")
	}
	var setting sdb.PlatformProviderSetting
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := tx.First(&setting, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("platform provider setting not found")
			}
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
		return s.iam.AppendAuditEvent(tx, principal, "", "platform_provider_setting.updated", "platform_provider_setting", setting.ID, map[string]string{"provider": setting.Provider})
	})
	if err != nil {
		return nil, err
	}
	result := toPlatformProviderSetting(setting)
	return &result, nil
}

// DeletePlatformProviderSetting requires platform-admin. Any cloud job that
// was relying on this as its fallback (no org-level ProviderSetting of its
// own) starts failing at execution time with a clear reason — deleting does
// not touch existing jobs, matching DeleteProviderSetting's behavior.
func (s *Service) DeletePlatformProviderSetting(ctx context.Context, principal *iam.Principal, id string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	if !principal.User.IsAdmin {
		return ErrForbidden("platform admin privileges required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var setting sdb.PlatformProviderSetting
		if err := tx.First(&setting, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("platform provider setting not found")
			}
			return err
		}
		if err := tx.Delete(&sdb.PlatformProviderSetting{}, "id = ?", id).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, "", "platform_provider_setting.deleted", "platform_provider_setting", setting.ID, map[string]string{"provider": setting.Provider})
	})
}

// findPlatformProviderSetting looks up the platform default credentials for
// one provider — used internally at cloud-execution time as the fallback
// when an organization has no ProviderSetting of its own. Not
// permission-gated, same reasoning as findProviderSetting: the caller here
// is the scheduler acting on the job's own behalf, not a user request.
func (s *Service) findPlatformProviderSetting(ctx context.Context, provider string) (sdb.PlatformProviderSetting, bool, error) {
	var record sdb.PlatformProviderSetting
	err := s.db.Gorm().WithContext(ctx).Where("provider = ?", provider).First(&record).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return sdb.PlatformProviderSetting{}, false, nil
		}
		return sdb.PlatformProviderSetting{}, false, err
	}
	return record, true, nil
}

func toPlatformProviderSetting(record sdb.PlatformProviderSetting) PlatformProviderSetting {
	return PlatformProviderSetting{
		ID:              record.ID,
		CreatedByUserID: record.CreatedByUserID,
		Provider:        record.Provider,
		DefaultModel:    record.DefaultModel,
		BaseURL:         record.BaseURL,
	}
}
