package iam

import (
	"context"
	"testing"
	"time"

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

// TestPlatformAdminCanOnlyBeGrantedByEnvSeeding is a security-regression
// test: there must be exactly one sanctioned path to platform-admin status
// (EnsureSuperAdmin, seeded from env vars at boot) - CreateUser and
// UpdateUser must never be able to mint or promote one, not even when
// called by an existing platform admin. A prior version of this codebase
// let any platform admin grant is_admin to an arbitrary user via the
// console's Memberships page; that capability was removed entirely.
func TestPlatformAdminCanOnlyBeGrantedByEnvSeeding(t *testing.T) {
	service := newTestService(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	adminPrincipal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}

	// CreateUser, called by an existing platform admin, must never produce
	// another platform admin - CreateUserParams has no IsAdmin field at all
	// (compile-time guarantee), and the created user's IsAdmin must be false.
	created, err := service.CreateUser(context.Background(), adminPrincipal, CreateUserParams{
		Email: "regular@example.com", Password: "password123", DisplayName: "Regular User",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	if created.IsAdmin {
		t.Fatal("expected a user created via CreateUser to never be a platform admin")
	}

	// UpdateUser, called by an existing platform admin, must never be able
	// to promote an existing user either - UpdateUserParams has no IsAdmin
	// field at all (compile-time guarantee); confirm the target's IsAdmin
	// stays false after an update.
	updated, err := service.UpdateUser(context.Background(), adminPrincipal, created.ID, UpdateUserParams{
		Email: "regular@example.com", DisplayName: "Still Regular",
	})
	if err != nil {
		t.Fatalf("update user: %v", err)
	}
	if updated.IsAdmin {
		t.Fatal("expected UpdateUser to never grant platform admin")
	}

	// The only sanctioned path: EnsureSuperAdmin at a distinct, specific
	// seeded email. It must never touch the already-created regular user.
	if err := service.EnsureSuperAdmin(context.Background(), "regular@example.com", "differentpassword123"); err != nil {
		t.Fatalf("ensure super admin: %v", err)
	}
	stillRegular, err := service.GetUser(context.Background(), adminPrincipal, created.ID)
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	if stillRegular.IsAdmin {
		t.Fatal("expected EnsureSuperAdmin to no-op (not promote) an existing user found by email")
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

	// A second platform-admin principal is needed here only as a vehicle
	// capable of calling DeleteUser (requireAdmin-gated) - platform-admin
	// status can no longer be granted via CreateUser (see
	// UpdateUserParams' doc comment), so EnsureSuperAdmin (a second,
	// distinct seeded email) is the only sanctioned way to get one in a
	// test now, matching production reality.
	if err := service.EnsureSuperAdmin(context.Background(), "admin2@example.com", "password123"); err != nil {
		t.Fatalf("seed second admin: %v", err)
	}
	secondAdminLogin, err := service.Login(context.Background(), "admin2@example.com", "password123")
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

	// A second, distinct organization owner - deliberately NOT the platform
	// admin itself, which holds zero memberships by design (see
	// EnsureSuperAdmin's doc comment).
	if _, err := service.CreateOrganizationMember(context.Background(), secondAdminPrincipal, CreateOrganizationMemberParams{
		OrganizationID: orgID, Email: "second-owner@example.com", DisplayName: "Second Owner", Role: "owner",
	}); err != nil {
		t.Fatalf("create second owner: %v", err)
	}
	if err := service.DeleteUser(context.Background(), secondAdminPrincipal, ownerPrincipal.User.ID); err != nil {
		t.Fatalf("expected deleting the user to succeed once another owner exists: %v", err)
	}
}

// TestDeleteUserRequiresFreshAuth proves the step-up gate itself (see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 9) - a
// platform-admin with full requireAdmin standing is still rejected if
// their own session hasn't proven identity recently enough, and the
// target user survives untouched.
func TestDeleteUserRequiresFreshAuth(t *testing.T) {
	service := newTestService(t)

	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
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
		Email: "member@example.com", Password: "password123", DisplayName: "Member",
		OrganizationID: orgID, Role: "member",
	})
	if err != nil {
		t.Fatalf("create member: %v", err)
	}
	adminPrincipal.Session.ReauthenticatedAt = time.Now().UTC().Add(-stepUpFreshnessTTL - time.Minute)

	if err := service.DeleteUser(context.Background(), adminPrincipal, member.ID); err == nil {
		t.Fatal("expected a stale session to be denied user deletion")
	}
	if _, err := service.GetUser(context.Background(), adminPrincipal, member.ID); err != nil {
		t.Fatalf("expected the user to still exist after a rejected deletion, got: %v", err)
	}
}
