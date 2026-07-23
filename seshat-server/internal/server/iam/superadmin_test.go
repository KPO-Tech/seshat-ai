package iam

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func TestEnsureSuperAdminCreatesAdminOnFirstRun(t *testing.T) {
	service := newTestService(t)

	if err := service.EnsureSuperAdmin(context.Background(), "admin@example.com", "password123"); err != nil {
		t.Fatalf("ensure super admin: %v", err)
	}

	login, err := service.Login(context.Background(), "admin@example.com", "password123")
	if err != nil {
		t.Fatalf("login as seeded admin: %v", err)
	}
	principal, err := service.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve seeded admin principal: %v", err)
	}
	if !principal.User.IsAdmin {
		t.Fatal("expected the seeded user to be a platform super-admin")
	}
	if len(principal.Memberships) != 0 {
		t.Fatalf("expected the seeded super-admin to hold no organization membership, got %+v", principal.Memberships)
	}
}

func TestEnsureSuperAdminIsIdempotentAcrossRestarts(t *testing.T) {
	service := newTestService(t)

	if err := service.EnsureSuperAdmin(context.Background(), "admin@example.com", "password123"); err != nil {
		t.Fatalf("ensure super admin (first boot): %v", err)
	}
	// A second call (simulating a server restart with the same env vars, or
	// even a changed password left in the env) must never touch the
	// already-seeded account.
	if err := service.EnsureSuperAdmin(context.Background(), "admin@example.com", "some-different-password"); err != nil {
		t.Fatalf("ensure super admin (second boot): %v", err)
	}

	login, err := service.Login(context.Background(), "admin@example.com", "password123")
	if err != nil {
		t.Fatalf("expected login with the original password to still work: %v", err)
	}
	if _, err := service.Login(context.Background(), "admin@example.com", "some-different-password"); err == nil {
		t.Fatal("expected login with the second call's password to fail - existing accounts must never be overwritten")
	}
	principal, err := service.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}

	_, total, err := service.ListUsers(context.Background(), principal, sdb.ListParams{Sort: "email", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list users: %v", err)
	}
	if total != 1 {
		t.Fatalf("expected exactly one seeded user across both calls, got %d", total)
	}
}

func TestEnsureSuperAdminNoOpsWhenUnset(t *testing.T) {
	service := newTestService(t)

	if err := service.EnsureSuperAdmin(context.Background(), "", ""); err != nil {
		t.Fatalf("ensure super admin with empty config: %v", err)
	}
	initialized, err := service.BootstrapStatus(context.Background())
	if err != nil {
		t.Fatalf("bootstrap status: %v", err)
	}
	if initialized {
		t.Fatal("expected no user to have been created when admin email/password are unset")
	}
}
