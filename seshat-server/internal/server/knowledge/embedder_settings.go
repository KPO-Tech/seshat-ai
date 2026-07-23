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
// ProviderSetting.
type EmbedderSetting struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organization_id"`
	Provider       string `json:"provider"`
	Model          string `json:"model"`
	BaseURL        string `json:"base_url"`
}

// SetEmbedderSettingParams is the input for the org-scoped Set call, an
// upsert (there is at most one row per organization — see
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
// Falls back to the default organization's embedder (if any) for subsequent
// ingest/search calls — existing corpora are not affected or re-embedded.
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

// ─── Resolution (used internally by Ingest/Search/DeleteCorpus/etc.) ─────

// resolveEmbedderConfig implements the hybrid BYOK/managed model: an
// organization's own EmbedderSetting always wins when configured, else the
// EmbedderSetting of whichever organization is currently flagged IsDefault
// (see iam.Service.DefaultOrganizationID). Returns ok=false if neither
// exists.
func (s *Service) resolveEmbedderConfig(ctx context.Context, organizationID string) (sdkembedder.Config, bool, error) {
	var orgSetting sdb.EmbedderSetting
	err := s.db.Gorm().WithContext(ctx).Where("organization_id = ?", organizationID).First(&orgSetting).Error
	if err == nil {
		return decryptedEmbedderConfig(orgSetting.Provider, orgSetting.Model, orgSetting.BaseURL, orgSetting.EncryptedAPIKey)
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return sdkembedder.Config{}, false, err
	}

	tx := s.db.Gorm().WithContext(ctx)
	defaultOrgID, found, err := s.iam.DefaultOrganizationID(tx)
	if err != nil {
		return sdkembedder.Config{}, false, err
	}
	if !found || defaultOrgID == organizationID {
		return sdkembedder.Config{}, false, nil
	}

	var defaultSetting sdb.EmbedderSetting
	err = tx.Where("organization_id = ?", defaultOrgID).First(&defaultSetting).Error
	if err == nil {
		return decryptedEmbedderConfig(defaultSetting.Provider, defaultSetting.Model, defaultSetting.BaseURL, defaultSetting.EncryptedAPIKey)
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
