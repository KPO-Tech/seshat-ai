package iam

import (
	"context"
	"testing"
)

func TestMembershipManagementRequiresPermission(t *testing.T) {
	service, adminPrincipal, memberPrincipal, orgID := bootstrapWithMember(t, "member")

	other, err := service.CreateUser(context.Background(), adminPrincipal, CreateUserParams{
		Email:       "other@example.com",
		Password:    "password123",
		DisplayName: "Other",
	})
	if err != nil {
		t.Fatalf("create other user: %v", err)
	}

	if _, err := service.CreateMembership(context.Background(), memberPrincipal, CreateMembershipParams{
		OrganizationID: orgID,
		UserID:         other.ID,
		Role:           "viewer",
	}); err == nil {
		t.Fatal("expected a member to be denied adding another member")
	}

	membership, err := service.CreateMembership(context.Background(), adminPrincipal, CreateMembershipParams{
		OrganizationID: orgID,
		UserID:         other.ID,
		Role:           "viewer",
	})
	if err != nil {
		t.Fatalf("create membership as admin: %v", err)
	}

	if _, err := service.UpdateMembership(context.Background(), memberPrincipal, membership.ID, UpdateMembershipParams{Role: "admin"}); err == nil {
		t.Fatal("expected a member to be denied promoting another member")
	}
	if err := service.DeleteMembership(context.Background(), memberPrincipal, membership.ID); err == nil {
		t.Fatal("expected a member to be denied removing another member")
	}
}

// TestCreateMembershipRejectsUserAlreadyInAnotherOrganization locks in the
// one-org-per-user invariant on the "add an existing user to an org" path —
// distinct from self-serve organization creation, since here the target user
// isn't the one making the call.
func TestCreateMembershipRejectsUserAlreadyInAnotherOrganization(t *testing.T) {
	service, adminPrincipal, memberPrincipal, _ := bootstrapWithMember(t, "member")

	otherOrg, err := service.CreateOrganization(context.Background(), adminPrincipal, CreateOrganizationParams{
		Name: "Other Co",
		Slug: "other-co",
	})
	if err != nil {
		t.Fatalf("create other organization: %v", err)
	}

	if _, err := service.CreateMembership(context.Background(), adminPrincipal, CreateMembershipParams{
		OrganizationID: otherOrg.ID,
		UserID:         memberPrincipal.User.ID,
		Role:           "viewer",
	}); err == nil {
		t.Fatal("expected adding a user already in another organization to fail")
	}
}
