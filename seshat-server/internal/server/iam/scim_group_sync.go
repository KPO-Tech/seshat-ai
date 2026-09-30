package iam

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// This file is the iam-side counterpart to package scim's SCIM 2.0 /Groups
// protocol handlers, "auto-create-teams" mode (Étape 5 of the staged plan
// in docs/helps/audit-2026-08-29-openwork-den-comparison.md). Same trust
// relationship as scim_provisioning.go: the caller has already been
// authorized by ResolveConnectionByToken, so none of these take a
// *Principal or run a permission check. "Metadata only" mode (SyncGroups
// true, AutoCreateTeams false) never calls any of these - it only writes
// to ScimSyncEvent, see the scim package.
//
// Unlike Membership (never deleted, only ever blocked - see
// scim_provisioning.go), a SCIM-driven group deletion really deletes the
// row, matching DeleteGroup's existing admin-facing behavior: there is no
// "reactivate this team later by the same externalId" requirement the way
// there is for a person's access, so the extra complexity of a soft-delete
// state has no corresponding need here.

// SyncScimGroupCreateParams describes one SCIM-pushed group to create.
type SyncScimGroupCreateParams struct {
	OrganizationID string
	DisplayName    string
	// ExternalID is the IdP's own id for this group (SCIM "externalId") -
	// stored but never interpreted. Empty is valid.
	ExternalID string
	// MemberUserIDs must already be members of OrganizationID - see
	// validateGroupMembers. A SCIM group can only ever reference users
	// already provisioned via /Users (or any other path), never invent one.
	MemberUserIDs []string
}

// SyncScimGroupCreate creates a real Group + GroupMember rows for
// organizationID - the "auto-create-teams" path. Returns ErrInvalidInput
// (not a 500) if any member isn't already an organization member, and
// ErrConflict if the derived slug or the external id collides with an
// existing group.
func (s *Service) SyncScimGroupCreate(ctx context.Context, params SyncScimGroupCreateParams) (*Group, error) {
	organizationID := strings.TrimSpace(params.OrganizationID)
	displayName := strings.TrimSpace(params.DisplayName)
	if organizationID == "" || displayName == "" {
		return nil, ErrInvalidInput("organization_id and display_name are required")
	}
	slug := normalizeSlug(displayName)
	if slug == "" {
		return nil, ErrInvalidInput("display_name must contain at least one letter or digit")
	}
	externalID := strings.TrimSpace(params.ExternalID)
	memberUserIDs := normalizeUniqueIDs(params.MemberUserIDs)

	var group *Group
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var conflicting int64
		if err := tx.Model(&sdb.Group{}).Where("organization_id = ? AND slug = ?", organizationID, slug).Count(&conflicting).Error; err != nil {
			return err
		}
		if conflicting > 0 {
			return ErrConflict("a group with this name already exists in the organization")
		}
		if err := validateGroupMembers(tx, organizationID, memberUserIDs); err != nil {
			return err
		}

		now := time.Now().UTC()
		groupID, err := newID("grp")
		if err != nil {
			return err
		}
		record := sdb.Group{
			ID: groupID, OrganizationID: organizationID, Name: displayName, Slug: slug,
			CreatedAt: now, UpdatedAt: now,
		}
		if externalID != "" {
			record.ScimExternalID = &externalID
		}
		if err := tx.Create(&record).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("a group with this name or external id already exists in the organization")
			}
			return err
		}
		if err := replaceGroupMembers(tx, organizationID, record.ID, memberUserIDs); err != nil {
			return err
		}
		if err := appendAuditEvent(tx, nil, organizationID, "group.created_via_scim", "group", record.ID, map[string]string{"slug": record.Slug}); err != nil {
			return err
		}
		converted := toGroup(record, memberUserIDs)
		group = &converted
		return nil
	})
	if err != nil {
		return nil, err
	}
	return group, nil
}

// GetScimGroupByID loads organizationID's group identified by groupID -
// ErrNotFound covers both "no such group" and "belongs to a different
// organization," same non-distinguishing stance as GetScimMemberByUserID.
func (s *Service) GetScimGroupByID(ctx context.Context, organizationID, groupID string) (*Group, error) {
	organizationID = strings.TrimSpace(organizationID)
	groupID = strings.TrimSpace(groupID)
	if organizationID == "" || groupID == "" {
		return nil, ErrInvalidInput("organization_id and group_id are required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	var record sdb.Group
	if err := tx.Where("id = ? AND organization_id = ?", groupID, organizationID).First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("no such group")
		}
		return nil, err
	}
	memberUserIDs, err := groupMemberUserIDs(tx, record.ID)
	if err != nil {
		return nil, err
	}
	group := toGroup(record, memberUserIDs)
	return &group, nil
}

// UpdateScimGroupParams is a full-replace of what SCIM can change about a
// group - PUT sends both every time; PATCH (see the scim package) reads the
// current state, applies add/remove/replace to a copy, then calls this with
// the merged result, the same read-diff-replace shape UpdateScimMember uses
// for users.
type UpdateScimGroupParams struct {
	DisplayName   string
	MemberUserIDs []string
}

// UpdateScimGroup replaces organizationID's group identified by groupID's
// name and full membership list. Returns ErrInvalidInput if any member
// isn't already an organization member.
func (s *Service) UpdateScimGroup(ctx context.Context, organizationID, groupID string, params UpdateScimGroupParams) (*Group, error) {
	organizationID = strings.TrimSpace(organizationID)
	groupID = strings.TrimSpace(groupID)
	displayName := strings.TrimSpace(params.DisplayName)
	if organizationID == "" || groupID == "" || displayName == "" {
		return nil, ErrInvalidInput("organization_id, group_id and display_name are required")
	}
	slug := normalizeSlug(displayName)
	memberUserIDs := normalizeUniqueIDs(params.MemberUserIDs)

	var group *Group
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Group
		if err := tx.Where("id = ? AND organization_id = ?", groupID, organizationID).First(&record).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("no such group")
			}
			return err
		}
		if slug != record.Slug {
			var conflicting int64
			if err := tx.Model(&sdb.Group{}).Where("organization_id = ? AND slug = ? AND id <> ?", organizationID, slug, record.ID).Count(&conflicting).Error; err != nil {
				return err
			}
			if conflicting > 0 {
				return ErrConflict("a group with this name already exists in the organization")
			}
		}
		if err := validateGroupMembers(tx, organizationID, memberUserIDs); err != nil {
			return err
		}

		record.Name = displayName
		record.Slug = slug
		record.UpdatedAt = time.Now().UTC()
		if err := tx.Save(&record).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("a group with this name already exists in the organization")
			}
			return err
		}
		if err := replaceGroupMembers(tx, organizationID, record.ID, memberUserIDs); err != nil {
			return err
		}
		if err := appendAuditEvent(tx, nil, organizationID, "group.updated_via_scim", "group", record.ID, map[string]string{"slug": record.Slug}); err != nil {
			return err
		}
		converted := toGroup(record, memberUserIDs)
		group = &converted
		return nil
	})
	if err != nil {
		return nil, err
	}
	return group, nil
}

// DeleteScimGroup really deletes organizationID's group identified by
// groupID (cascading GroupMember/PolicyBinding rows, matching DeleteGroup's
// existing admin-facing behavior) - see this file's doc comment for why
// groups, unlike memberships, don't need a soft-delete/reactivate state.
func (s *Service) DeleteScimGroup(ctx context.Context, organizationID, groupID string) error {
	organizationID = strings.TrimSpace(organizationID)
	groupID = strings.TrimSpace(groupID)
	if organizationID == "" || groupID == "" {
		return ErrInvalidInput("organization_id and group_id are required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Group
		if err := tx.Where("id = ? AND organization_id = ?", groupID, organizationID).First(&record).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("no such group")
			}
			return err
		}
		if err := tx.Delete(&sdb.Group{}, "id = ?", record.ID).Error; err != nil {
			return err
		}
		if err := tx.Where("group_id = ?", record.ID).Delete(&sdb.GroupMember{}).Error; err != nil {
			return err
		}
		if err := tx.Where("organization_id = ? AND subject_type = ? AND subject_id = ?", organizationID, policySubjectGroup, record.ID).Delete(&sdb.PolicyBinding{}).Error; err != nil {
			return err
		}
		return appendAuditEvent(tx, nil, organizationID, "group.deleted_via_scim", "group", record.ID, map[string]string{"slug": record.Slug})
	})
}

// ListScimGroups pages through organizationID's groups for SCIM's
// unfiltered GET /Groups - offset/limit already 0-indexed, same convention
// as ListScimMembers.
func (s *Service) ListScimGroups(ctx context.Context, organizationID string, offset, limit int) ([]Group, int64, error) {
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, 0, ErrInvalidInput("organization_id is required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	query := tx.Model(&sdb.Group{}).Where("organization_id = ?", organizationID).Order("created_at asc")
	records, total, err := sdb.Page[sdb.Group](query, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	groupIDs := make([]string, 0, len(records))
	for _, record := range records {
		groupIDs = append(groupIDs, record.ID)
	}
	membersByGroup, err := membersForGroups(tx, groupIDs)
	if err != nil {
		return nil, 0, err
	}
	groups := make([]Group, 0, len(records))
	for _, record := range records {
		groups = append(groups, toGroup(record, membersByGroup[record.ID]))
	}
	return groups, total, nil
}
