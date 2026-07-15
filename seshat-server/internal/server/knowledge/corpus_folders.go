package knowledge

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// CorpusFolder is a one-level, named grouping of an organization's corpora
// - see db.CorpusFolder's doc comment for why this is a real entity rather
// than a freeform tag.
type CorpusFolder struct {
	ID              string    `json:"id"`
	OrganizationID  string    `json:"organization_id"`
	CreatedByUserID string    `json:"created_by_user_id"`
	Name            string    `json:"name"`
	Description     string    `json:"description,omitempty"`
	Icon            string    `json:"icon"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type CreateCorpusFolderParams struct {
	OrganizationID string
	Name           string
	Description    string
	Icon           string
}

type UpdateCorpusFolderParams struct {
	Name        string
	Description string
	Icon        string
}

// ListCorpusFolders requires only org membership, same trust level as
// ListSkillRepos - a folder's name/description isn't secret.
func (s *Service) ListCorpusFolders(ctx context.Context, principal *iam.Principal, organizationID string) ([]CorpusFolder, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	if !principal.User.IsAdmin {
		allowed, err := s.iam.CanAccessOrganization(tx, principal, organizationID)
		if err != nil {
			return nil, err
		}
		if !allowed {
			return nil, ErrForbidden("not a member of this organization")
		}
	}
	var records []sdb.CorpusFolder
	if err := tx.Where("organization_id = ?", organizationID).Order("name asc").Find(&records).Error; err != nil {
		return nil, err
	}
	result := make([]CorpusFolder, 0, len(records))
	for _, record := range records {
		result = append(result, toCorpusFolder(record))
	}
	return result, nil
}

// CreateCorpusFolder requires knowledge.manage or organization.manage.
func (s *Service) CreateCorpusFolder(ctx context.Context, principal *iam.Principal, params CreateCorpusFolderParams) (*CorpusFolder, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	name := strings.TrimSpace(params.Name)
	if organizationID == "" || name == "" {
		return nil, ErrInvalidInput("organization_id and name are required")
	}
	icon := strings.TrimSpace(params.Icon)
	if icon == "" {
		icon = "📁"
	}

	var record sdb.CorpusFolder
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "knowledge.manage", "organization.manage"); err != nil {
			return err
		}
		var conflicting int64
		if err := tx.Model(&sdb.CorpusFolder{}).Where("organization_id = ? AND name = ?", organizationID, name).Count(&conflicting).Error; err != nil {
			return err
		}
		if conflicting > 0 {
			return ErrConflict("a folder with this name already exists in this organization")
		}
		id, err := newID("corpusfolder")
		if err != nil {
			return err
		}
		record = sdb.CorpusFolder{
			ID: id, OrganizationID: organizationID, CreatedByUserID: principal.User.ID,
			Name: name, Description: strings.TrimSpace(params.Description), Icon: icon,
		}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "corpus_folder.created", "corpus_folder", record.ID, map[string]string{"name": name})
	})
	if err != nil {
		return nil, err
	}
	result := toCorpusFolder(record)
	return &result, nil
}

func (s *Service) UpdateCorpusFolder(ctx context.Context, principal *iam.Principal, id string, params UpdateCorpusFolderParams) (*CorpusFolder, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	id = strings.TrimSpace(id)
	name := strings.TrimSpace(params.Name)
	if id == "" || name == "" {
		return nil, ErrInvalidInput("id and name are required")
	}

	var record sdb.CorpusFolder
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := tx.First(&record, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("folder not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "knowledge.manage", "organization.manage"); err != nil {
			return err
		}
		if name != record.Name {
			var conflicting int64
			if err := tx.Model(&sdb.CorpusFolder{}).Where("organization_id = ? AND name = ? AND id <> ?", record.OrganizationID, name, record.ID).Count(&conflicting).Error; err != nil {
				return err
			}
			if conflicting > 0 {
				return ErrConflict("a folder with this name already exists in this organization")
			}
		}
		icon := strings.TrimSpace(params.Icon)
		if icon == "" {
			icon = record.Icon
		}
		record.Name = name
		record.Description = strings.TrimSpace(params.Description)
		record.Icon = icon
		if err := tx.Save(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "corpus_folder.updated", "corpus_folder", record.ID, map[string]string{"name": record.Name})
	})
	if err != nil {
		return nil, err
	}
	result := toCorpusFolder(record)
	return &result, nil
}

// DeleteCorpusFolder unfiles (rather than cascade-deletes) every corpus
// currently in this folder before removing it - a folder is purely
// organizational, deleting it should never destroy someone's knowledge
// base. Requires knowledge.manage or organization.manage.
func (s *Service) DeleteCorpusFolder(ctx context.Context, principal *iam.Principal, id string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return ErrInvalidInput("id is required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.CorpusFolder
		if err := tx.First(&record, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("folder not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "knowledge.manage", "organization.manage"); err != nil {
			return err
		}
		if err := tx.Model(&sdb.Corpus{}).Where("folder_id = ?", record.ID).Update("folder_id", nil).Error; err != nil {
			return err
		}
		if err := tx.Delete(&sdb.CorpusFolder{}, "id = ?", record.ID).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "corpus_folder.deleted", "corpus_folder", record.ID, map[string]string{"name": record.Name})
	})
}

func toCorpusFolder(r sdb.CorpusFolder) CorpusFolder {
	return CorpusFolder{
		ID: r.ID, OrganizationID: r.OrganizationID, CreatedByUserID: r.CreatedByUserID,
		Name: r.Name, Description: r.Description, Icon: r.Icon,
		CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}
