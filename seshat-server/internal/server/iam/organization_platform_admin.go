package iam

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// SetOrganizationDefault flags (or unflags) the organization whose own
// ProviderSetting/EmbedderSetting rows act as the platform-wide fallback for
// every other organization with no config of its own. Superadmin-only —
// there is no organization to check a permission against, this is a
// platform-wide toggle. At most one organization holds the flag at a time:
// setting a new default clears whichever organization currently has it, in
// the same transaction.
func (s *Service) SetOrganizationDefault(ctx context.Context, principal *Principal, organizationID string, isDefault bool) (*Organization, error) {
	if err := requireAdmin(principal); err != nil {
		return nil, err
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
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

		if isDefault {
			if err := tx.Model(&sdb.Organization{}).
				Where("is_default = ? AND id <> ?", true, organizationID).
				Update("is_default", false).Error; err != nil {
				return err
			}
		}

		record.IsDefault = isDefault
		record.UpdatedAt = time.Now().UTC()
		if err := tx.Save(&record).Error; err != nil {
			return err
		}

		action := "organization.default_unset"
		if isDefault {
			action = "organization.default_set"
		}
		if err := appendAuditEvent(tx, principal, record.ID, action, "organization", record.ID, map[string]string{
			"is_default": boolString(isDefault),
		}); err != nil {
			return err
		}

		converted := toOrganization(record)
		organization = &converted
		return nil
	})
	return organization, err
}

// SetOrganizationActive flags an organization active/inactive. This is
// administrative/visual only for now - no request path checks it, it
// exists so a platform admin can mark a retired organization without
// deleting it.
func (s *Service) SetOrganizationActive(ctx context.Context, principal *Principal, organizationID string, isActive bool) (*Organization, error) {
	if err := requireAdmin(principal); err != nil {
		return nil, err
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
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

		record.IsActive = isActive
		record.UpdatedAt = time.Now().UTC()
		if err := tx.Save(&record).Error; err != nil {
			return err
		}

		action := "organization.deactivated"
		if isActive {
			action = "organization.activated"
		}
		if err := appendAuditEvent(tx, principal, record.ID, action, "organization", record.ID, nil); err != nil {
			return err
		}

		converted := toOrganization(record)
		organization = &converted
		return nil
	})
	return organization, err
}

// DefaultOrganizationID returns the id of the organization currently
// flagged IsDefault, for sibling packages (automation, knowledge) resolving
// platform-wide default provider/embedder credentials. Same tx-handle
// requirement as CheckOrganizationPermission/CanAccessOrganization (see
// their doc comments).
func (s *Service) DefaultOrganizationID(tx *gorm.DB) (string, bool, error) {
	var org sdb.Organization
	if err := tx.Where("is_default = ?", true).First(&org).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", false, nil
		}
		return "", false, err
	}
	return org.ID, true, nil
}
