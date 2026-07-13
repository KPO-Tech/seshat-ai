// Package preferences is a strictly personal, one-row-per-user settings
// domain: no organization, no hierarchy, no permission catalog — a user's
// preferences only ever belong to them, so self-service (principal.User.ID
// implicit) is the only access path, the same trust level as GET/PUT
// /auth/me. This is the reason it's simpler than provider-settings/
// embedder-settings, which both need an org→platform resolution.
package preferences

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/apperr"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// UserPreferences mirrors seshat-backend's own preferences.UserPreferences —
// same field names, so translation on the client side is trivial.
type UserPreferences struct {
	UserID                    string    `json:"user_id"`
	PreferredName             string    `json:"preferred_name"`
	Profession                string    `json:"profession"`
	About                     string    `json:"about"`
	WorkingStyle              string    `json:"working_style"`
	ResponseStyle             string    `json:"response_style"`
	ExtraContext              string    `json:"extra_context"`
	InteractivePermissionMode string    `json:"interactive_permission_mode"`
	AutomationPermissionMode  string    `json:"automation_permission_mode"`
	MaxSubAgentDepth          int       `json:"max_sub_agent_depth"`
	UpdatedAt                 time.Time `json:"updated_at"`
}

type UpsertParams struct {
	PreferredName             string
	Profession                string
	About                     string
	WorkingStyle              string
	ResponseStyle             string
	ExtraContext              string
	InteractivePermissionMode string
	AutomationPermissionMode  string
	MaxSubAgentDepth          int
}

type Service struct {
	db *sdb.DB
}

func New(database *sdb.DB) *Service {
	return &Service{db: database}
}

// GetMyPreferences returns the caller's own preferences, or a zero-value
// record (not an error) if none has been saved yet — same "defaults until
// configured" behavior as seshat-backend's local store.
func (s *Service) GetMyPreferences(ctx context.Context, principal *iam.Principal) (*UserPreferences, error) {
	if principal == nil {
		return nil, apperr.Unauthorized("authentication required")
	}
	var record sdb.UserPreference
	err := s.db.Gorm().WithContext(ctx).First(&record, "user_id = ?", principal.User.ID).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &UserPreferences{UserID: principal.User.ID}, nil
		}
		return nil, err
	}
	result := toUserPreferences(record)
	return &result, nil
}

// UpsertMyPreferences creates or replaces the caller's own preferences.
func (s *Service) UpsertMyPreferences(ctx context.Context, principal *iam.Principal, params UpsertParams) (*UserPreferences, error) {
	if principal == nil {
		return nil, apperr.Unauthorized("authentication required")
	}
	maxDepth := params.MaxSubAgentDepth
	if maxDepth < 0 {
		maxDepth = 0
	}
	if maxDepth > 5 {
		maxDepth = 5
	}
	record := sdb.UserPreference{
		UserID:                    principal.User.ID,
		PreferredName:             params.PreferredName,
		Profession:                params.Profession,
		About:                     params.About,
		WorkingStyle:              params.WorkingStyle,
		ResponseStyle:             params.ResponseStyle,
		ExtraContext:              params.ExtraContext,
		InteractivePermissionMode: params.InteractivePermissionMode,
		AutomationPermissionMode:  params.AutomationPermissionMode,
		MaxSubAgentDepth:          maxDepth,
	}
	err := s.db.Gorm().WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"preferred_name", "profession", "about", "working_style", "response_style",
			"extra_context", "interactive_permission_mode", "automation_permission_mode",
			"max_sub_agent_depth", "updated_at",
		}),
	}).Create(&record).Error
	if err != nil {
		return nil, err
	}
	result := toUserPreferences(record)
	return &result, nil
}

func toUserPreferences(r sdb.UserPreference) UserPreferences {
	return UserPreferences{
		UserID:                    r.UserID,
		PreferredName:             r.PreferredName,
		Profession:                r.Profession,
		About:                     r.About,
		WorkingStyle:              r.WorkingStyle,
		ResponseStyle:             r.ResponseStyle,
		ExtraContext:              r.ExtraContext,
		InteractivePermissionMode: r.InteractivePermissionMode,
		AutomationPermissionMode:  r.AutomationPermissionMode,
		MaxSubAgentDepth:          r.MaxSubAgentDepth,
		UpdatedAt:                 r.UpdatedAt,
	}
}
