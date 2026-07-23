package iam

import (
	"context"
	"slices"
	"testing"
)

// TestMembershipResponsesIncludeResolvedPermissions locks in that every path
// producing a Membership for a client (bootstrap, register, login - which
// covers /auth/me too since ResolvePrincipal/membershipsByUser share the same
// helper) includes the resolved effective permission set for that
// membership's role, not just the raw role code. The console gates access to
// an organization's management UI on the "organization.manage" permission
// rather than hardcoding role names, precisely so a custom role can also
// qualify - this test is the contract that makes that possible.
func TestMembershipResponsesIncludeResolvedPermissions(t *testing.T) {
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
	if len(boot.Memberships) != 1 {
		t.Fatalf("expected one membership from bootstrap, got %d", len(boot.Memberships))
	}
	if !slices.Contains(boot.Memberships[0].Permissions, "organization.manage") {
		t.Fatalf("expected the bootstrap owner membership to include organization.manage, got %v", boot.Memberships[0].Permissions)
	}
	adminPrincipal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve admin principal: %v", err)
	}
	orgID := boot.Organizations[0].ID

	// A plain "member" role must NOT have organization.manage.
	if _, err := service.CreateUser(context.Background(), adminPrincipal, CreateUserParams{
		Email:          "member@example.com",
		Password:       "password123",
		DisplayName:    "Member",
		OrganizationID: orgID,
		Role:           "member",
	}); err != nil {
		t.Fatalf("create member user: %v", err)
	}
	memberLogin, err := service.Login(context.Background(), "member@example.com", "password123")
	if err != nil {
		t.Fatalf("login as member: %v", err)
	}
	if len(memberLogin.Memberships) != 1 {
		t.Fatalf("expected one membership for member, got %d", len(memberLogin.Memberships))
	}
	if slices.Contains(memberLogin.Memberships[0].Permissions, "organization.manage") {
		t.Fatalf("expected a plain member role to NOT include organization.manage, got %v", memberLogin.Memberships[0].Permissions)
	}
	if !slices.Contains(memberLogin.Memberships[0].Permissions, "organization.use") {
		t.Fatalf("expected a member role to include organization.use, got %v", memberLogin.Memberships[0].Permissions)
	}

	// A custom role granted organization.manage must be treated the same as
	// admin/owner for gating purposes - permission-based, not role-name-based.
	if _, err := service.CreateRole(context.Background(), adminPrincipal, CreateRoleParams{
		OrganizationID: orgID,
		Code:           "manager",
		Name:           "Manager",
		Permissions:    []string{"organization.manage", "members.read"},
	}); err != nil {
		t.Fatalf("create custom manager role: %v", err)
	}
	if _, err := service.CreateUser(context.Background(), adminPrincipal, CreateUserParams{
		Email:          "manager@example.com",
		Password:       "password123",
		DisplayName:    "Manager",
		OrganizationID: orgID,
		Role:           "manager",
	}); err != nil {
		t.Fatalf("create manager user: %v", err)
	}
	managerLogin, err := service.Login(context.Background(), "manager@example.com", "password123")
	if err != nil {
		t.Fatalf("login as manager: %v", err)
	}
	if !slices.Contains(managerLogin.Memberships[0].Permissions, "organization.manage") {
		t.Fatalf("expected the custom manager role to include organization.manage, got %v", managerLogin.Memberships[0].Permissions)
	}
}
