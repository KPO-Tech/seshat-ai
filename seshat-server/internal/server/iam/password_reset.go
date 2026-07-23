package iam

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mailer"
)

const passwordResetTokenTTL = time.Hour

// ForgotPassword always succeeds from the caller's point of view,
// regardless of whether email matches an account - a different response
// for "no such user" vs "sent" would let an attacker enumerate accounts by
// email. If a user is found: any prior unused token for them is
// invalidated, a fresh one is generated (1-hour expiry - shorter than an
// invitation's 7 days, since this is a security-sensitive credential
// recovery flow) and emailed if a mailer is configured. Silently does
// nothing (still returns nil) when no user matches.
func (s *Service) ForgotPassword(ctx context.Context, email string) error {
	email = normalizeEmail(email)
	if email == "" {
		return ErrInvalidInput("email is required")
	}

	var (
		userID   string
		rawToken string
	)
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		user, ok, err := findUserByEmail(tx, email)
		if err != nil {
			return err
		}
		if !ok {
			return nil
		}
		userID = user.ID
		var tokenErr error
		rawToken, tokenErr = issuePasswordResetToken(tx, user.ID)
		return tokenErr
	})
	if err != nil {
		return err
	}
	if userID == "" {
		// No matching user - same external behavior as success, on purpose.
		return nil
	}
	s.sendPasswordResetEmail(ctx, email, rawToken)
	return nil
}

// issuePasswordResetToken invalidates any prior unused reset token for this
// user (only the newest link should ever work) and creates a fresh one,
// returning the raw value for the caller to email - shared by ForgotPassword
// and CreateOrganizationMember (whose "set your password" welcome link is
// the exact same mechanism as a forgotten-password reset link).
func issuePasswordResetToken(tx *gorm.DB, userID string) (string, error) {
	if err := tx.Where("user_id = ? AND used_at IS NULL", userID).Delete(&sdb.PasswordResetToken{}).Error; err != nil {
		return "", err
	}
	tokenValue, err := newToken()
	if err != nil {
		return "", err
	}
	rawToken := "reset_" + tokenValue
	id, err := newID("prt")
	if err != nil {
		return "", err
	}
	now := time.Now().UTC()
	record := sdb.PasswordResetToken{
		ID:        id,
		UserID:    userID,
		Token:     sdb.HashOpaqueToken(rawToken),
		CreatedAt: now,
		ExpiresAt: now.Add(passwordResetTokenTTL),
	}
	if err := tx.Create(&record).Error; err != nil {
		return "", err
	}
	return rawToken, nil
}

func (s *Service) sendPasswordResetEmail(ctx context.Context, toEmail, rawToken string) {
	if s.mailer == nil || rawToken == "" {
		return
	}
	link := fmt.Sprintf("%s/reset-password?token=%s", s.publicAppURL, rawToken)
	body := fmt.Sprintf(
		"Someone requested a password reset for your Seshat account.\n\nReset your password:\n%s\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.",
		link,
	)
	err := s.mailer.Send(ctx, mailer.Message{
		To:       toEmail,
		Subject:  "Reset your Seshat password",
		TextBody: body,
	})
	if err != nil {
		slog.Warn("iam: failed to send password reset email", "email", toEmail, "error", err)
	}
}

// ResetPassword redeems a password-reset token. Deliberately generic on
// failure (ErrUnauthorized regardless of whether the token is unknown,
// already used, or expired) to avoid giving an attacker feedback useful
// for guessing tokens. On success, every existing Session for the user is
// revoked - unlike ChangePassword (which doesn't revoke sessions, since
// the caller already proved they hold the current credential), a
// forgotten-password reset is exactly the scenario where an already-open
// session might not belong to the legitimate owner, so signing everything
// out is the safer default.
func (s *Service) ResetPassword(ctx context.Context, token, newPassword string) error {
	token = strings.TrimSpace(token)
	newPassword = strings.TrimSpace(newPassword)
	if token == "" {
		return ErrInvalidInput("token is required")
	}
	if len(newPassword) < 8 {
		return ErrInvalidInput("new password must be at least 8 characters")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.PasswordResetToken
		err := tx.Where("token = ?", sdb.HashOpaqueToken(token)).First(&record).Error
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrUnauthorized("invalid or expired reset token")
			}
			return err
		}
		if record.UsedAt != nil || record.ExpiresAt.Before(time.Now().UTC()) {
			return ErrUnauthorized("invalid or expired reset token")
		}

		var user sdb.User
		if err := tx.First(&user, "id = ?", record.UserID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrUnauthorized("invalid or expired reset token")
			}
			return err
		}

		newHash, err := hashPassword(newPassword)
		if err != nil {
			return fmt.Errorf("hash password: %w", err)
		}
		user.PasswordHash = newHash
		user.UpdatedAt = time.Now().UTC()
		if err := tx.Save(&user).Error; err != nil {
			return err
		}

		now := time.Now().UTC()
		record.UsedAt = &now
		if err := tx.Save(&record).Error; err != nil {
			return err
		}

		if err := tx.Where("user_id = ?", user.ID).Delete(&sdb.Session{}).Error; err != nil {
			return err
		}

		orgID, err := primaryOrganizationIDForUser(tx, user.ID)
		if err != nil {
			return err
		}
		return appendAuditEvent(tx, nil, orgID, "user.password_reset", "user", user.ID, nil)
	})
}
