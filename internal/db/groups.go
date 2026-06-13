package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ─── GORM models ──────────────────────────────────────────────────────────────

type gUserGroup struct {
	ID              string `gorm:"primaryKey;size:64"`
	Name            string `gorm:"not null"`
	Description     string `gorm:"not null;default:''"`
	PermissionsJSON string `gorm:"column:permissions_json;not null;default:'{}'"`
	MetadataJSON    string `gorm:"column:metadata_json;not null;default:'{}'"`
	CreatedAtUnix   int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix   int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gUserGroup) TableName() string { return "user_groups" }

type gGroupMember struct {
	GroupID       string `gorm:"primaryKey;size:64;column:group_id"`
	UserID        string `gorm:"primaryKey;size:64;column:user_id"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
}

func (gGroupMember) TableName() string { return "group_members" }

// ─── Public types ─────────────────────────────────────────────────────────────

// WorkspacePerms defines per-workspace feature permissions.
type WorkspacePerms struct {
	Models    bool `json:"models"`
	Knowledge bool `json:"knowledge"`
	Prompts   bool `json:"prompts"`
}

// ChatPerms defines chat-level permissions.
type ChatPerms struct {
	FileUpload bool `json:"file_upload"`
	Delete     bool `json:"delete"`
}

// FeaturePerms defines feature-flag permissions.
type FeaturePerms struct {
	APIKeys   bool `json:"api_keys"`
	WebSearch bool `json:"web_search"`
}

// GroupPermissions captures all granular permissions for a group.
type GroupPermissions struct {
	Workspace WorkspacePerms `json:"workspace"`
	Chat      ChatPerms      `json:"chat"`
	Features  FeaturePerms   `json:"features"`
}

// DefaultGroupPermissions returns the zero-value (no permissions) set.
func DefaultGroupPermissions() GroupPermissions {
	return GroupPermissions{}
}

// UserGroup is the public representation of a user group.
type UserGroup struct {
	ID          string
	Name        string
	Description string
	Permissions GroupPermissions
	Metadata    map[string]any
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// UpdateGroupParams is used to partially update a group.
type UpdateGroupParams struct {
	Name        *string
	Description *string
	Permissions *GroupPermissions
	Metadata    map[string]any
}

// ─── Store ────────────────────────────────────────────────────────────────────

// GroupStore provides persistence for user groups and group memberships.
type GroupStore struct {
	db *DB
}

func NewGroupStore(database *DB) (*GroupStore, error) {
	if database == nil {
		return nil, fmt.Errorf("group store: database is required")
	}
	return &GroupStore{db: database}, nil
}

// CreateGroup creates a new user group.
func (s *GroupStore) CreateGroup(ctx context.Context, name, description string, perms GroupPermissions) (*UserGroup, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("group name is required")
	}
	description = strings.TrimSpace(description)

	permsJSON, err := marshalGroupPermissions(perms)
	if err != nil {
		return nil, fmt.Errorf("marshal permissions: %w", err)
	}

	now := time.Now().UTC()
	row := gUserGroup{
		ID:              newIdentityID("grp"),
		Name:            name,
		Description:     description,
		PermissionsJSON: permsJSON,
		MetadataJSON:    "{}",
		CreatedAtUnix:   now.Unix(),
		UpdatedAtUnix:   now.Unix(),
	}

	if err := s.db.GormDB().WithContext(ctx).Create(&row).Error; err != nil {
		return nil, fmt.Errorf("insert group: %w", err)
	}
	return groupFromRow(row)
}

// GetGroupByID retrieves a group by ID.
func (s *GroupStore) GetGroupByID(ctx context.Context, id string) (*UserGroup, error) {
	var row gUserGroup
	err := s.db.GormDB().WithContext(ctx).Where("id = ?", id).First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("group not found")
		}
		return nil, fmt.Errorf("get group: %w", err)
	}
	return groupFromRow(row)
}

// ListGroups returns all groups ordered by name.
func (s *GroupStore) ListGroups(ctx context.Context) ([]UserGroup, error) {
	var rows []gUserGroup
	if err := s.db.GormDB().WithContext(ctx).Order("name ASC").Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list groups: %w", err)
	}
	groups := make([]UserGroup, 0, len(rows))
	for _, r := range rows {
		g, err := groupFromRow(r)
		if err != nil {
			return nil, err
		}
		groups = append(groups, *g)
	}
	return groups, nil
}

// UpdateGroup partially updates a group.
func (s *GroupStore) UpdateGroup(ctx context.Context, id string, params UpdateGroupParams) (*UserGroup, error) {
	var row gUserGroup
	if err := s.db.GormDB().WithContext(ctx).Where("id = ?", id).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("group not found")
		}
		return nil, fmt.Errorf("get group for update: %w", err)
	}

	updates := map[string]any{
		"updated_at_unix": time.Now().UTC().Unix(),
	}
	if params.Name != nil {
		updates["name"] = strings.TrimSpace(*params.Name)
	}
	if params.Description != nil {
		updates["description"] = strings.TrimSpace(*params.Description)
	}
	if params.Permissions != nil {
		permsJSON, err := marshalGroupPermissions(*params.Permissions)
		if err != nil {
			return nil, fmt.Errorf("marshal permissions: %w", err)
		}
		updates["permissions_json"] = permsJSON
	}
	if params.Metadata != nil {
		metadataJSON, err := marshalJSONMap(params.Metadata)
		if err != nil {
			return nil, fmt.Errorf("marshal metadata: %w", err)
		}
		updates["metadata_json"] = metadataJSON
	}

	if err := s.db.GormDB().WithContext(ctx).
		Model(&gUserGroup{}).Where("id = ?", id).
		Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("update group: %w", err)
	}
	return s.GetGroupByID(ctx, id)
}

// DeleteGroup removes a group and all its memberships.
func (s *GroupStore) DeleteGroup(ctx context.Context, id string) error {
	return s.db.GormDB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("group_id = ?", id).Delete(&gGroupMember{}).Error; err != nil {
			return fmt.Errorf("delete group members: %w", err)
		}
		if err := tx.Where("id = ?", id).Delete(&gUserGroup{}).Error; err != nil {
			return fmt.Errorf("delete group: %w", err)
		}
		return nil
	})
}

// AddGroupMember adds a user to a group (idempotent).
func (s *GroupStore) AddGroupMember(ctx context.Context, groupID, userID string) error {
	row := gGroupMember{
		GroupID:       groupID,
		UserID:        userID,
		CreatedAtUnix: time.Now().UTC().Unix(),
	}
	if err := s.db.GormDB().WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&row).Error; err != nil {
		return fmt.Errorf("add group member: %w", err)
	}
	return nil
}

// RemoveGroupMember removes a user from a group.
func (s *GroupStore) RemoveGroupMember(ctx context.Context, groupID, userID string) error {
	result := s.db.GormDB().WithContext(ctx).
		Where("group_id = ? AND user_id = ?", groupID, userID).
		Delete(&gGroupMember{})
	if result.Error != nil {
		return fmt.Errorf("remove group member: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("membership not found")
	}
	return nil
}

// ListGroupMembers returns user IDs for all members of a group.
func (s *GroupStore) ListGroupMembers(ctx context.Context, groupID string) ([]string, error) {
	var rows []gGroupMember
	if err := s.db.GormDB().WithContext(ctx).
		Where("group_id = ?", groupID).
		Order("created_at_unix ASC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list group members: %w", err)
	}
	ids := make([]string, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.UserID)
	}
	return ids, nil
}

// ListGroupsForUser returns all groups a user belongs to.
func (s *GroupStore) ListGroupsForUser(ctx context.Context, userID string) ([]UserGroup, error) {
	var rows []gUserGroup
	if err := s.db.GormDB().WithContext(ctx).
		Joins("INNER JOIN group_members gm ON gm.group_id = user_groups.id").
		Where("gm.user_id = ?", userID).
		Order("user_groups.name ASC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list groups for user: %w", err)
	}
	groups := make([]UserGroup, 0, len(rows))
	for _, r := range rows {
		g, err := groupFromRow(r)
		if err != nil {
			return nil, err
		}
		groups = append(groups, *g)
	}
	return groups, nil
}

// GetEffectivePermissions computes the union (OR) of all group permissions for a user.
// If the user has no groups, the defaultPerms are returned.
func (s *GroupStore) GetEffectivePermissions(ctx context.Context, userID string, defaultPerms GroupPermissions) (GroupPermissions, error) {
	groups, err := s.ListGroupsForUser(ctx, userID)
	if err != nil {
		return defaultPerms, fmt.Errorf("get effective permissions: %w", err)
	}
	if len(groups) == 0 {
		return defaultPerms, nil
	}

	result := defaultPerms
	for _, g := range groups {
		p := g.Permissions
		// OR logic — most permissive wins
		if p.Workspace.Models {
			result.Workspace.Models = true
		}
		if p.Workspace.Knowledge {
			result.Workspace.Knowledge = true
		}
		if p.Workspace.Prompts {
			result.Workspace.Prompts = true
		}
		if p.Chat.FileUpload {
			result.Chat.FileUpload = true
		}
		if p.Chat.Delete {
			result.Chat.Delete = true
		}
		if p.Features.APIKeys {
			result.Features.APIKeys = true
		}
		if p.Features.WebSearch {
			result.Features.WebSearch = true
		}
	}
	return result, nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func marshalGroupPermissions(perms GroupPermissions) (string, error) {
	data, err := json.Marshal(perms)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func unmarshalGroupPermissions(payload string) (GroupPermissions, error) {
	if payload == "" || payload == "{}" {
		return DefaultGroupPermissions(), nil
	}
	var perms GroupPermissions
	if err := json.Unmarshal([]byte(payload), &perms); err != nil {
		return DefaultGroupPermissions(), err
	}
	return perms, nil
}

func groupFromRow(r gUserGroup) (*UserGroup, error) {
	perms, err := unmarshalGroupPermissions(r.PermissionsJSON)
	if err != nil {
		return nil, fmt.Errorf("unmarshal group permissions: %w", err)
	}
	metadata, err := unmarshalJSONMap(r.MetadataJSON)
	if err != nil {
		return nil, fmt.Errorf("unmarshal group metadata: %w", err)
	}
	return &UserGroup{
		ID:          r.ID,
		Name:        r.Name,
		Description: r.Description,
		Permissions: perms,
		Metadata:    metadata,
		CreatedAt:   time.Unix(r.CreatedAtUnix, 0).UTC(),
		UpdatedAt:   time.Unix(r.UpdatedAtUnix, 0).UTC(),
	}, nil
}
