package iam

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// UpdateUserParams contains mutable user fields exposed by the control plane.
// Password rotation intentionally stays outside this path so the mutation rules
// for credentials can evolve separately later.
type UpdateUserParams struct {
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	IsAdmin     bool   `json:"is_admin"`
}

// GetUser returns a user record for admins or the user themself.
func (s *Service) GetUser(ctx context.Context, principal *Principal, userID string) (*User, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return nil, ErrInvalidInput("user_id is required")
	}

	var record sdb.User
	if err := s.db.Gorm().WithContext(ctx).First(&record, "id = ?", userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("user not found")
		}
		return nil, err
	}
	if !principal.User.IsAdmin && principal.User.ID != record.ID {
		return nil, ErrForbidden("user access denied")
	}
	user := toUser(record)
	return &user, nil
}

// UpdateUser updates profile fields under platform admin control.
func (s *Service) UpdateUser(ctx context.Context, principal *Principal, userID string, params UpdateUserParams) (*User, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	if err := requireAdmin(principal); err != nil {
		return nil, err
	}
	userID = strings.TrimSpace(userID)
	email := normalizeEmail(params.Email)
	displayName := strings.TrimSpace(params.DisplayName)
	if userID == "" || email == "" || displayName == "" {
		return nil, ErrInvalidInput("user_id, email and display_name are required")
	}

	var user *User
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.User
		if err := tx.First(&record, "id = ?", userID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("user not found")
			}
			return err
		}
		var conflicting int64
		if err := tx.Model(&sdb.User{}).Where("email = ? AND id <> ?", email, record.ID).Count(&conflicting).Error; err != nil {
			return err
		}
		if conflicting > 0 {
			return ErrConflict("user email already exists")
		}

		// Never allow the platform to remove admin privileges from the last admin.
		if record.IsAdmin && !params.IsAdmin {
			hasAnother, err := hasAnotherAdmin(tx, record.ID)
			if err != nil {
				return err
			}
			if !hasAnother {
				return ErrConflict("cannot demote the last admin")
			}
		}

		record.Email = email
		record.DisplayName = displayName
		record.IsAdmin = params.IsAdmin
		record.UpdatedAt = time.Now().UTC()
		if err := tx.Save(&record).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("user email already exists")
			}
			return err
		}
		orgID, err := primaryOrganizationIDForUser(tx, record.ID)
		if err != nil {
			return err
		}
		if err := appendAuditEvent(tx, principal, orgID, "user.updated", "user", record.ID, map[string]string{
			"email":    record.Email,
			"is_admin": boolString(record.IsAdmin),
		}); err != nil {
			return err
		}

		converted := toUser(record)
		user = &converted
		return nil
	})
	return user, err
}

// DeleteUser removes a user together with memberships and active sessions.
func (s *Service) DeleteUser(ctx context.Context, principal *Principal, userID string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	if err := requireAdmin(principal); err != nil {
		return err
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return ErrInvalidInput("user_id is required")
	}
	if principal.User.ID == userID {
		return ErrConflict("cannot delete the current admin user")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.User
		if err := tx.First(&record, "id = ?", userID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("user not found")
			}
			return err
		}
		if record.IsAdmin {
			hasAnother, err := hasAnotherAdmin(tx, record.ID)
			if err != nil {
				return err
			}
			if !hasAnother {
				return ErrConflict("cannot delete the last admin")
			}
		}

		orgID, err := primaryOrganizationIDForUser(tx, record.ID)
		if err != nil {
			return err
		}
		var memberships []sdb.Membership
		if err := tx.Where("user_id = ?", record.ID).Find(&memberships).Error; err != nil {
			return err
		}
		for _, membership := range memberships {
			if isOwnerRole(membership.Role) {
				hasAnother, err := hasAnotherOrganizationOwner(tx, membership.OrganizationID, membership.ID)
				if err != nil {
					return err
				}
				if !hasAnother {
					return ErrConflict("cannot delete the last owner of an organization")
				}
			}
		}
		if err := removeUserAuthorizationReferencesEverywhere(tx, record.ID); err != nil {
			return err
		}
		if err := tx.Delete(&sdb.User{}, "id = ?", record.ID).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", record.ID).Delete(&sdb.Membership{}).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", record.ID).Delete(&sdb.Session{}).Error; err != nil {
			return err
		}
		return appendAuditEvent(tx, principal, orgID, "user.deleted", "user", record.ID, map[string]string{"email": record.Email})
	})
}

func hasAnotherAdmin(tx *gorm.DB, excludedUserID string) (bool, error) {
	var count int64
	err := tx.Model(&sdb.User{}).Where("is_admin = ? AND id <> ?", true, excludedUserID).Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// SessionInfo is the admin-facing representation of a session.
// It intentionally exposes a stable session ID instead of the bearer token.
type SessionInfo struct {
	ID              string    `json:"id"`
	UserID          string    `json:"user_id"`
	UserEmail       string    `json:"user_email"`
	UserDisplayName string    `json:"user_display_name"`
	OrganizationIDs []string  `json:"organization_ids"`
	CreatedAt       time.Time `json:"created_at"`
	ExpiresAt       time.Time `json:"expires_at"`
}

// ListSessionsParams supports lightweight filtering for admin grids.
type ListSessionsParams struct {
	UserID         string `json:"user_id"`
	OrganizationID string `json:"organization_id"`
}

var sessionSortFields = map[string]sdb.SortField{
	"created_at":        {Column: "sessions.created_at", Tiebreak: "sessions.id"},
	"expires_at":        {Column: "sessions.expires_at", Tiebreak: "sessions.id"},
	"user_email":        {Column: "users.email", Tiebreak: "sessions.id"},
	"user_display_name": {Column: "users.display_name", Tiebreak: "sessions.id"},
}

// sessionSearchColumns does not include organization membership — matching
// by organization id is still available as a structured filter
// (ListSessionsParams.OrganizationID), just not as part of the free-text
// search box, since it would require a second join purely for that.
var sessionSearchColumns = []string{"sessions.id", "sessions.user_id", "users.email", "users.display_name"}

// sessionRow is what the joined sessions+users query scans into, before
// organization IDs (which need their own lookup) are attached.
type sessionRow struct {
	ID              string
	UserID          string
	UserEmail       string
	UserDisplayName string
	CreatedAt       time.Time
	ExpiresAt       time.Time
}

// ListSessions returns a page of active sessions visible to the caller:
// platform admins see everyone's sessions, regular users are always
// restricted to their own regardless of what user_id they ask for.
// Search/sort/pagination are applied in SQL, joined against users so
// searching/sorting by email or display name doesn't require loading every
// session up front.
func (s *Service) ListSessions(ctx context.Context, principal *Principal, params ListSessionsParams, listParams sdb.ListParams) ([]SessionInfo, int64, error) {
	if principal == nil {
		return nil, 0, ErrUnauthorized("authentication required")
	}

	userID := strings.TrimSpace(params.UserID)
	if !principal.User.IsAdmin {
		userID = principal.User.ID
	}
	organizationID := strings.TrimSpace(params.OrganizationID)

	tx := s.db.Gorm().WithContext(ctx)
	query := tx.Table("sessions").
		Select("sessions.id AS id, sessions.user_id AS user_id, users.email AS user_email, users.display_name AS user_display_name, sessions.created_at AS created_at, sessions.expires_at AS expires_at").
		Joins("JOIN users ON users.id = sessions.user_id")
	if userID != "" {
		query = query.Where("sessions.user_id = ?", userID)
	}
	if organizationID != "" {
		query = query.Where("sessions.user_id IN (?)", tx.Model(&sdb.Membership{}).Select("user_id").Where("organization_id = ?", organizationID))
	}

	sortField, err := sdb.ResolveSortField(sessionSortFields, listParams.Sort)
	if err != nil {
		return nil, 0, ErrInvalidInput(err.Error())
	}
	query = sdb.ApplySearch(query, listParams.Search, sessionSearchColumns...)
	query = sdb.ApplySort(query, sortField, listParams.Order)

	rows, total, err := sdb.Page[sessionRow](query, listParams.Limit, listParams.Offset)
	if err != nil {
		return nil, 0, err
	}

	userIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		userIDs = append(userIDs, row.UserID)
	}
	organizationIDsByUser, err := organizationIDsForUsers(tx, userIDs)
	if err != nil {
		return nil, 0, err
	}

	sessions := make([]SessionInfo, 0, len(rows))
	for _, row := range rows {
		sessions = append(sessions, SessionInfo{
			ID:              row.ID,
			UserID:          row.UserID,
			UserEmail:       row.UserEmail,
			UserDisplayName: row.UserDisplayName,
			OrganizationIDs: organizationIDsByUser[row.UserID],
			CreatedAt:       row.CreatedAt,
			ExpiresAt:       row.ExpiresAt,
		})
	}
	return sessions, total, nil
}

// RevokeSession removes one active session by its stable session ID.
// Platform admins may revoke any session; a regular user may only revoke
// one of their own (e.g. after losing a device).
func (s *Service) RevokeSession(ctx context.Context, principal *Principal, sessionID string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return ErrInvalidInput("session_id is required")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		session, ok, err := findSessionByID(tx, sessionID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrNotFound("session not found")
		}
		if !principal.User.IsAdmin && session.UserID != principal.User.ID {
			return ErrForbidden("session access denied")
		}
		if err := tx.Where("id = ?", session.ID).Delete(&sdb.Session{}).Error; err != nil {
			return err
		}
		orgID, err := primaryOrganizationIDForUser(tx, session.UserID)
		if err != nil {
			return err
		}
		return appendAuditEvent(tx, principal, orgID, "session.revoked", "session", session.ID, map[string]string{"user_id": session.UserID})
	})
}

// RevokeUserSessions removes all active sessions for one user. Platform
// admins may target any user; a regular user may only target themselves
// (e.g. "sign out of all devices").
func (s *Service) RevokeUserSessions(ctx context.Context, principal *Principal, userID string) (int, error) {
	if principal == nil {
		return 0, ErrUnauthorized("authentication required")
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return 0, ErrInvalidInput("user_id is required")
	}
	if !principal.User.IsAdmin && principal.User.ID != userID {
		return 0, ErrForbidden("session access denied")
	}

	revokedCount := 0
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var userCount int64
		if err := tx.Model(&sdb.User{}).Where("id = ?", userID).Count(&userCount).Error; err != nil {
			return err
		}
		if userCount == 0 {
			return ErrNotFound("user not found")
		}
		result := tx.Where("user_id = ?", userID).Delete(&sdb.Session{})
		if result.Error != nil {
			return result.Error
		}
		revokedCount = int(result.RowsAffected)
		orgID, err := primaryOrganizationIDForUser(tx, userID)
		if err != nil {
			return err
		}
		return appendAuditEvent(tx, principal, orgID, "session.bulk_revoked", "user", userID, map[string]string{"count": intString(revokedCount)})
	})
	return revokedCount, err
}

func organizationIDsForUser(tx *gorm.DB, userID string) ([]string, error) {
	var ids []string
	if err := tx.Model(&sdb.Membership{}).Where("user_id = ?", userID).Order("created_at asc").Pluck("organization_id", &ids).Error; err != nil {
		return nil, err
	}
	return ids, nil
}

// organizationIDsForUsers is the batched form of organizationIDsForUser, for
// callers (like a session list page) that need this for several users at
// once without querying once per row.
func organizationIDsForUsers(tx *gorm.DB, userIDs []string) (map[string][]string, error) {
	result := make(map[string][]string, len(userIDs))
	if len(userIDs) == 0 {
		return result, nil
	}
	var memberships []sdb.Membership
	if err := tx.Where("user_id IN ?", userIDs).Order("created_at asc").Find(&memberships).Error; err != nil {
		return nil, err
	}
	for _, membership := range memberships {
		result[membership.UserID] = append(result[membership.UserID], membership.OrganizationID)
	}
	return result, nil
}

func organizationIDsWithAnyPermission(tx *gorm.DB, principal *Principal, permissionCodes ...string) ([]string, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	if principal.User.IsAdmin {
		return nil, nil
	}
	tx = tx.Session(&gorm.Session{NewDB: true})
	organizationIDs, err := organizationIDsForUser(tx, principal.User.ID)
	if err != nil {
		return nil, err
	}
	allowed := make([]string, 0, len(organizationIDs))
	for _, organizationID := range organizationIDs {
		ok, err := hasAnyOrganizationPermission(tx, principal, organizationID, permissionCodes...)
		if err != nil {
			return nil, err
		}
		if ok {
			allowed = append(allowed, organizationID)
		}
	}
	return allowed, nil
}

func restrictQueryToPrincipalOrganizations(query *gorm.DB, principal *Principal, requestedOrganizationID string, permissionCodes ...string) (*gorm.DB, bool, error) {
	requestedOrganizationID = strings.TrimSpace(requestedOrganizationID)
	if principal == nil {
		return nil, false, ErrUnauthorized("authentication required")
	}
	if principal.User.IsAdmin {
		if requestedOrganizationID != "" {
			query = query.Where("organization_id = ?", requestedOrganizationID)
		}
		return query, true, nil
	}
	organizationIDs, err := organizationIDsWithAnyPermission(query, principal, permissionCodes...)
	if err != nil {
		return nil, false, err
	}
	if requestedOrganizationID != "" {
		if !containsString(organizationIDs, requestedOrganizationID) {
			return query, false, nil
		}
		return query.Where("organization_id = ?", requestedOrganizationID), true, nil
	}
	if len(organizationIDs) == 0 {
		return query, false, nil
	}
	return query.Where("organization_id IN ?", organizationIDs), true, nil
}

func findSessionByID(tx *gorm.DB, sessionID string) (sdb.Session, bool, error) {
	var session sdb.Session
	err := tx.Where("id = ?", sessionID).First(&session).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return sdb.Session{}, false, nil
		}
		return sdb.Session{}, false, err
	}
	return session, true, nil
}

func containsString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func boolString(value bool) string {
	if value {
		return "true"
	}
	return "false"
}

func intString(value int) string {
	return fmt.Sprintf("%d", value)
}
