package knowledge

import (
	"context"
	"errors"
	"strings"

	"gorm.io/gorm"

	sdkreranker "github.com/KPO-Tech/seshat/pkg/rag/reranker"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// RerankerSetting is the caller-facing view of an organization's reranker
// configuration. Never includes the API key - same redaction stance as
// EmbedderSetting/ProviderSetting.
type RerankerSetting struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organization_id"`
	BaseURL        string `json:"base_url"`
	Model          string `json:"model,omitempty"`
	HasAPIKey      bool   `json:"has_api_key"`
	Enabled        bool   `json:"enabled"`
}

// SetRerankerSettingParams is the input for the org-scoped Set call, an
// upsert (at most one row per organization - see db.RerankerSetting's doc
// comment). APIKey empty means "no key" on first create (the common case
// for a self-hosted TEI/vLLM instance) and "keep the existing key
// unchanged" when a setting already exists - same convention as
// SetEmbedderSettingParams.
type SetRerankerSettingParams struct {
	BaseURL string
	Model   string
	APIKey  string
	Enabled bool
}

// ─── Organization-scoped reranker setting ─────────────────────────────────

func (s *Service) GetRerankerSetting(ctx context.Context, principal *iam.Principal, organizationID string) (*RerankerSetting, error) {
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
	var record sdb.RerankerSetting
	if err := s.db.Gorm().WithContext(ctx).Where("organization_id = ?", organizationID).First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("no reranker configured for this organization")
		}
		return nil, err
	}
	setting := toRerankerSetting(record)
	return &setting, nil
}

// SetRerankerSetting requires knowledge.manage or organization.manage.
func (s *Service) SetRerankerSetting(ctx context.Context, principal *iam.Principal, organizationID string, params SetRerankerSettingParams) (*RerankerSetting, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	baseURL := strings.TrimSpace(params.BaseURL)
	if organizationID == "" || baseURL == "" {
		return nil, ErrInvalidInput("organization_id and base_url are required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "knowledge.manage", "organization.manage"); err != nil {
			return nil, err
		}
	}

	var record sdb.RerankerSetting
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		existing := tx.Where("organization_id = ?", organizationID).First(&record).Error
		isCreate := errors.Is(existing, gorm.ErrRecordNotFound)
		if existing != nil && !isCreate {
			return existing
		}

		encryptedAPIKey := record.EncryptedAPIKey // keep existing by default on update
		if apiKey := strings.TrimSpace(params.APIKey); apiKey != "" {
			encrypted, err := encryptSecret(tx, organizationID, apiKey)
			if err != nil {
				return err
			}
			encryptedAPIKey = encrypted
		} else if isCreate {
			encryptedAPIKey = ""
		}

		model := strings.TrimSpace(params.Model)
		if isCreate {
			settingID, err := newID("rerankset")
			if err != nil {
				return err
			}
			record = sdb.RerankerSetting{
				ID:              settingID,
				OrganizationID:  organizationID,
				CreatedByUserID: principal.User.ID,
				BaseURL:         baseURL,
				Model:           model,
				EncryptedAPIKey: encryptedAPIKey,
				Enabled:         params.Enabled,
			}
			if err := tx.Create(&record).Error; err != nil {
				return err
			}
		} else {
			record.BaseURL = baseURL
			record.Model = model
			record.EncryptedAPIKey = encryptedAPIKey
			record.Enabled = params.Enabled
			if err := tx.Save(&record).Error; err != nil {
				return err
			}
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "reranker_setting.set", "reranker_setting", record.ID, map[string]string{"base_url": baseURL})
	})
	if err != nil {
		return nil, err
	}
	setting := toRerankerSetting(record)
	return &setting, nil
}

// DeleteRerankerSetting requires knowledge.manage or organization.manage.
// Search reverts to the platform-wide RAG_RERANK_* env var (if any) for
// subsequent requests - existing corpora/chunks are unaffected either way,
// since the reranker never touches stored vectors, only re-orders search
// results at query time.
func (s *Service) DeleteRerankerSetting(ctx context.Context, principal *iam.Principal, organizationID string) error {
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
		var record sdb.RerankerSetting
		if err := tx.Where("organization_id = ?", organizationID).First(&record).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("no reranker configured for this organization")
			}
			return err
		}
		if err := tx.Delete(&sdb.RerankerSetting{}, "id = ?", record.ID).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "reranker_setting.deleted", "reranker_setting", record.ID, nil)
	})
}

// ─── Resolution (used internally by ragServiceFor) ────────────────────────

// resolveRerankerConfig returns the organization's own RerankerSetting when
// one exists and is enabled - no "shared platform default" fallback the way
// resolveEmbedderConfig has (a missing reranker is a fully supported "no
// second pass" state, not a broken one worth propagating from another
// organization). ok=false (not an error) means ragServiceFor should fall
// back to the platform-wide RAG_RERANK_* env var, preserving today's
// single-deployment-wide behavior for any organization that hasn't set its
// own.
func (s *Service) resolveRerankerConfig(ctx context.Context, organizationID string) (sdkreranker.Config, bool, error) {
	tx := s.db.Gorm().WithContext(ctx)
	var record sdb.RerankerSetting
	err := tx.Where("organization_id = ? AND enabled = ?", organizationID, true).First(&record).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return sdkreranker.Config{}, false, nil
	}
	if err != nil {
		return sdkreranker.Config{}, false, err
	}
	apiKey := ""
	if record.EncryptedAPIKey != "" {
		decrypted, err := decryptSecret(tx, organizationID, record.EncryptedAPIKey)
		if err != nil {
			return sdkreranker.Config{}, false, err
		}
		apiKey = decrypted
	}
	return sdkreranker.Config{
		BaseURL: record.BaseURL,
		Model:   record.Model,
		APIKey:  apiKey,
	}, true, nil
}

func toRerankerSetting(r sdb.RerankerSetting) RerankerSetting {
	return RerankerSetting{
		ID:             r.ID,
		OrganizationID: r.OrganizationID,
		BaseURL:        r.BaseURL,
		Model:          r.Model,
		HasAPIKey:      r.EncryptedAPIKey != "",
		Enabled:        r.Enabled,
	}
}
