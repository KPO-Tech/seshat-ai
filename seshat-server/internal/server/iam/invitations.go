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

// InvitationPreview is what an anonymous, not-yet-authenticated invitee
// sees before logging in or registering - deliberately a small subset of
// Invitation (no id, no inviter, never the raw token) since
// LookupInvitationByToken has no auth check at all.
type InvitationPreview struct {
	OrganizationName string    `json:"organization_name"`
	Email            string    `json:"email"`
	Role             string    `json:"role"`
	ExpiresAt        time.Time `json:"expires_at"`
	Valid            bool      `json:"valid"`
}

// Invitation is the tenant-scoped invite model exposed by the API.
type Invitation struct {
	ID               string     `json:"id"`
	OrganizationID   string     `json:"organization_id"`
	Email            string     `json:"email"`
	Role             string     `json:"role"`
	Status           string     `json:"status"`
	Token            string     `json:"token,omitempty"`
	InvitedByUserID  string     `json:"invited_by_user_id"`
	AcceptedByUserID string     `json:"accepted_by_user_id"`
	CreatedAt        time.Time  `json:"created_at"`
	ExpiresAt        time.Time  `json:"expires_at"`
	AcceptedAt       *time.Time `json:"accepted_at,omitempty"`
	RevokedAt        *time.Time `json:"revoked_at,omitempty"`
}

// CreateInvitationParams creates a pending invite for one organization.
type CreateInvitationParams struct {
	OrganizationID string `json:"organization_id"`
	Email          string `json:"email"`
	Role           string `json:"role"`
	ExpiresInDays  int    `json:"expires_in_days"`
}

// AcceptInvitationParams accepts an invitation using the opaque token.
type AcceptInvitationParams struct {
	Token string `json:"token"`
}

// ListInvitations returns invitations visible to the caller.
var invitationSortFields = map[string]sdb.SortField{
	"created_at": {Column: "created_at"},
	"expires_at": {Column: "expires_at"},
	"email":      {Column: "email"},
	"role":       {Column: "role"},
	"status":     {Column: "status"},
}

var invitationSearchColumns = []string{
	"id", "organization_id", "email", "role", "status", "invited_by_user_id", "accepted_by_user_id",
}

// applyInvitationStatusFilter translates the caller-facing status (which
// includes the derived "expired" state effectiveInvitationStatus computes
// from expires_at, not a raw column value) into a real SQL condition.
func applyInvitationStatusFilter(query *gorm.DB, status string) *gorm.DB {
	switch status {
	case "":
		return query
	case "expired":
		return query.Where("status = ? AND expires_at <= ?", "pending", time.Now().UTC())
	case "pending":
		return query.Where("status = ? AND expires_at > ?", "pending", time.Now().UTC())
	default:
		return query.Where("status = ?", status)
	}
}

// ListInvitations returns a page of invitations, with search/sort/pagination
// applied in SQL.
func (s *Service) ListInvitations(ctx context.Context, principal *Principal, organizationID, status string, params sdb.ListParams) ([]Invitation, int64, error) {
	if principal == nil {
		return nil, 0, ErrUnauthorized("authentication required")
	}

	organizationID = strings.TrimSpace(organizationID)
	status = normalizeInvitationStatus(status)
	tx := s.db.Gorm().WithContext(ctx)

	query, allowed, err := restrictQueryToPrincipalOrganizations(tx.Model(&sdb.Invitation{}), principal, organizationID, "invitations.read", "invitations.manage", "members.manage", "organization.manage")
	if err != nil {
		return nil, 0, err
	}
	if !allowed {
		return []Invitation{}, 0, nil
	}
	sortField, err := sdb.ResolveSortField(invitationSortFields, params.Sort)
	if err != nil {
		return nil, 0, ErrInvalidInput(err.Error())
	}
	query = applyInvitationStatusFilter(query, status)
	query = sdb.ApplySearch(query, params.Search, invitationSearchColumns...)
	query = sdb.ApplySort(query, sortField, params.Order)

	records, total, err := sdb.Page[sdb.Invitation](query, params.Limit, params.Offset)
	if err != nil {
		return nil, 0, err
	}
	invitations := make([]Invitation, 0, len(records))
	for _, record := range records {
		invitations = append(invitations, toInvitation(record))
	}
	return invitations, total, nil
}

// GetInvitation loads one invitation for an org manager or the invited user.
func (s *Service) GetInvitation(ctx context.Context, principal *Principal, invitationID string) (*Invitation, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	invitationID = strings.TrimSpace(invitationID)
	if invitationID == "" {
		return nil, ErrInvalidInput("invitation_id is required")
	}

	tx := s.db.Gorm().WithContext(ctx)
	var record sdb.Invitation
	if err := tx.First(&record, "id = ?", invitationID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("invitation not found")
		}
		return nil, err
	}
	allowed := principal.User.IsAdmin || normalizeEmail(record.Email) == principal.User.Email
	if !allowed {
		ok, err := hasAnyOrganizationPermission(tx, principal, record.OrganizationID, "invitations.read", "invitations.manage", "members.manage", "organization.manage")
		if err != nil {
			return nil, err
		}
		allowed = ok
	}
	if !allowed {
		return nil, ErrForbidden("invitation access denied")
	}
	invitation := toInvitationWithEffectiveStatus(record)
	return &invitation, nil
}

// CreateInvitation issues a pending invite and returns the generated token.
func (s *Service) CreateInvitation(ctx context.Context, principal *Principal, params CreateInvitationParams) (*Invitation, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	email := normalizeEmail(params.Email)
	if organizationID == "" || email == "" {
		return nil, ErrInvalidInput("organization_id and email are required")
	}

	expiresInDays := params.ExpiresInDays
	if expiresInDays <= 0 {
		expiresInDays = 7
	}

	var invitation *Invitation
	var organizationName string
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
		if err := requireOrganizationPermission(tx, principal, organizationID, "invitations.manage", "members.manage", "organization.manage"); err != nil {
			return err
		}
		role, err := validateRoleCodeForOrganization(tx, organizationID, params.Role)
		if err != nil {
			return err
		}
		user, ok, err := findUserByEmail(tx, email)
		if err != nil {
			return err
		}
		if ok {
			_, exists, err := findMembershipByUserAndOrganization(tx, user.ID, organizationID)
			if err != nil {
				return err
			}
			if exists {
				return ErrConflict("user is already a member of the organization")
			}
		}
		var pending []sdb.Invitation
		if err := tx.Where("organization_id = ? AND email = ? AND status = ?", organizationID, email, "pending").Find(&pending).Error; err != nil {
			return err
		}
		for _, existing := range pending {
			if effectiveInvitationStatus(existing) == "pending" {
				return ErrConflict("an active invitation already exists for this email")
			}
		}

		now := time.Now().UTC()
		tokenValue, err := newToken()
		if err != nil {
			return err
		}
		rawToken := "invite_" + tokenValue
		invitationID, err := newID("inv")
		if err != nil {
			return err
		}
		record := sdb.Invitation{
			ID:               invitationID,
			OrganizationID:   organizationID,
			Email:            email,
			Role:             role,
			Status:           "pending",
			Token:            sdb.HashOpaqueToken(rawToken),
			InvitedByUserID:  principal.User.ID,
			AcceptedByUserID: "",
			CreatedAt:        now,
			ExpiresAt:        now.Add(time.Duration(expiresInDays) * 24 * time.Hour),
		}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		if err := appendAuditEvent(tx, principal, record.OrganizationID, "invitation.created", "invitation", record.ID, map[string]string{"email": record.Email, "role": record.Role}); err != nil {
			return err
		}
		converted := toInvitation(record)
		converted.Token = rawToken
		invitation = &converted
		return nil
	})
	if err != nil {
		return nil, err
	}
	s.sendInvitationEmail(ctx, invitation.Email, organizationName, invitation.Token)
	return invitation, nil
}

// sendInvitationEmail is best-effort and never returns an error to the
// caller - the invitation itself is already created and valid (the token
// can still be copy-pasted manually, see the console's fallback) whether
// or not delivery succeeds. Sent after the transaction commits, not inside
// it, so a slow/failing SMTP round-trip never holds a DB transaction open
// or rolls back an otherwise-successful invitation.
func (s *Service) sendInvitationEmail(ctx context.Context, toEmail, organizationName, rawToken string) {
	if s.mailer == nil || rawToken == "" {
		return
	}
	link := fmt.Sprintf("%s/accept-invitation?token=%s", s.publicAppURL, rawToken)
	body := fmt.Sprintf(
		"You've been invited to join %s on Seshat.\n\nAccept your invitation:\n%s\n\nThis link expires in a few days.",
		organizationName, link,
	)
	err := s.mailer.Send(ctx, mailer.Message{
		To:       toEmail,
		Subject:  fmt.Sprintf("You've been invited to join %s on Seshat", organizationName),
		TextBody: body,
	})
	if err != nil {
		slog.Warn("iam: failed to send invitation email", "email", toEmail, "error", err)
	}
}

// AcceptInvitation redeems a pending invitation for the authenticated user.
func (s *Service) AcceptInvitation(ctx context.Context, principal *Principal, params AcceptInvitationParams) (*Membership, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	token := strings.TrimSpace(params.Token)
	if token == "" {
		return nil, ErrInvalidInput("token is required")
	}

	var membership *Membership
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		record, ok, err := findInvitationByToken(tx, token)
		if err != nil {
			return err
		}
		if !ok {
			return ErrNotFound("invitation not found")
		}
		if effectiveInvitationStatus(record) != "pending" {
			return ErrConflict("invitation is no longer active")
		}
		if normalizeEmail(record.Email) != principal.User.Email {
			return ErrForbidden("invitation email does not match the authenticated user")
		}
		var orgCount int64
		if err := tx.Model(&sdb.Organization{}).Where("id = ?", record.OrganizationID).Count(&orgCount).Error; err != nil {
			return err
		}
		if orgCount == 0 {
			return ErrNotFound("organization not found")
		}
		_, exists, err := findMembershipByUserAndOrganization(tx, principal.User.ID, record.OrganizationID)
		if err != nil {
			return err
		}
		if exists {
			return ErrConflict("membership already exists")
		}
		if hasAny, err := userHasAnyMembership(tx, principal.User.ID); err != nil {
			return err
		} else if hasAny {
			return ErrConflict("user already belongs to an organization")
		}

		role, err := validateRoleCodeForOrganization(tx, record.OrganizationID, record.Role)
		if err != nil {
			return err
		}

		now := time.Now().UTC()
		membershipID, err := newID("mem")
		if err != nil {
			return err
		}
		membershipRecord := sdb.Membership{
			ID:             membershipID,
			UserID:         principal.User.ID,
			OrganizationID: record.OrganizationID,
			Role:           role,
			CreatedAt:      now,
		}
		if err := tx.Create(&membershipRecord).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("user already belongs to an organization")
			}
			return err
		}

		record.Status = "accepted"
		record.AcceptedByUserID = principal.User.ID
		record.AcceptedAt = &now
		if err := tx.Save(&record).Error; err != nil {
			return err
		}
		if err := appendAuditEvent(tx, principal, record.OrganizationID, "invitation.accepted", "invitation", record.ID, map[string]string{"email": record.Email, "accepted_by_user_id": principal.User.ID}); err != nil {
			return err
		}

		converted := toMembership(membershipRecord)
		membership = &converted
		return nil
	})
	return membership, err
}

// LookupInvitationByToken is deliberately unauthenticated - the invited
// person usually doesn't have an account yet, so gating the preview behind
// login would be backwards. Returns Valid=false (not an error) for an
// unknown or no-longer-pending token, so the console can render "this
// invitation is no longer valid" instead of a raw error.
func (s *Service) LookupInvitationByToken(ctx context.Context, token string) (*InvitationPreview, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, ErrInvalidInput("token is required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	record, ok, err := findInvitationByToken(tx, token)
	if err != nil {
		return nil, err
	}
	if !ok || effectiveInvitationStatus(record) != "pending" {
		return &InvitationPreview{Valid: false}, nil
	}
	var org sdb.Organization
	if err := tx.First(&org, "id = ?", record.OrganizationID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &InvitationPreview{Valid: false}, nil
		}
		return nil, err
	}
	return &InvitationPreview{
		OrganizationName: org.Name,
		Email:            record.Email,
		Role:             record.Role,
		ExpiresAt:        record.ExpiresAt,
		Valid:            true,
	}, nil
}

// RevokeInvitation invalidates a pending invitation without granting access.
func (s *Service) RevokeInvitation(ctx context.Context, principal *Principal, invitationID string) (*Invitation, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	invitationID = strings.TrimSpace(invitationID)
	if invitationID == "" {
		return nil, ErrInvalidInput("invitation_id is required")
	}

	var invitation *Invitation
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Invitation
		if err := tx.First(&record, "id = ?", invitationID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("invitation not found")
			}
			return err
		}
		if err := requireOrganizationPermission(tx, principal, record.OrganizationID, "invitations.manage", "members.manage", "organization.manage"); err != nil {
			return err
		}
		if effectiveInvitationStatus(record) != "pending" {
			return ErrConflict("invitation is no longer active")
		}
		now := time.Now().UTC()
		record.Status = "revoked"
		record.RevokedAt = &now
		if err := tx.Save(&record).Error; err != nil {
			return err
		}
		if err := appendAuditEvent(tx, principal, record.OrganizationID, "invitation.revoked", "invitation", record.ID, map[string]string{"email": record.Email}); err != nil {
			return err
		}
		converted := toInvitation(record)
		invitation = &converted
		return nil
	})
	return invitation, err
}

func toInvitation(record sdb.Invitation) Invitation {
	return Invitation{
		ID:               record.ID,
		OrganizationID:   record.OrganizationID,
		Email:            record.Email,
		Role:             record.Role,
		Status:           record.Status,
		Token:            "",
		InvitedByUserID:  record.InvitedByUserID,
		AcceptedByUserID: record.AcceptedByUserID,
		CreatedAt:        record.CreatedAt,
		ExpiresAt:        record.ExpiresAt,
		AcceptedAt:       record.AcceptedAt,
		RevokedAt:        record.RevokedAt,
	}
}

func toInvitationWithEffectiveStatus(record sdb.Invitation) Invitation {
	invitation := toInvitation(record)
	invitation.Status = effectiveInvitationStatus(record)
	return invitation
}

func effectiveInvitationStatus(record sdb.Invitation) string {
	if record.Status == "pending" && record.ExpiresAt.Before(time.Now().UTC()) {
		return "expired"
	}
	return normalizeInvitationStatus(record.Status)
}

func normalizeInvitationStatus(status string) string {
	return strings.ToLower(strings.TrimSpace(status))
}

func findInvitationByToken(tx *gorm.DB, token string) (sdb.Invitation, bool, error) {
	var invitation sdb.Invitation
	err := tx.Where("token = ?", sdb.HashOpaqueToken(token)).First(&invitation).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return sdb.Invitation{}, false, nil
		}
		return sdb.Invitation{}, false, err
	}
	return invitation, true, nil
}
