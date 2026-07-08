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
