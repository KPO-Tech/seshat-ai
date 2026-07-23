package iam

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// UpdateOrganizationParams captures mutable organization settings.
// Slug is allowed to change here because it is part of the admin control plane.
type UpdateOrganizationParams struct {
	Name         string `json:"name"`
	Slug         string `json:"slug"`
	Description  string `json:"description"`
	WebsiteURL   string `json:"website_url"`
	SupportEmail string `json:"support_email"`
	Domain       string `json:"domain"`
}

// GetOrganization returns one organization if the caller belongs to it or is a platform admin.
func (s *Service) GetOrganization(ctx context.Context, principal *Principal, organizationID string) (*Organization, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}

	tx := s.db.Gorm().WithContext(ctx)
	var record sdb.Organization
	if err := tx.First(&record, "id = ?", organizationID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("organization not found")
		}
		return nil, err
	}
	allowed, err := canAccessOrganization(tx, principal, organizationID)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, ErrForbidden("organization access required")
	}
	organization := toOrganization(record)
	return &organization, nil
}

// UpdateOrganization updates tenant settings under owner/admin control.
func (s *Service) UpdateOrganization(ctx context.Context, principal *Principal, organizationID string, params UpdateOrganizationParams) (*Organization, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	name := strings.TrimSpace(params.Name)
	slug := normalizeSlug(params.Slug)
	description := strings.TrimSpace(params.Description)
	websiteURL := strings.TrimSpace(params.WebsiteURL)
	supportEmail := normalizeEmail(params.SupportEmail)
	domain := normalizeDomain(params.Domain)
	if organizationID == "" || name == "" || slug == "" {
		return nil, ErrInvalidInput("organization_id, name and slug are required")
	}

	var organization *Organization
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Organization
		if err := tx.First(&record, "id = ?", organizationID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("organization not found")
			}
			return err
		}
		if err := requireOrganizationPermission(tx, principal, organizationID, "organization.manage"); err != nil {
			return err
		}
		var conflicting int64
		if err := tx.Model(&sdb.Organization{}).Where("slug = ? AND id <> ?", slug, record.ID).Count(&conflicting).Error; err != nil {
			return err
		}
		if conflicting > 0 {
			return ErrConflict("organization slug already exists")
		}
		if domain != nil {
			var conflictingDomain int64
			if err := tx.Model(&sdb.Organization{}).Where("domain = ? AND id <> ?", *domain, record.ID).Count(&conflictingDomain).Error; err != nil {
				return err
			}
			if conflictingDomain > 0 {
				return ErrConflict("an organization with this email domain already exists")
			}
		}

		record.Name = name
		record.Slug = slug
		record.Description = description
		record.WebsiteURL = websiteURL
		record.SupportEmail = supportEmail
		record.Domain = domain
		record.UpdatedAt = time.Now().UTC()
		if err := tx.Save(&record).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("organization slug or email domain already exists")
			}
			return err
		}
		if err := appendAuditEvent(tx, principal, record.ID, "organization.updated", "organization", record.ID, map[string]string{
			"slug": record.Slug,
		}); err != nil {
			return err
		}

		converted := toOrganization(record)
		organization = &converted
		return nil
	})
	return organization, err
}

// DeleteOrganization removes an organization and every resource scoped to it.
// Audit history is kept, matching the append-only trail already used when a
// user is deleted.
func (s *Service) DeleteOrganization(ctx context.Context, principal *Principal, organizationID string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return ErrInvalidInput("organization_id is required")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Organization
		if err := tx.First(&record, "id = ?", organizationID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("organization not found")
			}
			return err
		}
		if err := requireOrganizationPermission(tx, principal, organizationID, "organization.delete"); err != nil {
			return err
		}

		// Delete dependent tenant-scoped rows before the organization itself.
		// Ordering matters conceptually even though today's schema does not
		// enforce foreign keys everywhere yet.
		for _, model := range []any{
			&sdb.JobRun{},
			&sdb.ScheduledJob{},
			&sdb.Device{},
			&sdb.ProviderSetting{},
			&sdb.PolicyBinding{},
			&sdb.Group{},
			&sdb.Invitation{},
			&sdb.Provider{},
			&sdb.Application{},
			&sdb.Membership{},
		} {
			if err := tx.Where("organization_id = ?", organizationID).Delete(model).Error; err != nil {
				return err
			}
		}

		if err := tx.Delete(&sdb.Organization{}, "id = ?", organizationID).Error; err != nil {
			return err
		}
		return appendAuditEvent(tx, principal, organizationID, "organization.deleted", "organization", organizationID, map[string]string{"slug": record.Slug})
	})
}
