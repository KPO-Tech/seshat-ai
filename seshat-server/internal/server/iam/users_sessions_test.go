package iam

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func TestGetUpdateDeleteUserFlow(t *testing.T) {
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

	user, err := service.CreateUser(context.Background(), principal, CreateUserParams{
		Email:       "user@example.com",
		Password:    "password123",
		DisplayName: "User",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	loadedUser, err := service.GetUser(context.Background(), principal, user.ID)
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	if loadedUser.ID != user.ID {
		t.Fatalf("unexpected user id: %s", loadedUser.ID)
	}

	updatedUser, err := service.UpdateUser(context.Background(), principal, user.ID, UpdateUserParams{
		Email:       "updated@example.com",
		DisplayName: "Updated User",
		IsAdmin:     false,
	})
	if err != nil {
		t.Fatalf("update user: %v", err)
	}
	if updatedUser.Email != "updated@example.com" {
		t.Fatalf("unexpected updated email: %s", updatedUser.Email)
	}

	if err := service.DeleteUser(context.Background(), principal, user.ID); err != nil {
		t.Fatalf("delete user: %v", err)
	}
	if _, err := service.GetUser(context.Background(), principal, user.ID); err == nil {
		t.Fatal("expected deleted user to be missing")
	}
}

func TestListAndRevokeSessionsFlow(t *testing.T) {
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

	user, err := service.CreateUser(context.Background(), principal, CreateUserParams{
		Email:       "member@example.com",
		Password:    "password123",
		DisplayName: "Member",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	loginA, err := service.Login(context.Background(), user.Email, "password123")
	if err != nil {
		t.Fatalf("login A: %v", err)
	}
	loginB, err := service.Login(context.Background(), user.Email, "password123")
	if err != nil {
		t.Fatalf("login B: %v", err)
	}

	sessions, _, err := service.ListSessions(context.Background(), principal, ListSessionsParams{UserID: user.ID}, sdb.ListParams{Sort: "created_at", Order: "desc", Limit: 50})
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if len(sessions) != 2 {
		t.Fatalf("expected two sessions, got %d", len(sessions))
	}
	if sessions[0].ID == "" {
		t.Fatal("expected stable session id")
	}

	if err := service.RevokeSession(context.Background(), principal, sessions[0].ID); err != nil {
		t.Fatalf("revoke one session: %v", err)
	}
	remaining, _, err := service.ListSessions(context.Background(), principal, ListSessionsParams{UserID: user.ID}, sdb.ListParams{Sort: "created_at", Order: "desc", Limit: 50})
	if err != nil {
		t.Fatalf("list remaining sessions: %v", err)
	}
	if len(remaining) != 1 {
		t.Fatalf("expected one remaining session, got %d", len(remaining))
	}

	revokedCount, err := service.RevokeUserSessions(context.Background(), principal, user.ID)
	if err != nil {
		t.Fatalf("revoke user sessions: %v", err)
	}
	if revokedCount != 1 {
		t.Fatalf("expected one revoked session, got %d", revokedCount)
	}

	if _, err := service.ResolvePrincipal(context.Background(), loginA.Token); err == nil {
		t.Fatal("expected revoked session token to be invalid")
	}
	if _, err := service.ResolvePrincipal(context.Background(), loginB.Token); err == nil {
		t.Fatal("expected revoked session token to be invalid")
	}
}

func TestDeleteUserRejectsDeletingTheLastOrganizationOwner(t *testing.T) {
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
	ownerPrincipal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve owner principal: %v", err)
	}
	orgID := boot.Organizations[0].ID

	secondAdmin, err := service.CreateUser(context.Background(), ownerPrincipal, CreateUserParams{
		Email:       "admin2@example.com",
		Password:    "password123",
		DisplayName: "Second Admin",
		IsAdmin:     true,
	})
	if err != nil {
		t.Fatalf("create second admin: %v", err)
	}
	secondAdminLogin, err := service.Login(context.Background(), secondAdmin.Email, "password123")
	if err != nil {
		t.Fatalf("login second admin: %v", err)
	}
	secondAdminPrincipal, err := service.ResolvePrincipal(context.Background(), secondAdminLogin.Token)
	if err != nil {
		t.Fatalf("resolve second admin principal: %v", err)
	}

	if err := service.DeleteUser(context.Background(), secondAdminPrincipal, ownerPrincipal.User.ID); err == nil {
		t.Fatal("expected deleting the last organization owner to be rejected")
	}

	if _, err := service.CreateMembership(context.Background(), secondAdminPrincipal, CreateMembershipParams{
		OrganizationID: orgID,
		UserID:         secondAdmin.ID,
		Role:           "owner",
	}); err != nil {
		t.Fatalf("create second owner membership: %v", err)
	}
	if err := service.DeleteUser(context.Background(), secondAdminPrincipal, ownerPrincipal.User.ID); err != nil {
		t.Fatalf("expected deleting the user to succeed once another owner exists: %v", err)
	}
}
