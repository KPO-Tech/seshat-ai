// Package preferences is a strictly personal, one-row-per-user settings
// domain: no organization, no hierarchy, no permission catalog — a user's
// preferences only ever belong to them, so self-service (principal.User.ID
// implicit) is the only access path, the same trust level as GET/PUT
// /auth/me. This is the reason it's simpler than provider-settings/
// embedder-settings, which both need an org→platform resolution.
//
// The one exception is GetMyPreferences, which layers in read-only
// organization defaults (see OrganizationPreferences below) for a subset of
// fields — the member's own value always wins when set, so this doesn't
// change the "only I can change my own preferences" invariant, only what
// GetMyPreferences returns before I've set something myself.
package preferences

import (
	"context"
	"errors"
	"strings"
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

// OrganizationPreferences is a singleton per organization providing default
// values for the subset of UserPreferences fields that make sense at an
// organization scope (deliberately excludes preferred_name/profession/about
// — see db.OrganizationPreference's doc comment). Only ever read directly by
// an organization manager (organization.manage); every other member sees
// its effect only, merged transparently into their own GetMyPreferences
// response.
type OrganizationPreferences struct {
	OrganizationID            string    `json:"organization_id"`
	WorkingStyle              string    `json:"working_style"`
	ResponseStyle             string    `json:"response_style"`
	ExtraContext              string    `json:"extra_context"`
	InteractivePermissionMode string    `json:"interactive_permission_mode"`
	AutomationPermissionMode  string    `json:"automation_permission_mode"`
	MaxSubAgentDepth          int       `json:"max_sub_agent_depth"`
	UpdatedAt                 time.Time `json:"updated_at"`
}

// UpsertOrganizationPreferencesParams is the input for the org-scoped
// upsert — at most one row per organization, same singleton shape as
// knowledge.SetEmbedderSettingParams.
type UpsertOrganizationPreferencesParams struct {
	WorkingStyle              string
	ResponseStyle             string
	ExtraContext              string
	InteractivePermissionMode string
	AutomationPermissionMode  string
	MaxSubAgentDepth          int
}

type Service struct {
	db  *sdb.DB
	iam *iam.Service
}

func New(database *sdb.DB, iamService *iam.Service) *Service {
	return &Service{db: database, iam: iamService}
}

// GetMyPreferences returns the caller's own preferences merged with their
// organization's defaults: a personal field wins whenever it's non-zero,
// otherwise the organization's own OrganizationPreference is used, falling
// back further to the platform-default organization's value if the caller's
// organization has none of its own and the default org shares this domain
// (see resolveOrganizationPreferences). A caller with no organization (e.g.
// the platform super-admin) gets exactly their personal record, unchanged
// from before this merge existed.
func (s *Service) GetMyPreferences(ctx context.Context, principal *iam.Principal) (*UserPreferences, error) {
	if principal == nil {
		return nil, apperr.Unauthorized("authentication required")
	}
	var record sdb.UserPreference
	err := s.db.Gorm().WithContext(ctx).First(&record, "user_id = ?", principal.User.ID).Error
	var result UserPreferences
	switch {
	case err == nil:
		result = toUserPreferences(record)
	case errors.Is(err, gorm.ErrRecordNotFound):
		result = UserPreferences{UserID: principal.User.ID}
	default:
		return nil, err
	}

	if len(principal.Memberships) > 0 {
		orgDefaults, err := s.resolveOrganizationPreferences(ctx, principal.Memberships[0].OrganizationID)
		if err != nil {
			return nil, err
		}
		if orgDefaults != nil {
			mergeOrganizationDefaults(&result, orgDefaults)
		}
	}
	return &result, nil
}

// mergeOrganizationDefaults fills in only the fields personal left at their
// zero value — a member's own preference, once set, always wins.
func mergeOrganizationDefaults(personal *UserPreferences, org *OrganizationPreferences) {
	if personal.WorkingStyle == "" {
		personal.WorkingStyle = org.WorkingStyle
	}
	if personal.ResponseStyle == "" {
		personal.ResponseStyle = org.ResponseStyle
	}
	if personal.ExtraContext == "" {
		personal.ExtraContext = org.ExtraContext
	}
	if personal.InteractivePermissionMode == "" {
		personal.InteractivePermissionMode = org.InteractivePermissionMode
	}
	if personal.AutomationPermissionMode == "" {
		personal.AutomationPermissionMode = org.AutomationPermissionMode
	}
	if personal.MaxSubAgentDepth == 0 {
		personal.MaxSubAgentDepth = org.MaxSubAgentDepth
	}
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

// ─── Organization-scoped preference defaults ──────────────────────────────

// GetOrganizationPreferences returns this organization's OWN preference
// defaults only (no platform fallback — an admin editing their org's
// preferences needs to see exactly what's set for THIS org, not a value
// inherited from elsewhere). Requires organization.manage, the same
// boundary the console's RequireOrganizationManager gate already enforces.
func (s *Service) GetOrganizationPreferences(ctx context.Context, principal *iam.Principal, organizationID string) (*OrganizationPreferences, error) {
	if principal == nil {
		return nil, apperr.Unauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, apperr.InvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "organization.manage"); err != nil {
			return nil, err
		}
	}
	var record sdb.OrganizationPreference
	if err := s.db.Gorm().WithContext(ctx).Where("organization_id = ?", organizationID).First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperr.NotFound("no preferences configured for this organization")
		}
		return nil, err
	}
	result := toOrganizationPreferences(record)
	return &result, nil
}

// UpsertOrganizationPreferences requires organization.manage.
func (s *Service) UpsertOrganizationPreferences(ctx context.Context, principal *iam.Principal, organizationID string, params UpsertOrganizationPreferencesParams) (*OrganizationPreferences, error) {
	if principal == nil {
		return nil, apperr.Unauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, apperr.InvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "organization.manage"); err != nil {
			return nil, err
		}
	}
	maxDepth := params.MaxSubAgentDepth
	if maxDepth < 0 {
		maxDepth = 0
	}
	if maxDepth > 5 {
		maxDepth = 5
	}

	var record sdb.OrganizationPreference
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		existing := tx.Where("organization_id = ?", organizationID).First(&record).Error
		isCreate := errors.Is(existing, gorm.ErrRecordNotFound)
		if existing != nil && !isCreate {
			return existing
		}
		if isCreate {
			id, err := sdb.NewID("orgpref")
			if err != nil {
				return err
			}
			record = sdb.OrganizationPreference{
				ID:              id,
				OrganizationID:  organizationID,
				CreatedByUserID: principal.User.ID,
			}
		}
		record.WorkingStyle = params.WorkingStyle
		record.ResponseStyle = params.ResponseStyle
		record.ExtraContext = params.ExtraContext
		record.InteractivePermissionMode = params.InteractivePermissionMode
		record.AutomationPermissionMode = params.AutomationPermissionMode
		record.MaxSubAgentDepth = maxDepth
		if isCreate {
			if err := tx.Create(&record).Error; err != nil {
				return err
			}
		} else {
			if err := tx.Save(&record).Error; err != nil {
				return err
			}
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "organization_preferences.set", "organization_preference", record.ID, nil)
	})
	if err != nil {
		return nil, err
	}
	result := toOrganizationPreferences(record)
	return &result, nil
}

// DeleteOrganizationPreferences requires organization.manage. Members of
// this organization fall back to the platform default (if any) for
// subsequent GetMyPreferences calls.
func (s *Service) DeleteOrganizationPreferences(ctx context.Context, principal *iam.Principal, organizationID string) error {
	if principal == nil {
		return apperr.Unauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return apperr.InvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "organization.manage"); err != nil {
			return err
		}
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.OrganizationPreference
		if err := tx.Where("organization_id = ?", organizationID).First(&record).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return apperr.NotFound("no preferences configured for this organization")
			}
			return err
		}
		if err := tx.Delete(&sdb.OrganizationPreference{}, "id = ?", record.ID).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "organization_preferences.deleted", "organization_preference", record.ID, nil)
	})
}

// resolveOrganizationPreferences implements the same org→platform-default
// hierarchy as knowledge.resolveEmbedderConfig, but with no permission
// check — GetMyPreferences calls this for any member of the organization,
// not just its admins. Returns nil (not an error) when neither the
// organization nor the platform default has anything configured.
func (s *Service) resolveOrganizationPreferences(ctx context.Context, organizationID string) (*OrganizationPreferences, error) {
	tx := s.db.Gorm().WithContext(ctx)
	var record sdb.OrganizationPreference
	err := tx.Where("organization_id = ?", organizationID).First(&record).Error
	if err == nil {
		result := toOrganizationPreferences(record)
		return &result, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	defaultOrgID, found, err := s.iam.DefaultOrganizationIDForDomain(tx, iam.SharedDomainOrganizationPreferences)
	if err != nil {
		return nil, err
	}
	if !found || defaultOrgID == organizationID {
		return nil, nil
	}

	var defaultRecord sdb.OrganizationPreference
	err = tx.Where("organization_id = ?", defaultOrgID).First(&defaultRecord).Error
	if err == nil {
		result := toOrganizationPreferences(defaultRecord)
		return &result, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	return nil, nil
}

func toOrganizationPreferences(r sdb.OrganizationPreference) OrganizationPreferences {
	return OrganizationPreferences{
		OrganizationID:            r.OrganizationID,
		WorkingStyle:              r.WorkingStyle,
		ResponseStyle:             r.ResponseStyle,
		ExtraContext:              r.ExtraContext,
		InteractivePermissionMode: r.InteractivePermissionMode,
		AutomationPermissionMode:  r.AutomationPermissionMode,
		MaxSubAgentDepth:          r.MaxSubAgentDepth,
		UpdatedAt:                 r.UpdatedAt,
	}
}
