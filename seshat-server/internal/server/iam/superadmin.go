package iam

import (
	"context"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// EnsureSuperAdmin seeds a platform super-admin (User.IsAdmin=true) from
// deployment config, so there's always a way into the platform without the
// one-shot POST /auth/bootstrap wizard - see the config.BootstrapAdminEmail
// doc comment. Deliberately not a call to Bootstrap: Bootstrap always creates
// an Organization + owner Membership in the same transaction, which the
// seeded super-admin must NOT get (organizations are created through the
// self-serve CreateOrganization flow now, and a super-admin doesn't have
// "its own" organization - see CreateOrganization's IsAdmin skip).
//
// Called once at server startup (see app.New), but must be safe to call on
// every restart: idempotent by email, not by "any user exists" - finding an
// existing user at this email leaves it completely untouched (password
// included), so a restart never silently resets credentials someone already
// rotated via ChangePassword.
func (s *Service) EnsureSuperAdmin(ctx context.Context, email, password string) error {
	email = strings.TrimSpace(email)
	password = strings.TrimSpace(password)
	if email == "" || password == "" {
		return nil // seeding not configured, not an error
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		_, exists, err := findUserByEmail(tx, email)
		if err != nil {
			return err
		}
		if exists {
			return nil // idempotent no-op: found by email, never touch password/flags
		}

		passwordHash, err := hashPassword(password)
		if err != nil {
			return fmt.Errorf("hash password: %w", err)
		}
		userID, err := newID("usr")
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		user := sdb.User{
			ID:           userID,
			Email:        normalizeEmail(email),
			DisplayName:  "Platform Administrator",
			PasswordHash: passwordHash,
			IsAdmin:      true,
			CreatedAt:    now,
			UpdatedAt:    now,
		}
		if err := tx.Create(&user).Error; err != nil {
			if isUniqueConstraintError(err) {
				return nil // race: another instance seeded it first
			}
			return err
		}
		return appendAuditEvent(tx, nil, "", "user.super_admin_seeded", "user", user.ID, map[string]string{"email": user.Email})
	})
}
