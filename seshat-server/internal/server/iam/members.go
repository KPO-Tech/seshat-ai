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

// CreateOrganizationMemberParams creates a brand-new account and attaches it
// to an organization in one step - the org-admin-facing counterpart to
// CreateUser (which is platform-superadmin-only). Deliberately has no
// Password field: see CreateOrganizationMember's doc comment.
type CreateOrganizationMemberParams struct {
	OrganizationID string   `json:"organization_id"`
	Email          string   `json:"email"`
	DisplayName    string   `json:"display_name"`
	Role           string   `json:"role"`
	GroupIDs       []string `json:"group_ids"`
}

// CreateOrganizationMember lets an org admin (members.manage or
// organization.manage - unlike CreateUser, which requires platform
// super-admin) create a new member account directly instead of only
// inviting by email. The admin never sets or sees a password: one is
// generated internally via newToken() (the same crypto/rand source used
// everywhere else in this package), hashed, and immediately discarded from
// scope - the new person sets their own real password via the emailed
// welcome link, which reuses the exact same ForgotPassword/ResetPassword
// token mechanism (see issuePasswordResetToken). Optionally attaches the
// new member to one or more existing groups in the same transaction, so
// onboarding into a team doesn't need a separate trip to the Teams page.
func (s *Service) CreateOrganizationMember(ctx context.Context, principal *Principal, params CreateOrganizationMemberParams) (*Membership, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	email := normalizeEmail(params.Email)
	displayName := strings.TrimSpace(params.DisplayName)
	role := strings.TrimSpace(params.Role)
	if organizationID == "" || email == "" || displayName == "" {
		return nil, ErrInvalidInput("organization_id, email and display_name are required")
	}
	if role == "" {
		role = "member"
	}
	groupIDs := normalizeUniqueIDs(params.GroupIDs)

	var (
		membership       *Membership
		organizationName string
		rawResetToken    string
	)
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var org sdb.Organization
		if err := tx.First(&org, "id = ?", organizationID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("organization not found")
			}
			return err
		}
		organizationName = org.Name

		if err := requireOrganizationPermission(tx, principal, organizationID, "members.manage", "organization.manage"); err != nil {
			return err
		}

		validatedRole, err := validateRoleCodeForOrganization(tx, organizationID, role)
		if err != nil {
			return err
		}
		role = validatedRole

		if _, ok, ferr := findUserByEmail(tx, email); ferr != nil {
			return ferr
		} else if ok {
			return ErrConflict("user email already exists")
		}

		if len(groupIDs) > 0 {
			if err := validateGroupsBelongToOrganization(tx, organizationID, groupIDs); err != nil {
				return err
			}
		}

		// A random password the admin never sees or sets - the new member
		// sets their own real one via the welcome email's reset link. The
		// raw value only ever exists in this local variable, immediately
		// discarded after hashing.
		randomPassword, err := newToken()
		if err != nil {
			return err
		}
		passwordHash, err := hashPassword(randomPassword)
		if err != nil {
			return fmt.Errorf("hash password: %w", err)
		}

		now := time.Now().UTC()
		userID, err := newID("usr")
		if err != nil {
			return err
		}
		userRecord := sdb.User{
			ID:           userID,
			Email:        email,
			DisplayName:  displayName,
			PasswordHash: passwordHash,
			CreatedAt:    now,
			UpdatedAt:    now,
		}
		if err := tx.Create(&userRecord).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("user email already exists")
			}
			return err
		}

		membershipID, err := newID("mem")
		if err != nil {
			return err
		}
		membershipRecord := sdb.Membership{
			ID:             membershipID,
			UserID:         userRecord.ID,
			OrganizationID: organizationID,
			Role:           role,
			CreatedAt:      now,
		}
		if err := tx.Create(&membershipRecord).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("user already belongs to an organization")
			}
			return err
		}

		if err := addUserToGroups(tx, organizationID, userRecord.ID, groupIDs); err != nil {
			return err
		}

		if err := appendAuditEvent(tx, principal, organizationID, "user.created_by_organization_admin", "user", userRecord.ID, map[string]string{"email": userRecord.Email}); err != nil {
			return err
		}
		if err := appendAuditEvent(tx, principal, organizationID, "membership.created_via_organization_admin", "membership", membershipRecord.ID, map[string]string{"role": membershipRecord.Role, "user_id": membershipRecord.UserID}); err != nil {
			return err
		}

		converted, err := toMembershipWithPermissions(tx, userRecord.ID, membershipRecord)
		if err != nil {
			return err
		}
		membership = &converted

		rawResetToken, err = issuePasswordResetToken(tx, userRecord.ID)
		return err
	})
	if err != nil {
		return nil, err
	}
	s.sendWelcomeEmail(ctx, email, organizationName, rawResetToken)
	return membership, nil
}

// addUserToGroups attaches one user to zero or more existing groups, unlike
// replaceGroupMembers (which replaces a *group's* entire roster) - this is
// "add one new user to N groups," the right shape for member creation. Each
// group id is verified to belong to this organization first.
func addUserToGroups(tx *gorm.DB, organizationID, userID string, groupIDs []string) error {
	if len(groupIDs) == 0 {
		return nil
	}
	now := time.Now().UTC()
	records := make([]sdb.GroupMember, 0, len(groupIDs))
	for _, groupID := range groupIDs {
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
	if err := tx.Create(&records).Error; err != nil {
		if isUniqueConstraintError(err) {
			return ErrConflict("user already belongs to one of the selected groups")
		}
		return err
	}
	return nil
}

// validateGroupsBelongToOrganization rejects a group id from a different
// organization (or one that doesn't exist at all) - the inverse check of
// validateGroupMembers (which validates USER ids belong to an org; this
// validates GROUP ids do).
func validateGroupsBelongToOrganization(tx *gorm.DB, organizationID string, groupIDs []string) error {
	var count int64
	if err := tx.Model(&sdb.Group{}).Where("id IN ? AND organization_id = ?", groupIDs, organizationID).Count(&count).Error; err != nil {
		return err
	}
	if int(count) != len(groupIDs) {
		return ErrInvalidInput("one or more groups do not belong to this organization")
	}
	return nil
}

// sendWelcomeEmail shares the exact same link mechanism as
// sendPasswordResetEmail (the console's /reset-password?token=... page is
// already a generic "set a new password" form, so it works unchanged for
// first-time setup) - only the copy differs, since this isn't a forgotten
// password, it's a brand-new account. Best-effort, same as every other
// email in this package: never fails the caller.
func (s *Service) sendWelcomeEmail(ctx context.Context, toEmail, organizationName, rawToken string) {
	if s.mailer == nil || rawToken == "" {
		return
	}
	link := fmt.Sprintf("%s/reset-password?token=%s", s.publicAppURL, rawToken)
	body := fmt.Sprintf(
		"An account was created for you on %s's Seshat organization.\n\nSet your password to get started:\n%s\n\nThis link expires in 1 hour.",
		organizationName, link,
	)
	err := s.mailer.Send(ctx, mailer.Message{
		To:       toEmail,
		Subject:  fmt.Sprintf("Your Seshat account for %s is ready", organizationName),
		TextBody: body,
	})
	if err != nil {
		slog.Warn("iam: failed to send welcome email", "email", toEmail, "error", err)
	}
}
