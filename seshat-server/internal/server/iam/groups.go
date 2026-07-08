package iam

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

type CreateGroupParams struct {
	OrganizationID string   `json:"organization_id"`
	Name           string   `json:"name"`
	Slug           string   `json:"slug"`
	Description    string   `json:"description"`
	MemberUserIDs  []string `json:"member_user_ids"`
}

type UpdateGroupParams struct {
	Name          string   `json:"name"`
	Slug          string   `json:"slug"`
	Description   string   `json:"description"`
	MemberUserIDs []string `json:"member_user_ids"`
}

var groupSortFields = map[string]sdb.SortField{
	"name":       {Column: "name"},
	"slug":       {Column: "slug"},
	"created_at": {Column: "created_at"},
	"updated_at": {Column: "updated_at"},
}

// groupSearchColumns covers the group's own fields. Member user IDs are no
// longer searchable here now that membership lives in a separate join
// table (see GroupMember) rather than a column on Group itself — a
// deliberate, small trade-off in exchange for permission checks no longer
// having to load and scan every group in the organization.
var groupSearchColumns = []string{"id", "organization_id", "name", "slug", "description"}

// ListGroups returns a page of groups, with search/sort/pagination applied
// in SQL. Member IDs are only looked up for the groups on the returned page,
// not for every group in the organization.
func (s *Service) ListGroups(ctx context.Context, principal *Principal, organizationID string, params sdb.ListParams) ([]Group, int64, error) {
	if principal == nil {
		return nil, 0, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	tx := s.db.Gorm().WithContext(ctx)

	query, allowed, err := restrictQueryToPrincipalOrganizations(tx.Model(&sdb.Group{}), principal, organizationID, "groups.read", "groups.manage", "members.manage", "organization.manage")
	if err != nil {
		return nil, 0, err
	}
	if !allowed {
		return []Group{}, 0, nil
	}
	sortField, err := sdb.ResolveSortField(groupSortFields, params.Sort)
	if err != nil {
		return nil, 0, ErrInvalidInput(err.Error())
	}
	query = sdb.ApplySearch(query, params.Search, groupSearchColumns...)
	query = sdb.ApplySort(query, sortField, params.Order)

	records, total, err := sdb.Page[sdb.Group](query, params.Limit, params.Offset)
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

func (s *Service) GetGroup(ctx context.Context, principal *Principal, groupID string) (*Group, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	groupID = strings.TrimSpace(groupID)
	if groupID == "" {
		return nil, ErrInvalidInput("group_id is required")
	}

	tx := s.db.Gorm().WithContext(ctx)
	var record sdb.Group
	if err := tx.First(&record, "id = ?", groupID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("group not found")
		}
		return nil, err
	}
	if !principal.User.IsAdmin {
		ok, err := hasAnyOrganizationPermission(tx, principal, record.OrganizationID, "groups.read", "groups.manage", "members.manage", "organization.manage")
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, ErrForbidden("group access denied")
		}
	}
	memberUserIDs, err := groupMemberUserIDs(tx, record.ID)
	if err != nil {
		return nil, err
	}
	group := toGroup(record, memberUserIDs)
	return &group, nil
}

func (s *Service) CreateGroup(ctx context.Context, principal *Principal, params CreateGroupParams) (*Group, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	name := strings.TrimSpace(params.Name)
	slug := normalizeSlug(params.Slug)
	description := strings.TrimSpace(params.Description)
	memberUserIDs := normalizeUniqueIDs(params.MemberUserIDs)
	if organizationID == "" || name == "" || slug == "" {
		return nil, ErrInvalidInput("organization_id, name and slug are required")
	}

	var group *Group
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := requireOrganizationPermission(tx, principal, organizationID, "groups.manage", "members.manage", "organization.manage"); err != nil {
			return err
		}
		var conflicting int64
		if err := tx.Model(&sdb.Group{}).Where("organization_id = ? AND slug = ?", organizationID, slug).Count(&conflicting).Error; err != nil {
			return err
		}
		if conflicting > 0 {
			return ErrConflict("group slug already exists in organization")
		}
		if err := validateGroupMembers(tx, organizationID, memberUserIDs); err != nil {
			return err
		}

		now := time.Now().UTC()
		groupIDValue, err := newID("grp")
		if err != nil {
			return err
		}
		record := sdb.Group{
			ID:             groupIDValue,
			OrganizationID: organizationID,
			Name:           name,
			Slug:           slug,
			Description:    description,
			CreatedAt:      now,
			UpdatedAt:      now,
		}
		if err := tx.Create(&record).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("group slug already exists in organization")
			}
			return err
		}
		if err := replaceGroupMembers(tx, organizationID, record.ID, memberUserIDs); err != nil {
			return err
		}
		if err := appendAuditEvent(tx, principal, organizationID, "group.created", "group", record.ID, map[string]string{"slug": record.Slug}); err != nil {
			return err
		}
		converted := toGroup(record, memberUserIDs)
		group = &converted
		return nil
	})
	return group, err
}

func (s *Service) UpdateGroup(ctx context.Context, principal *Principal, groupID string, params UpdateGroupParams) (*Group, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	groupID = strings.TrimSpace(groupID)
	name := strings.TrimSpace(params.Name)
	slug := normalizeSlug(params.Slug)
	description := strings.TrimSpace(params.Description)
	memberUserIDs := normalizeUniqueIDs(params.MemberUserIDs)
	if groupID == "" || name == "" || slug == "" {
		return nil, ErrInvalidInput("group_id, name and slug are required")
	}

	var group *Group
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Group
		if err := tx.First(&record, "id = ?", groupID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("group not found")
			}
			return err
		}
		if err := requireOrganizationPermission(tx, principal, record.OrganizationID, "groups.manage", "members.manage", "organization.manage"); err != nil {
			return err
		}
		var conflicting int64
		if err := tx.Model(&sdb.Group{}).Where("organization_id = ? AND slug = ? AND id <> ?", record.OrganizationID, slug, record.ID).Count(&conflicting).Error; err != nil {
			return err
		}
		if conflicting > 0 {
			return ErrConflict("group slug already exists in organization")
		}
		if err := validateGroupMembers(tx, record.OrganizationID, memberUserIDs); err != nil {
			return err
		}

		record.Name = name
		record.Slug = slug
		record.Description = description
		record.UpdatedAt = time.Now().UTC()
		if err := tx.Save(&record).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("group slug already exists in organization")
			}
			return err
		}
		if err := replaceGroupMembers(tx, record.OrganizationID, record.ID, memberUserIDs); err != nil {
			return err
		}
		if err := appendAuditEvent(tx, principal, record.OrganizationID, "group.updated", "group", record.ID, map[string]string{"slug": record.Slug}); err != nil {
			return err
		}
		converted := toGroup(record, memberUserIDs)
		group = &converted
		return nil
	})
	return group, err
}

func (s *Service) DeleteGroup(ctx context.Context, principal *Principal, groupID string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	groupID = strings.TrimSpace(groupID)
	if groupID == "" {
		return ErrInvalidInput("group_id is required")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Group
		if err := tx.First(&record, "id = ?", groupID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("group not found")
			}
			return err
		}
		if err := requireOrganizationPermission(tx, principal, record.OrganizationID, "groups.manage", "members.manage", "organization.manage"); err != nil {
			return err
		}
		if err := tx.Delete(&sdb.Group{}, "id = ?", record.ID).Error; err != nil {
			return err
		}
		if err := tx.Where("group_id = ?", record.ID).Delete(&sdb.GroupMember{}).Error; err != nil {
			return err
		}
		if err := tx.Where("organization_id = ? AND subject_type = ? AND subject_id = ?", record.OrganizationID, policySubjectGroup, record.ID).Delete(&sdb.PolicyBinding{}).Error; err != nil {
			return err
		}
		return appendAuditEvent(tx, principal, record.OrganizationID, "group.deleted", "group", record.ID, map[string]string{"slug": record.Slug})
	})
}

// groupMemberUserIDs returns the member user IDs for one group, sorted for
// stable output.
func groupMemberUserIDs(tx *gorm.DB, groupID string) ([]string, error) {
	membersByGroup, err := membersForGroups(tx, []string{groupID})
	if err != nil {
		return nil, err
	}
	return membersByGroup[groupID], nil
}

// membersForGroups loads every membership row for the given groups in one
// indexed query and returns them grouped by group ID, instead of loading
// each group's members one at a time.
func membersForGroups(tx *gorm.DB, groupIDs []string) (map[string][]string, error) {
	result := make(map[string][]string, len(groupIDs))
	if len(groupIDs) == 0 {
		return result, nil
	}
	var members []sdb.GroupMember
	if err := tx.Where("group_id IN ?", groupIDs).Order("user_id asc").Find(&members).Error; err != nil {
		return nil, err
	}
	for _, member := range members {
		result[member.GroupID] = append(result[member.GroupID], member.UserID)
	}
	return result, nil
}

// replaceGroupMembers atomically swaps a group's membership rows for the
// given set, inside the caller's transaction. Membership is always resolved
// from these rows, never from a field on Group itself.
func replaceGroupMembers(tx *gorm.DB, organizationID, groupID string, memberUserIDs []string) error {
	if err := tx.Where("group_id = ?", groupID).Delete(&sdb.GroupMember{}).Error; err != nil {
		return err
	}
	if len(memberUserIDs) == 0 {
		return nil
	}
	now := time.Now().UTC()
	records := make([]sdb.GroupMember, 0, len(memberUserIDs))
	for _, userID := range memberUserIDs {
		memberID, err := newID("gml")
		if err != nil {
			return err
		}
		records = append(records, sdb.GroupMember{
			ID:             memberID,
			OrganizationID: organizationID,
			GroupID:        groupID,
			UserID:         userID,
			CreatedAt:      now,
		})
	}
	return tx.Create(&records).Error
}

func validateGroupMembers(tx *gorm.DB, organizationID string, memberUserIDs []string) error {
	for _, userID := range memberUserIDs {
		var userCount int64
		if err := tx.Model(&sdb.User{}).Where("id = ?", userID).Count(&userCount).Error; err != nil {
			return err
		}
		if userCount == 0 {
			return ErrNotFound("user not found")
		}
		_, exists, err := findMembershipByUserAndOrganization(tx, userID, organizationID)
		if err != nil {
			return err
		}
		if !exists {
			return ErrInvalidInput("group member must belong to the same organization")
		}
	}
	return nil
}

func normalizeUniqueIDs(values []string) []string {
	seen := map[string]struct{}{}
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		normalized = append(normalized, value)
	}
	sort.Strings(normalized)
	return normalized
}
