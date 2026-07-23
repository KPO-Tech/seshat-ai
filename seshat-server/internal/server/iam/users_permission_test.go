package iam

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func TestOnlyAdminCanListOrManageUsers(t *testing.T) {
	service, _, memberPrincipal, _ := bootstrapWithMember(t, "member")

	if _, _, err := service.ListUsers(context.Background(), memberPrincipal, sdb.ListParams{Sort: "email", Order: "asc", Limit: 50}); err == nil {
		t.Fatal("expected a non-admin to be denied listing users")
	}
	if _, err := service.UpdateUser(context.Background(), memberPrincipal, memberPrincipal.User.ID, UpdateUserParams{
		Email:       memberPrincipal.User.Email,
		DisplayName: "New Name",
	}); err == nil {
		t.Fatal("expected a non-admin to be denied updating a user, even themselves")
	}
	if err := service.DeleteUser(context.Background(), memberPrincipal, memberPrincipal.User.ID); err == nil {
		t.Fatal("expected a non-admin to be denied deleting a user")
	}
}

func TestGetUserIsRestrictedToAdminOrSelf(t *testing.T) {
	service, adminPrincipal, memberPrincipal, _ := bootstrapWithMember(t, "member")

	if _, err := service.GetUser(context.Background(), memberPrincipal, memberPrincipal.User.ID); err != nil {
		t.Fatalf("expected a user to view themself: %v", err)
	}
	if _, err := service.GetUser(context.Background(), memberPrincipal, adminPrincipal.User.ID); err == nil {
		t.Fatal("expected a non-admin to be denied viewing another user")
	}
}

func TestChangePasswordRequiresCorrectCurrentPassword(t *testing.T) {
	service, _, memberPrincipal, _ := bootstrapWithMember(t, "member")

	if err := service.ChangePassword(context.Background(), memberPrincipal, ChangePasswordParams{
		CurrentPassword: "wrong-password",
		NewPassword:     "newpassword123",
	}); err == nil {
		t.Fatal("expected changing the password with the wrong current password to fail")
	}

	// The password must be unchanged: logging in with the original still works.
	if _, err := service.Login(context.Background(), memberPrincipal.User.Email, "password123"); err != nil {
		t.Fatalf("expected the original password to still work after a rejected attempt: %v", err)
	}
}

func TestChangePasswordUpdatesHash(t *testing.T) {
	service, _, memberPrincipal, _ := bootstrapWithMember(t, "member")

	if err := service.ChangePassword(context.Background(), memberPrincipal, ChangePasswordParams{
		CurrentPassword: "password123",
		NewPassword:     "newpassword123",
	}); err != nil {
		t.Fatalf("change password: %v", err)
	}

	if _, err := service.Login(context.Background(), memberPrincipal.User.Email, "password123"); err == nil {
		t.Fatal("expected the old password to no longer work")
	}
	if _, err := service.Login(context.Background(), memberPrincipal.User.Email, "newpassword123"); err != nil {
		t.Fatalf("expected login with the new password to succeed: %v", err)
	}
}
