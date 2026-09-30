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

// This file is the iam-side counterpart to package scim's SCIM 2.0 /Users
// protocol handlers (Étape 4 of the staged plan in
// docs/helps/audit-2026-08-29-openwork-den-comparison.md). scim.Service
// authenticates the incoming request itself (bearer token -> ScimConnection,
// see ResolveConnectionByToken) - by the time these methods are called, the
// caller has already been authorized at that layer, the same trust
// relationship CompleteOIDCLogin has with oidcAutoJoinOrganization. None of
// these methods take an *Principal or run a permission check.

// ProvisionScimMemberParams describes one SCIM-pushed user to provision.
type ProvisionScimMemberParams struct {
	OrganizationID string
	Email          string
	DisplayName    string
	// Active mirrors the SCIM "active" attribute - false provisions the
	// membership already blocked, matching the "PATCH active:false ->
	// blocked" mapping used for deprovisioning (see UpdateScimMember).
	Active bool
	// ExternalID is the IdP's own id for this user (SCIM "externalId") -
	// stored but never interpreted, purely for the IdP's own correlation.
	// Empty is valid (not every IdP sends one).
	ExternalID string
}

// ProvisionScimMember creates a brand-new account and membership in one
// step, immediately active (or blocked, per params.Active) - unlike
// CreateOrganizationMember (admin-driven, sends a welcome email so the new
// person can set their own password) this never emails anyone: a
// SCIM-provisioned user authenticates through the organization's own SSO,
// not a password, so there is nothing to send them. Mirrors
// CreateOrganizationMember's shape otherwise: a random, never-revealed
// password hash (User.PasswordHash is NOT NULL - this keeps the invariant
// without implying password login is expected), one organization per user
// enforced the same way, "member" as the fixed role (SCIM provisions
// accounts, not permissions - an admin promotes someone in-app afterward if
// needed).
func (s *Service) ProvisionScimMember(ctx context.Context, params ProvisionScimMemberParams) (*Membership, error) {
	organizationID := strings.TrimSpace(params.OrganizationID)
	email := normalizeEmail(params.Email)
	displayName := strings.TrimSpace(params.DisplayName)
	if organizationID == "" || email == "" || displayName == "" {
		return nil, ErrInvalidInput("organization_id, email and display_name are required")
	}
	externalID := strings.TrimSpace(params.ExternalID)

	status := "blocked"
	if params.Active {
		status = "active"
	}

	var membership *Membership
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if _, ok, ferr := findUserByEmail(tx, email); ferr != nil {
			return ferr
		} else if ok {
			return ErrConflict("a user with this email already exists")
		}

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
			ID: userID, Email: email, DisplayName: displayName, PasswordHash: passwordHash,
			CreatedAt: now, UpdatedAt: now,
		}
		if err := tx.Create(&userRecord).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("a user with this email already exists")
			}
			return err
		}

		membershipID, err := newID("mem")
		if err != nil {
			return err
		}
		membershipRecord := sdb.Membership{
			ID: membershipID, UserID: userRecord.ID, OrganizationID: organizationID,
			Role: "member", Status: status, CreatedAt: now,
		}
		if externalID != "" {
			membershipRecord.ScimExternalID = &externalID
		}
		if err := tx.Create(&membershipRecord).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("a user with this email already exists")
			}
			return err
		}

		if err := appendAuditEvent(tx, nil, organizationID, "user.created_via_scim", "user", userRecord.ID, map[string]string{"email": email}); err != nil {
			return err
		}
		if err := appendAuditEvent(tx, nil, organizationID, "membership.created_via_scim", "membership", membershipRecord.ID, map[string]string{"user_id": userRecord.ID}); err != nil {
			return err
		}

		result := toMembership(membershipRecord)
		result.UserEmail = userRecord.Email
		result.UserDisplayName = userRecord.DisplayName
		membership = &result
		return nil
	})
	if err != nil {
		return nil, err
	}
	return membership, nil
}

// UpdateScimMemberParams is a full-replace of the fields SCIM can change -
// PUT sends both every time; PATCH (see the scim package) reads the current
// state first and only overwrites what the operation targeted, then calls
// this with the merged result. Role/permissions are deliberately not here:
// SCIM provisions accounts, not permissions.
type UpdateScimMemberParams struct {
	DisplayName string
	Active      bool
}

// UpdateScimMember edits displayName/active for organizationID's member
// identified by userID - active:false blocks the membership (see
// Membership.Status's doc comment), active:true reactivates it. Returns
// ErrNotFound if userID isn't a member of organizationID at all, which also
// covers "belongs to a different organization" without revealing that
// distinction to the caller.
func (s *Service) UpdateScimMember(ctx context.Context, organizationID, userID string, params UpdateScimMemberParams) (*Membership, error) {
	organizationID = strings.TrimSpace(organizationID)
	userID = strings.TrimSpace(userID)
	displayName := strings.TrimSpace(params.DisplayName)
	if organizationID == "" || userID == "" || displayName == "" {
		return nil, ErrInvalidInput("organization_id, user_id and display_name are required")
	}
	newStatus := "blocked"
	if params.Active {
		newStatus = "active"
	}

	var result Membership
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var membershipRecord sdb.Membership
		if err := tx.Where("user_id = ? AND organization_id = ?", userID, organizationID).First(&membershipRecord).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("no such member")
			}
			return err
		}
		var userRecord sdb.User
		if err := tx.First(&userRecord, "id = ?", userID).Error; err != nil {
			return err
		}

		wasActive := membershipRecord.Status != "blocked"
		membershipRecord.Status = newStatus
		if err := tx.Save(&membershipRecord).Error; err != nil {
			return err
		}
		userRecord.DisplayName = displayName
		if err := tx.Save(&userRecord).Error; err != nil {
			return err
		}

		action := "membership.updated_via_scim"
		if wasActive && !params.Active {
			action = "membership.blocked_via_scim"
		} else if !wasActive && params.Active {
			action = "membership.activated_via_scim"
		}
		if err := appendAuditEvent(tx, nil, organizationID, action, "membership", membershipRecord.ID, map[string]string{"user_id": userID}); err != nil {
			return err
		}

		result = toMembership(membershipRecord)
		result.UserEmail = userRecord.Email
		result.UserDisplayName = userRecord.DisplayName
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

// GetScimMemberByUserID loads organizationID's member identified by userID -
// the SCIM protocol's own resource id (see the scim package's mapping
// doc). ErrNotFound covers both "no such user" and "belongs to a different
// organization," the same non-distinguishing stance as UpdateScimMember.
func (s *Service) GetScimMemberByUserID(ctx context.Context, organizationID, userID string) (*Membership, error) {
	organizationID = strings.TrimSpace(organizationID)
	userID = strings.TrimSpace(userID)
	if organizationID == "" || userID == "" {
		return nil, ErrInvalidInput("organization_id and user_id are required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	var record sdb.Membership
	if err := tx.Where("user_id = ? AND organization_id = ?", userID, organizationID).First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("no such member")
		}
		return nil, err
	}
	memberships := []Membership{toMembership(record)}
	enrichMembershipsWithUsers(tx, memberships)
	return &memberships[0], nil
}

// FindScimMemberByEmail looks up organizationID's member by email (SCIM
// "userName"/"emails.value" both map to this single field in our system,
// see the scim package's filter handling) - returns (nil, nil) when there
// is no match, since a SCIM filter with zero results is an ordinary empty
// list, not an error.
func (s *Service) FindScimMemberByEmail(ctx context.Context, organizationID, email string) (*Membership, error) {
	organizationID = strings.TrimSpace(organizationID)
	email = normalizeEmail(email)
	if organizationID == "" || email == "" {
		return nil, ErrInvalidInput("organization_id and email are required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	user, ok, err := findUserByEmail(tx, email)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, nil
	}
	var record sdb.Membership
	err = tx.Where("user_id = ? AND organization_id = ?", user.ID, organizationID).First(&record).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	result := toMembership(record)
	result.UserEmail = user.Email
	result.UserDisplayName = user.DisplayName
	return &result, nil
}

// ListScimMembers pages through organizationID's members for SCIM's
// unfiltered GET /Users - offset/limit are already 0-indexed (the scim
// package converts SCIM's 1-indexed startIndex before calling this),
// consistent with sdb.Page everywhere else in this codebase.
func (s *Service) ListScimMembers(ctx context.Context, organizationID string, offset, limit int) ([]Membership, int64, error) {
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, 0, ErrInvalidInput("organization_id is required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	query := tx.Model(&sdb.Membership{}).Where("organization_id = ?", organizationID).Order("created_at asc")
	records, total, err := sdb.Page[sdb.Membership](query, limit, offset)
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
