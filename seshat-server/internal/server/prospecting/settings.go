package prospecting

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// Settings is the caller-facing view of an organization's Prospecting
// configuration. Never includes the API key — same redaction stance as
// knowledge.EmbedderSetting.
type Settings struct {
	ID             string    `json:"id"`
	OrganizationID string    `json:"organization_id"`
	DailyCap       int       `json:"daily_cap"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// SetSettingsParams is the input for the org-scoped upsert (at most one row
// per organization, see sdb.ProspectingSettings's doc comment). APIKey empty
// means "keep the existing key unchanged" on update — it's always required
// on create, since unlike an embedder there is no keyless Places provider.
type SetSettingsParams struct {
	APIKey   string
	DailyCap int
}

func (s *Service) GetSettings(ctx context.Context, principal *iam.Principal, organizationID string) (*Settings, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "prospecting.read", "prospecting.manage", "organization.manage"); err != nil {
			return nil, err
		}
	}
	record, err := s.loadSettings(ctx, organizationID)
	if err != nil {
		return nil, err
	}
	view := toSettings(*record)
	return &view, nil
}

// SetSettings requires prospecting.manage or organization.manage.
func (s *Service) SetSettings(ctx context.Context, principal *iam.Principal, organizationID string, params SetSettingsParams) (*Settings, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "prospecting.manage", "organization.manage"); err != nil {
			return nil, err
		}
	}
	dailyCap := params.DailyCap
	if dailyCap < 0 {
		dailyCap = 0
	}

	var record sdb.ProspectingSettings
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		existing := tx.Where("organization_id = ?", organizationID).First(&record).Error
		isCreate := errors.Is(existing, gorm.ErrRecordNotFound)
		if existing != nil && !isCreate {
			return existing
		}

		encryptedAPIKey := record.EncryptedAPIKey // keep existing by default on update
		apiKey := strings.TrimSpace(params.APIKey)
		if apiKey != "" {
			encrypted, err := encryptSecret(apiKey)
			if err != nil {
				return err
			}
			encryptedAPIKey = encrypted
		} else if isCreate {
			return ErrInvalidInput("api_key is required")
		}

		if isCreate {
			settingID, err := newID("pset")
			if err != nil {
				return err
			}
			record = sdb.ProspectingSettings{
				ID:              settingID,
				OrganizationID:  organizationID,
				CreatedByUserID: principal.User.ID,
				EncryptedAPIKey: encryptedAPIKey,
				DailyCap:        dailyCap,
			}
			if err := tx.Create(&record).Error; err != nil {
				return err
			}
		} else {
			record.EncryptedAPIKey = encryptedAPIKey
			record.DailyCap = dailyCap
			if err := tx.Save(&record).Error; err != nil {
				return err
			}
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "prospecting_settings.set", "prospecting_settings", record.ID, map[string]string{"daily_cap": strconv.Itoa(dailyCap)})
	})
	if err != nil {
		return nil, err
	}
	view := toSettings(record)
	return &view, nil
}

func (s *Service) loadSettings(ctx context.Context, organizationID string) (*sdb.ProspectingSettings, error) {
	var record sdb.ProspectingSettings
	if err := s.db.Gorm().WithContext(ctx).Where("organization_id = ?", organizationID).First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("prospecting is not configured for this organization yet")
		}
		return nil, err
	}
	return &record, nil
}

func toSettings(r sdb.ProspectingSettings) Settings {
	return Settings{
		ID:             r.ID,
		OrganizationID: r.OrganizationID,
		DailyCap:       r.DailyCap,
		CreatedAt:      r.CreatedAt,
		UpdatedAt:      r.UpdatedAt,
	}
}
