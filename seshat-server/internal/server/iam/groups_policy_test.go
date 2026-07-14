package iam

import (
	"context"
	"testing"
)

func TestGroupPolicyBindingGrantsInvitationManagement(t *testing.T) {
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

	member, err := service.CreateUser(context.Background(), adminPrincipal, CreateUserParams{
		Email:       "member@example.com",
		Password:    "password123",
		DisplayName: "Member",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	if _, err := service.CreateMembership(context.Background(), adminPrincipal, CreateMembershipParams{
		OrganizationID: orgID,
		UserID:         member.ID,
		Role:           "viewer",
	}); err != nil {
		t.Fatalf("create membership: %v", err)
	}

	memberLogin, err := service.Login(context.Background(), member.Email, "password123")
	if err != nil {
		t.Fatalf("login member: %v", err)
	}
	memberPrincipal, err := service.ResolvePrincipal(context.Background(), memberLogin.Token)
	if err != nil {
		t.Fatalf("resolve member principal: %v", err)
	}

	if _, err := service.CreateInvitation(context.Background(), memberPrincipal, CreateInvitationParams{
		OrganizationID: orgID,
		Email:          "future-user@example.com",
		Role:           "viewer",
		ExpiresInDays:  7,
	}); err == nil {
		t.Fatal("expected member invitation creation to fail before policy binding")
	}

	group, err := service.CreateGroup(context.Background(), adminPrincipal, CreateGroupParams{
		OrganizationID: orgID,
		Name:           "Support Operators",
		Slug:           "support-operators",
		Description:    "Delegated support team",
		MemberUserIDs:  []string{member.ID},
	})
	if err != nil {
		t.Fatalf("create group: %v", err)
	}

	if _, err := service.CreatePolicyBinding(context.Background(), adminPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgID,
		Name:            "Support Invitations",
		Description:     "Allow the support team to invite users.",
		SubjectType:     "group",
		SubjectID:       group.ID,
		PermissionCodes: []string{"invitations.manage"},
	}); err != nil {
		t.Fatalf("create policy binding: %v", err)
	}

	if _, err := service.CreateInvitation(context.Background(), memberPrincipal, CreateInvitationParams{
		OrganizationID: orgID,
		Email:          "future-user@example.com",
		Role:           "viewer",
		ExpiresInDays:  7,
	}); err != nil {
		t.Fatalf("expected member invitation creation to succeed after binding: %v", err)
	}
}
