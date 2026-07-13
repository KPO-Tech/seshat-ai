// Package skillregistry is an organization's curated list of recommended
// skill repo URLs — the server-hosted half of the "Skills" hybrid described
// in helps/seshat-architecture-target.md §3: authorship and execution stay
// local (markdown files), this is purely a bookmarked-URL catalog that a
// connected seshat-backend fetches to enrich its own local skill-repo
// catalog. Installing (git clone) always happens on the backend, never here.
package skillregistry

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

type SkillRepo struct {
	ID              string    `json:"id"`
	OrganizationID  string    `json:"organization_id"`
	CreatedByUserID string    `json:"created_by_user_id"`
	Name            string    `json:"name"`
	URL             string    `json:"url"`
	Description     string    `json:"description,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type CreateSkillRepoParams struct {
	OrganizationID string
	Name           string
	URL            string
	Description    string
}

type UpdateSkillRepoParams struct {
	Name        string
	URL         string
	Description string
}

type Service struct {
	db  *sdb.DB
	iam *iam.Service
}

func New(database *sdb.DB, iamService *iam.Service) *Service {
	return &Service{db: database, iam: iamService}
}

// ListSkillRepos requires only org membership, not a specific permission —
// these are public repo URLs, nothing secret to gate. A non-member is
// rejected outright (unlike ProviderSetting's list, which degrades to an
// empty list for a member merely lacking a permission — here, not being a
// member at all is a harder boundary).
func (s *Service) ListSkillRepos(ctx context.Context, principal *iam.Principal, organizationID string) ([]SkillRepo, error) {
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
	var records []sdb.SkillRepo
	if err := tx.Where("organization_id = ?", organizationID).Order("name asc").Find(&records).Error; err != nil {
		return nil, err
	}
	result := make([]SkillRepo, 0, len(records))
	for _, record := range records {
		result = append(result, toSkillRepo(record))
	}
	return result, nil
}

func (s *Service) CreateSkillRepo(ctx context.Context, principal *iam.Principal, params CreateSkillRepoParams) (*SkillRepo, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	name := strings.TrimSpace(params.Name)
	url := strings.TrimSpace(params.URL)
	if organizationID == "" || name == "" || url == "" {
		return nil, iam.ErrInvalidInput("organization_id, name and url are required")
	}

	var record sdb.SkillRepo
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "skills_registry.manage", "organization.manage"); err != nil {
			return err
		}
		var conflicting int64
		if err := tx.Model(&sdb.SkillRepo{}).Where("organization_id = ? AND name = ?", organizationID, name).Count(&conflicting).Error; err != nil {
			return err
		}
		if conflicting > 0 {
			return iam.ErrConflict("a skill repo with this name already exists in this organization")
		}
		id, err := sdb.NewID("skillrepo")
		if err != nil {
			return err
		}
		record = sdb.SkillRepo{
			ID:              id,
			OrganizationID:  organizationID,
			CreatedByUserID: principal.User.ID,
			Name:            name,
			URL:             url,
			Description:     strings.TrimSpace(params.Description),
		}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "skill_repo.created", "skill_repo", record.ID, map[string]string{"name": name})
	})
	if err != nil {
		return nil, err
	}
	result := toSkillRepo(record)
	return &result, nil
}

func (s *Service) UpdateSkillRepo(ctx context.Context, principal *iam.Principal, id string, params UpdateSkillRepoParams) (*SkillRepo, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	var record sdb.SkillRepo
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := tx.First(&record, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return iam.ErrNotFound("skill repo not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "skills_registry.manage", "organization.manage"); err != nil {
			return err
		}
		if name := strings.TrimSpace(params.Name); name != "" {
			record.Name = name
		}
		if url := strings.TrimSpace(params.URL); url != "" {
			record.URL = url
		}
		record.Description = strings.TrimSpace(params.Description)
		if err := tx.Save(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "skill_repo.updated", "skill_repo", record.ID, map[string]string{"name": record.Name})
	})
	if err != nil {
		return nil, err
	}
	result := toSkillRepo(record)
	return &result, nil
}

func (s *Service) DeleteSkillRepo(ctx context.Context, principal *iam.Principal, id string) error {
	if principal == nil {
		return iam.ErrUnauthorized("authentication required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.SkillRepo
		if err := tx.First(&record, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return iam.ErrNotFound("skill repo not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "skills_registry.manage", "organization.manage"); err != nil {
			return err
		}
		if err := tx.Delete(&sdb.SkillRepo{}, "id = ?", id).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "skill_repo.deleted", "skill_repo", record.ID, map[string]string{"name": record.Name})
	})
}

func toSkillRepo(r sdb.SkillRepo) SkillRepo {
	return SkillRepo{
		ID: r.ID, OrganizationID: r.OrganizationID, CreatedByUserID: r.CreatedByUserID,
		Name: r.Name, URL: r.URL, Description: r.Description,
		CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}
