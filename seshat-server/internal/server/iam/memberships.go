package iam

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// CreateMembershipParams attaches an existing user to an organization.
type CreateMembershipParams struct {
	OrganizationID string `json:"organization_id"`
	UserID         string `json:"user_id"`
	Role           string `json:"role"`
}

// UpdateMembershipParams updates the mutable parts of a membership.
type UpdateMembershipParams struct {
	Role string `json:"role"`
}

// GetMembership loads one membership with tenant-aware access control.
func (s *Service) GetMembership(ctx context.Context, principal *Principal, membershipID string) (*Membership, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	membershipID = strings.TrimSpace(membershipID)
	if membershipID == "" {
		return nil, ErrInvalidInput("membership_id is required")
	}

	tx := s.db.Gorm().WithContext(ctx)
	var record sdb.Membership
	if err := tx.First(&record, "id = ?", membershipID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("membership not found")
		}
		return nil, err
	}
	manages, err := canManageOrganization(tx, principal, record.OrganizationID)
	if err != nil {
		return nil, err
	}
	if principal.User.IsAdmin || manages || principal.User.ID == record.UserID {
		memberships := []Membership{toMembership(record)}
		enrichMembershipsWithUsers(tx, memberships)
		return &memberships[0], nil
	}
	return nil, ErrForbidden("membership access denied")
}

// enrichMembershipsWithUsers batch-loads the referenced users and populates
// UserEmail/UserDisplayName in place. Only enriches rows the caller was
// already authorized to see - no new access decision, just field fill-in.
func enrichMembershipsWithUsers(tx *gorm.DB, memberships []Membership) {
	if len(memberships) == 0 {
		return
	}
	userIDs := make([]string, 0, len(memberships))
	seen := make(map[string]bool, len(memberships))
	for _, m := range memberships {
		if !seen[m.UserID] {
			seen[m.UserID] = true
			userIDs = append(userIDs, m.UserID)
		}
	}
	var users []sdb.User
	if err := tx.Where("id IN ?", userIDs).Find(&users).Error; err != nil {
		return
	}
	byID := make(map[string]sdb.User, len(users))
	for _, u := range users {
		byID[u.ID] = u
	}
	for i := range memberships {
		if u, ok := byID[memberships[i].UserID]; ok {
			memberships[i].UserEmail = u.Email
			memberships[i].UserDisplayName = u.DisplayName
			memberships[i].UserIsAdmin = u.IsAdmin
		}
	}
}

var membershipSortFields = map[string]sdb.SortField{
	"created_at":      {Column: "created_at"},
	"role":            {Column: "role"},
	"user_id":         {Column: "user_id"},
	"organization_id": {Column: "organization_id"},
}

var membershipSearchColumns = []string{"id", "user_id", "organization_id", "role"}

// ListMemberships returns a page of memberships according to the caller
// scope. Organization managers can inspect their tenant, while regular users
// only see themselves. Search/sort/pagination are applied in SQL.
func (s *Service) ListMemberships(ctx context.Context, principal *Principal, organizationID, userID string, params sdb.ListParams) ([]Membership, int64, error) {
	if principal == nil {
		return nil, 0, ErrUnauthorized("authentication required")
	}

	organizationID = strings.TrimSpace(organizationID)
	userID = strings.TrimSpace(userID)
	tx := s.db.Gorm().WithContext(ctx)

	query := tx.Model(&sdb.Membership{})
	switch {
	case principal.User.IsAdmin:
		if organizationID != "" {
			query = query.Where("organization_id = ?", organizationID)
		}
		if userID != "" {
			query = query.Where("user_id = ?", userID)
		}
	case organizationID != "":
		allowed, err := canAccessOrganization(tx, principal, organizationID)
		if err != nil {
			return nil, 0, err
		}
		if !allowed {
			return nil, 0, ErrForbidden("organization access required")
		}
		manages, err := canManageOrganization(tx, principal, organizationID)
		if err != nil {
			return nil, 0, err
		}
		query = query.Where("organization_id = ?", organizationID)
		if !manages {
			query = query.Where("user_id = ?", principal.User.ID)
		}
		if userID != "" {
			query = query.Where("user_id = ?", userID)
		}
	default:
		if userID != "" && userID != principal.User.ID {
			return nil, 0, ErrForbidden("membership access denied")
		}
		query = query.Where("user_id = ?", principal.User.ID)
	}

	sortField, err := sdb.ResolveSortField(membershipSortFields, params.Sort)
	if err != nil {
		return nil, 0, ErrInvalidInput(err.Error())
	}
	query = sdb.ApplySearch(query, params.Search, membershipSearchColumns...)
	query = sdb.ApplySort(query, sortField, params.Order)

	records, total, err := sdb.Page[sdb.Membership](query, params.Limit, params.Offset)
	if err != nil {
		return nil, 0, err
	}
	memberships := make([]Membership, 0, len(records))
	for _, record := range records {
		memberships = append(memberships, toMembership(record))
	}
	enrichMembershipsWithUsers(tx, memberships)
	return memberships, total, nil
}

// CreateMembership adds an existing user into one organization.
func (s *Service) CreateMembership(ctx context.Context, principal *Principal, params CreateMembershipParams) (*Membership, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	userID := strings.TrimSpace(params.UserID)
	if organizationID == "" || userID == "" {
		return nil, ErrInvalidInput("organization_id and user_id are required")
	}

	var membership *Membership
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var orgCount int64
		if err := tx.Model(&sdb.Organization{}).Where("id = ?", organizationID).Count(&orgCount).Error; err != nil {
			return err
		}
		if orgCount == 0 {
			return ErrNotFound("organization not found")
		}
		var userCount int64
		if err := tx.Model(&sdb.User{}).Where("id = ?", userID).Count(&userCount).Error; err != nil {
			return err
		}
		if userCount == 0 {
			return ErrNotFound("user not found")
		}
		if err := requireOrganizationPermission(tx, principal, organizationID, "members.manage", "organization.manage"); err != nil {
			return err
		}
		role, err := validateRoleCodeForOrganization(tx, organizationID, params.Role)
		if err != nil {
			return err
		}
		_, exists, err := findMembershipByUserAndOrganization(tx, userID, organizationID)
		if err != nil {
			return err
		}
		if exists {
			return ErrConflict("membership already exists")
		}

		now := time.Now().UTC()
		membershipIDValue, err := newID("mem")
		if err != nil {
			return err
		}
		record := sdb.Membership{
			ID:             membershipIDValue,
			UserID:         userID,
			OrganizationID: organizationID,
			Role:           role,
			CreatedAt:      now,
		}
		if err := tx.Create(&record).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("membership already exists")
			}
			return err
		}
		if err := appendAuditEvent(tx, principal, record.OrganizationID, "membership.created", "membership", record.ID, map[string]string{"role": record.Role, "user_id": record.UserID}); err != nil {
			return err
		}
		converted := toMembership(record)
		membership = &converted
		return nil
	})
	return membership, err
}

// UpdateMembership changes the assigned role while preserving membership identity.
func (s *Service) UpdateMembership(ctx context.Context, principal *Principal, membershipID string, params UpdateMembershipParams) (*Membership, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	membershipID = strings.TrimSpace(membershipID)
	if membershipID == "" {
		return nil, ErrInvalidInput("membership_id is required")
	}

	var membership *Membership
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Membership
		if err := tx.First(&record, "id = ?", membershipID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("membership not found")
			}
			return err
		}
		if err := requireOrganizationPermission(tx, principal, record.OrganizationID, "members.manage", "organization.manage"); err != nil {
			return err
		}
		role, err := validateRoleCodeForOrganization(tx, record.OrganizationID, params.Role)
		if err != nil {
			return err
		}
		if isOwnerRole(record.Role) && !isOwnerRole(role) {
			hasAnother, err := hasAnotherOrganizationOwner(tx, record.OrganizationID, record.ID)
			if err != nil {
				return err
			}
			if !hasAnother {
				return ErrConflict("cannot demote the last owner of an organization")
			}
		}
		record.Role = role
		if err := tx.Save(&record).Error; err != nil {
			return err
		}
		if err := appendAuditEvent(tx, principal, record.OrganizationID, "membership.updated", "membership", record.ID, map[string]string{"role": record.Role, "user_id": record.UserID}); err != nil {
			return err
		}
		converted := toMembership(record)
		membership = &converted
		return nil
	})
	return membership, err
}

// DeleteMembership removes one membership. Organization managers may remove
// any member, and a user may always remove their own membership to leave an
// organization. The last owner membership can never be removed, since only
// an owner can delete the organization itself (see organization.delete).
func (s *Service) DeleteMembership(ctx context.Context, principal *Principal, membershipID string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	membershipID = strings.TrimSpace(membershipID)
	if membershipID == "" {
		return ErrInvalidInput("membership_id is required")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Membership
		if err := tx.First(&record, "id = ?", membershipID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("membership not found")
			}
			return err
		}
		if principal.User.ID != record.UserID {
			if err := requireOrganizationPermission(tx, principal, record.OrganizationID, "members.manage", "organization.manage"); err != nil {
				return err
			}
		}
		if isOwnerRole(record.Role) {
			hasAnother, err := hasAnotherOrganizationOwner(tx, record.OrganizationID, record.ID)
			if err != nil {
				return err
			}
			if !hasAnother {
				return ErrConflict("cannot remove the last owner of an organization")
			}
		}

		if err := removeUserAuthorizationReferences(tx, record.OrganizationID, record.UserID); err != nil {
			return err
		}
		if err := tx.Delete(&sdb.Membership{}, "id = ?", record.ID).Error; err != nil {
			return err
		}
		return appendAuditEvent(tx, principal, record.OrganizationID, "membership.deleted", "membership", record.ID, map[string]string{"role": record.Role, "user_id": record.UserID})
	})
}

func isOwnerRole(role string) bool {
	return normalizeRole(role) == "owner"
}

func removeUserAuthorizationReferences(tx *gorm.DB, organizationID, userID string) error {
	if err := tx.Where("organization_id = ? AND user_id = ?", organizationID, userID).Delete(&sdb.GroupMember{}).Error; err != nil {
		return err
	}
	return tx.Where("organization_id = ? AND subject_type = ? AND subject_id = ?", organizationID, policySubjectUser, userID).Delete(&sdb.PolicyBinding{}).Error
}

func removeUserAuthorizationReferencesEverywhere(tx *gorm.DB, userID string) error {
	if err := tx.Where("user_id = ?", userID).Delete(&sdb.GroupMember{}).Error; err != nil {
		return err
	}
	return tx.Where("subject_type = ? AND subject_id = ?", policySubjectUser, userID).Delete(&sdb.PolicyBinding{}).Error
}

func hasAnotherOrganizationOwner(tx *gorm.DB, organizationID, excludedMembershipID string) (bool, error) {
	var count int64
	err := tx.Model(&sdb.Membership{}).
		Where("organization_id = ? AND role = ? AND id <> ?", organizationID, "owner", excludedMembershipID).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func findMembershipByUserAndOrganization(tx *gorm.DB, userID, organizationID string) (sdb.Membership, bool, error) {
	var membership sdb.Membership
	err := tx.Where("user_id = ? AND organization_id = ?", userID, organizationID).First(&membership).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return sdb.Membership{}, false, nil
		}
		return sdb.Membership{}, false, err
	}
	return membership, true, nil
}

func canManageOrganization(tx *gorm.DB, principal *Principal, organizationID string) (bool, error) {
	return hasAnyOrganizationPermission(tx, principal, organizationID, "organization.manage", "members.manage")
}
