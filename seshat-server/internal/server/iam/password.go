package iam

import (
	"context"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// ChangePasswordParams carries a self-service password rotation request.
type ChangePasswordParams struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// ChangePassword lets any authenticated user rotate their own password,
// after re-proving the current one - a bearer token alone must not be enough
// to rotate credentials (mirrors Login's own bcrypt re-verification).
// Deliberately self-only: principal.User.ID is always the target, unlike
// UpdateUser (admin-only, no password field - see its doc comment), so
// there's no userID parameter.
func (s *Service) ChangePassword(ctx context.Context, principal *Principal, params ChangePasswordParams) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	current := strings.TrimSpace(params.CurrentPassword)
	next := strings.TrimSpace(params.NewPassword)
	if current == "" || next == "" {
		return ErrInvalidInput("current_password and new_password are required")
	}
	if len(next) < 8 {
		return ErrInvalidInput("new password must be at least 8 characters")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.User
		if err := tx.First(&record, "id = ?", principal.User.ID).Error; err != nil {
			return err
		}
		if err := bcrypt.CompareHashAndPassword([]byte(record.PasswordHash), []byte(current)); err != nil {
			return ErrUnauthorized("current password is incorrect")
		}
		newHash, err := hashPassword(next)
		if err != nil {
			return fmt.Errorf("hash password: %w", err)
		}
		record.PasswordHash = newHash
		record.UpdatedAt = time.Now().UTC()
		if err := tx.Save(&record).Error; err != nil {
			return err
		}
		orgID, err := primaryOrganizationIDForUser(tx, record.ID)
		if err != nil {
			return err
		}
		return appendAuditEvent(tx, principal, orgID, "user.password_changed", "user", record.ID, nil)
	})
}
