package iam

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func TestRolesAndMembershipManagementFlow(t *testing.T) {
	service := newTestService(t)

	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email:            "admin@example.com",
		Password:         "password123",
		DisplayName:      "Admin",
		OrganizationName: "Seshat",
		OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	principal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	orgID := boot.Organizations[0].ID

	roles, err := service.ListRoles(context.Background(), principal, orgID)
	if err != nil {
		t.Fatalf("list roles: %v", err)
	}
	if len(roles) < 4 {
		t.Fatalf("expected role catalog, got %d roles", len(roles))
	}

	user, err := service.CreateUser(context.Background(), principal, CreateUserParams{
		Email:       "member@example.com",
		Password:    "password123",
		DisplayName: "Member",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	membership, err := service.CreateMembership(context.Background(), principal, CreateMembershipParams{
		OrganizationID: orgID,
		UserID:         user.ID,
		Role:           "viewer",
	})
	if err != nil {
		t.Fatalf("create membership: %v", err)
	}
	if membership.Role != "viewer" {
		t.Fatalf("unexpected membership role: %s", membership.Role)
	}

	loadedMembership, err := service.GetMembership(context.Background(), principal, membership.ID)
	if err != nil {
		t.Fatalf("get membership: %v", err)
	}
	if loadedMembership.ID != membership.ID {
		t.Fatalf("unexpected membership id: %s", loadedMembership.ID)
	}

	updatedMembership, err := service.UpdateMembership(context.Background(), principal, membership.ID, UpdateMembershipParams{Role: "admin"})
	if err != nil {
		t.Fatalf("update membership: %v", err)
	}
	if updatedMembership.Role != "admin" {
		t.Fatalf("unexpected updated role: %s", updatedMembership.Role)
	}

	memberships, _, err := service.ListMemberships(context.Background(), principal, orgID, "", sdb.ListParams{Sort: "created_at", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list memberships: %v", err)
	}
	if len(memberships) != 2 {
		t.Fatalf("expected two memberships, got %d", len(memberships))
	}
}

func TestInvitationAcceptAndRevokeFlow(t *testing.T) {
	service := newTestService(t)

	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email:            "admin@example.com",
		Password:         "password123",
		DisplayName:      "Admin",
		OrganizationName: "Seshat",
		OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	adminPrincipal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve admin principal: %v", err)
	}
	orgID := boot.Organizations[0].ID

	invitee, err := service.CreateUser(context.Background(), adminPrincipal, CreateUserParams{
		Email:       "invitee@example.com",
		Password:    "password123",
		DisplayName: "Invitee",
	})
	if err != nil {
		t.Fatalf("create invitee user: %v", err)
	}

	invitation, err := service.CreateInvitation(context.Background(), adminPrincipal, CreateInvitationParams{
		OrganizationID: orgID,
		Email:          invitee.Email,
		Role:           "member",
		ExpiresInDays:  14,
	})
	if err != nil {
		t.Fatalf("create invitation: %v", err)
	}
	if invitation.Token == "" {
		t.Fatal("expected invitation token")
	}

	inviteeLogin, err := service.Login(context.Background(), invitee.Email, "password123")
	if err != nil {
		t.Fatalf("login invitee: %v", err)
	}
	inviteePrincipal, err := service.ResolvePrincipal(context.Background(), inviteeLogin.Token)
	if err != nil {
		t.Fatalf("resolve invitee principal: %v", err)
	}

	acceptedMembership, err := service.AcceptInvitation(context.Background(), inviteePrincipal, AcceptInvitationParams{Token: invitation.Token})
	if err != nil {
		t.Fatalf("accept invitation: %v", err)
	}
	if acceptedMembership.UserID != invitee.ID {
		t.Fatalf("unexpected membership user id: %s", acceptedMembership.UserID)
	}

	loadedInvitation, err := service.GetInvitation(context.Background(), adminPrincipal, invitation.ID)
	if err != nil {
		t.Fatalf("get invitation: %v", err)
	}
	if loadedInvitation.Status != "accepted" {
		t.Fatalf("unexpected accepted invitation status: %s", loadedInvitation.Status)
	}

	revokedInvitation, err := service.CreateInvitation(context.Background(), adminPrincipal, CreateInvitationParams{
		OrganizationID: orgID,
		Email:          "future-user@example.com",
		Role:           "viewer",
		ExpiresInDays:  3,
	})
	if err != nil {
		t.Fatalf("create revokable invitation: %v", err)
	}

	revokedInvitation, err = service.RevokeInvitation(context.Background(), adminPrincipal, revokedInvitation.ID)
	if err != nil {
		t.Fatalf("revoke invitation: %v", err)
	}
	if revokedInvitation.Status != "revoked" {
		t.Fatalf("unexpected revoked status: %s", revokedInvitation.Status)
	}

	invitations, _, err := service.ListInvitations(context.Background(), adminPrincipal, orgID, "", sdb.ListParams{Sort: "created_at", Order: "desc", Limit: 50})
	if err != nil {
		t.Fatalf("list invitations: %v", err)
	}
	if len(invitations) != 2 {
		t.Fatalf("expected two invitations, got %d", len(invitations))
	}
}

// TestAcceptInvitationRejectsUserAlreadyInAnotherOrganization locks in the
// one-org-per-user invariant on the invitation-accept path: a user already
// belonging to one organization cannot accept an invitation into a second.
func TestAcceptInvitationRejectsUserAlreadyInAnotherOrganization(t *testing.T) {
	service, adminPrincipal, memberPrincipal, _ := bootstrapWithMember(t, "member")

	otherOrg, err := service.CreateOrganization(context.Background(), adminPrincipal, CreateOrganizationParams{
		Name: "Other Co",
		Slug: "other-co",
	})
	if err != nil {
		t.Fatalf("create other organization: %v", err)
	}

	invitation, err := service.CreateInvitation(context.Background(), adminPrincipal, CreateInvitationParams{
		OrganizationID: otherOrg.ID,
		Email:          memberPrincipal.User.Email,
		Role:           "viewer",
		ExpiresInDays:  14,
	})
	if err != nil {
		t.Fatalf("create invitation: %v", err)
	}

	if _, err := service.AcceptInvitation(context.Background(), memberPrincipal, AcceptInvitationParams{Token: invitation.Token}); err == nil {
		t.Fatal("expected accepting an invitation to fail for a user already in another organization")
	}
}
