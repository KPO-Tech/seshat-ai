package knowledge

import (
	"context"
	"errors"
	"strings"

	"gorm.io/gorm"

	sdkembedder "github.com/EngineerProjects/seshat/pkg/rag/embedder"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// EmbedderSetting is the caller-facing view of an organization's embedder
// configuration. Never includes the API key — same redaction stance as
// ProviderSetting/PlatformProviderSetting.
type EmbedderSetting struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organization_id"`
	Provider       string `json:"provider"`
	Model          string `json:"model"`
	BaseURL        string `json:"base_url"`
}

// PlatformEmbedderSetting is the platform-wide default counterpart.
type PlatformEmbedderSetting struct {
	ID       string `json:"id"`
	Provider string `json:"provider"`
	Model    string `json:"model"`
	BaseURL  string `json:"base_url"`
}

// SetEmbedderSettingParams is shared by the org and platform Set calls,
// which are upserts (there is at most one row either way — see
// db.EmbedderSetting's doc comment for why this is a singleton, not a
// list like ProviderSetting). APIKey empty means "no key" on first create
// (valid for an unauthenticated local Ollama) and "keep the existing key
// unchanged" when a setting already exists.
type SetEmbedderSettingParams struct {
	Provider string
	Model    string
	BaseURL  string
	APIKey   string
}

// ─── Organization-scoped embedder setting ─────────────────────────────────

func (s *Service) GetEmbedderSetting(ctx context.Context, principal *iam.Principal, organizationID string) (*EmbedderSetting, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "knowledge.read", "knowledge.manage", "organization.manage"); err != nil {
			return nil, err
		}
	}
	var record sdb.EmbedderSetting
	if err := s.db.Gorm().WithContext(ctx).Where("organization_id = ?", organizationID).First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("no embedder configured for this organization")
		}
		return nil, err
	}
	setting := toEmbedderSetting(record)
	return &setting, nil
}

// SetEmbedderSetting requires knowledge.manage or organization.manage.
func (s *Service) SetEmbedderSetting(ctx context.Context, principal *iam.Principal, organizationID string, params SetEmbedderSettingParams) (*EmbedderSetting, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	provider := strings.ToLower(strings.TrimSpace(params.Provider))
	model := strings.TrimSpace(params.Model)
	baseURL := strings.TrimSpace(params.BaseURL)
	if organizationID == "" || provider == "" || model == "" || baseURL == "" {
		return nil, ErrInvalidInput("organization_id, provider, model and base_url are required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "knowledge.manage", "organization.manage"); err != nil {
			return nil, err
		}
	}

	var record sdb.EmbedderSetting
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		existing := tx.Where("organization_id = ?", organizationID).First(&record).Error
		isCreate := errors.Is(existing, gorm.ErrRecordNotFound)
		if existing != nil && !isCreate {
			return existing
		}

		encryptedAPIKey := record.EncryptedAPIKey // keep existing by default on update
		if apiKey := strings.TrimSpace(params.APIKey); apiKey != "" {
			encrypted, err := encryptSecret(apiKey)
			if err != nil {
				return err
			}
			encryptedAPIKey = encrypted
		} else if isCreate {
			encryptedAPIKey = ""
		}

		if isCreate {
			settingID, err := newID("embset")
			if err != nil {
				return err
			}
			record = sdb.EmbedderSetting{
				ID:              settingID,
				OrganizationID:  organizationID,
				CreatedByUserID: principal.User.ID,
				Provider:        provider,
				Model:           model,
				BaseURL:         baseURL,
				EncryptedAPIKey: encryptedAPIKey,
			}
			if err := tx.Create(&record).Error; err != nil {
				return err
			}
		} else {
			record.Provider = provider
			record.Model = model
			record.BaseURL = baseURL
			record.EncryptedAPIKey = encryptedAPIKey
			if err := tx.Save(&record).Error; err != nil {
				return err
			}
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "embedder_setting.set", "embedder_setting", record.ID, map[string]string{"provider": provider})
	})
	if err != nil {
		return nil, err
	}
	setting := toEmbedderSetting(record)
	return &setting, nil
}

// DeleteEmbedderSetting requires knowledge.manage or organization.manage.
// Falls back to the platform default (if any) for subsequent ingest/search
// calls — existing corpora are not affected or re-embedded.
func (s *Service) DeleteEmbedderSetting(ctx context.Context, principal *iam.Principal, organizationID string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return ErrInvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "knowledge.manage", "organization.manage"); err != nil {
			return err
		}
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.EmbedderSetting
		if err := tx.Where("organization_id = ?", organizationID).First(&record).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("no embedder configured for this organization")
			}
			return err
		}
		if err := tx.Delete(&sdb.EmbedderSetting{}, "id = ?", record.ID).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "embedder_setting.deleted", "embedder_setting", record.ID, map[string]string{"provider": record.Provider})
	})
}

// ─── Platform-wide default embedder setting (superadmin-only) ────────────

func (s *Service) GetPlatformEmbedderSetting(ctx context.Context, principal *iam.Principal) (*PlatformEmbedderSetting, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	if !principal.User.IsAdmin {
		return nil, ErrForbidden("platform admin privileges required")
	}
	var record sdb.PlatformEmbedderSetting
	if err := s.db.Gorm().WithContext(ctx).First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("no platform default embedder configured")
		}
		return nil, err
	}
	setting := toPlatformEmbedderSetting(record)
	return &setting, nil
}

func (s *Service) SetPlatformEmbedderSetting(ctx context.Context, principal *iam.Principal, params SetEmbedderSettingParams) (*PlatformEmbedderSetting, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	if !principal.User.IsAdmin {
		return nil, ErrForbidden("platform admin privileges required")
	}
	provider := strings.ToLower(strings.TrimSpace(params.Provider))
	model := strings.TrimSpace(params.Model)
	baseURL := strings.TrimSpace(params.BaseURL)
	if provider == "" || model == "" || baseURL == "" {
		return nil, ErrInvalidInput("provider, model and base_url are required")
	}

	var record sdb.PlatformEmbedderSetting
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		existing := tx.First(&record).Error
		isCreate := errors.Is(existing, gorm.ErrRecordNotFound)
		if existing != nil && !isCreate {
			return existing
		}

		encryptedAPIKey := record.EncryptedAPIKey
		if apiKey := strings.TrimSpace(params.APIKey); apiKey != "" {
			encrypted, err := encryptSecret(apiKey)
			if err != nil {
				return err
			}
			encryptedAPIKey = encrypted
		} else if isCreate {
			encryptedAPIKey = ""
		}

		if isCreate {
			settingID, err := newID("platembset")
			if err != nil {
				return err
			}
			record = sdb.PlatformEmbedderSetting{
				ID:              settingID,
				CreatedByUserID: principal.User.ID,
				Provider:        provider,
				Model:           model,
				BaseURL:         baseURL,
				EncryptedAPIKey: encryptedAPIKey,
			}
			if err := tx.Create(&record).Error; err != nil {
				return err
			}
		} else {
			record.Provider = provider
			record.Model = model
			record.BaseURL = baseURL
			record.EncryptedAPIKey = encryptedAPIKey
			if err := tx.Save(&record).Error; err != nil {
				return err
			}
		}
		// Platform-level action, not scoped to any organization.
		return s.iam.AppendAuditEvent(tx, principal, "", "platform_embedder_setting.set", "platform_embedder_setting", record.ID, map[string]string{"provider": provider})
	})
	if err != nil {
		return nil, err
	}
	setting := toPlatformEmbedderSetting(record)
	return &setting, nil
}

func (s *Service) DeletePlatformEmbedderSetting(ctx context.Context, principal *iam.Principal) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	if !principal.User.IsAdmin {
		return ErrForbidden("platform admin privileges required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.PlatformEmbedderSetting
		if err := tx.First(&record).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("no platform default embedder configured")
			}
			return err
		}
		if err := tx.Delete(&sdb.PlatformEmbedderSetting{}, "id = ?", record.ID).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, "", "platform_embedder_setting.deleted", "platform_embedder_setting", record.ID, map[string]string{"provider": record.Provider})
	})
}

// ─── Resolution (used internally by Ingest/Search/DeleteCorpus/etc.) ─────

// resolveEmbedderConfig implements the hybrid BYOK/managed model: an
// organization's own EmbedderSetting always wins when configured, else the
// platform-wide PlatformEmbedderSetting default. Returns ok=false if
// neither exists.
func (s *Service) resolveEmbedderConfig(ctx context.Context, organizationID string) (sdkembedder.Config, bool, error) {
	var orgSetting sdb.EmbedderSetting
	err := s.db.Gorm().WithContext(ctx).Where("organization_id = ?", organizationID).First(&orgSetting).Error
	if err == nil {
		return decryptedEmbedderConfig(orgSetting.Provider, orgSetting.Model, orgSetting.BaseURL, orgSetting.EncryptedAPIKey)
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return sdkembedder.Config{}, false, err
	}

	var platformSetting sdb.PlatformEmbedderSetting
	err = s.db.Gorm().WithContext(ctx).First(&platformSetting).Error
	if err == nil {
		return decryptedEmbedderConfig(platformSetting.Provider, platformSetting.Model, platformSetting.BaseURL, platformSetting.EncryptedAPIKey)
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return sdkembedder.Config{}, false, err
	}
	return sdkembedder.Config{}, false, nil
}

func decryptedEmbedderConfig(provider, model, baseURL, encryptedAPIKey string) (sdkembedder.Config, bool, error) {
	apiKey := ""
	if encryptedAPIKey != "" {
		decrypted, err := decryptSecret(encryptedAPIKey)
		if err != nil {
			return sdkembedder.Config{}, false, err
		}
		apiKey = decrypted
	}
	return sdkembedder.Config{
		Provider: sdkembedder.Provider(provider),
		Model:    model,
		BaseURL:  baseURL,
		APIKey:   apiKey,
	}, true, nil
}

func toEmbedderSetting(r sdb.EmbedderSetting) EmbedderSetting {
	return EmbedderSetting{
		ID:             r.ID,
		OrganizationID: r.OrganizationID,
		Provider:       r.Provider,
		Model:          r.Model,
		BaseURL:        r.BaseURL,
	}
}

func toPlatformEmbedderSetting(r sdb.PlatformEmbedderSetting) PlatformEmbedderSetting {
	return PlatformEmbedderSetting{
		ID:       r.ID,
		Provider: r.Provider,
		Model:    r.Model,
		BaseURL:  r.BaseURL,
	}
}
