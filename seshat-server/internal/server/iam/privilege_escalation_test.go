package iam

import (
	"context"
	"strings"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// These are regression tests for the 2026-08-06 audit finding: an org
// "admin" (system role) holds members.manage/policies.manage/roles.manage
// but deliberately NOT organization.delete (only "owner" has that). Before
// requirePermissionsWithinCallerScope existed, an admin could still obtain
// organization.delete three different ways — promoting a membership to
// "owner", creating a policy binding granting it directly, or defining a
// custom role that includes it and assigning that role. All three must now
// be rejected.

// bootstrapWithOrgAdmin mirrors bootstrapWithMember, but for the "admin" role
// specifically: bootstrapWithMember derives its second user's email as
// "<role>@example.com", which for role="admin" collides with the platform
// bootstrap admin's own "admin@example.com" — so it's called directly here
// with a distinct email instead of reusing that helper.
func bootstrapWithOrgAdmin(t *testing.T) (service *Service, orgAdminPrincipal *Principal, organizationID string) {
	t.Helper()
	service = newTestService(t)

	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email:            "platform-owner@example.com",
		Password:         "password123",
		DisplayName:      "Platform Owner",
		OrganizationName: "Seshat",
		OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	platformAdminPrincipal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve platform admin principal: %v", err)
	}
	organizationID = boot.Organizations[0].ID

	orgAdmin, err := service.CreateUser(context.Background(), platformAdminPrincipal, CreateUserParams{
		Email:          "org-admin@example.com",
		Password:       "password123",
		DisplayName:    "Org Admin",
		OrganizationID: organizationID,
		Role:           "admin",
	})
	if err != nil {
		t.Fatalf("create org admin user: %v", err)
	}
	login, err := service.Login(context.Background(), orgAdmin.Email, "password123")
	if err != nil {
		t.Fatalf("login org admin: %v", err)
	}
	orgAdminPrincipal, err = service.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve org admin principal: %v", err)
	}
	return service, orgAdminPrincipal, organizationID
}

func TestUpdateMembershipCannotEscalateAboveCallerPermissions(t *testing.T) {
	service, adminPrincipal, orgID := bootstrapWithOrgAdmin(t)

	// Find the admin's own membership to attempt self-promotion.
	memberships, _, err := service.ListMemberships(context.Background(), adminPrincipal, orgID, adminPrincipal.User.ID, sdb.ListParams{Limit: 100, Sort: "created_at"})
	if err != nil {
		t.Fatalf("list memberships: %v", err)
	}
	if len(memberships) != 1 {
		t.Fatalf("expected exactly one membership for the org-admin principal, got %d", len(memberships))
	}
	ownMembershipID := memberships[0].ID

	if _, err := service.UpdateMembership(context.Background(), adminPrincipal, ownMembershipID, UpdateMembershipParams{Role: "owner"}); err == nil {
		t.Fatal("expected an org admin to be denied self-promotion to owner")
	} else if !strings.Contains(err.Error(), "cannot grant a permission you do not hold") {
		t.Fatalf("expected a permission-cap error, got: %v", err)
	}

	// A same-or-lesser role change must still work — the cap check should
	// only block escalation, not legitimate role management.
	if _, err := service.UpdateMembership(context.Background(), adminPrincipal, ownMembershipID, UpdateMembershipParams{Role: "member"}); err != nil {
		t.Fatalf("expected an org admin to still be able to change a role within their own permission scope: %v", err)
	}
}

func TestCreatePolicyBindingCannotGrantPermissionCallerLacks(t *testing.T) {
	service, adminPrincipal, orgID := bootstrapWithOrgAdmin(t)

	if _, err := service.CreatePolicyBinding(context.Background(), adminPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgID,
		Name:            "self-grant",
		SubjectType:     "user",
		SubjectID:       adminPrincipal.User.ID,
		PermissionCodes: []string{"organization.delete"},
	}); err == nil {
		t.Fatal("expected an org admin to be denied granting organization.delete via a policy binding")
	} else if !strings.Contains(err.Error(), "cannot grant a permission you do not hold") {
		t.Fatalf("expected a permission-cap error, got: %v", err)
	}

	// A permission the admin does hold must still be grantable.
	if _, err := service.CreatePolicyBinding(context.Background(), adminPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgID,
		Name:            "legit-grant",
		SubjectType:     "user",
		SubjectID:       adminPrincipal.User.ID,
		PermissionCodes: []string{"knowledge.manage"},
	}); err != nil {
		t.Fatalf("expected an org admin to grant a permission within their own scope: %v", err)
	}
}

func TestCreateRoleCannotGrantPermissionCallerLacks(t *testing.T) {
	service, adminPrincipal, orgID := bootstrapWithOrgAdmin(t)

	if _, err := service.CreateRole(context.Background(), adminPrincipal, CreateRoleParams{
		OrganizationID: orgID,
		Code:           "super-owner",
		Name:           "Super Owner",
		Permissions:    []string{"organization.delete"},
	}); err == nil {
		t.Fatal("expected an org admin to be denied defining a custom role that grants organization.delete")
	} else if !strings.Contains(err.Error(), "cannot grant a permission you do not hold") {
		t.Fatalf("expected a permission-cap error, got: %v", err)
	}

	if _, err := service.CreateRole(context.Background(), adminPrincipal, CreateRoleParams{
		OrganizationID: orgID,
		Code:           "auditor",
		Name:           "Auditor",
		Permissions:    []string{"organization.read", "audit.read"},
	}); err != nil {
		t.Fatalf("expected an org admin to define a custom role within their own permission scope: %v", err)
	}
}

func TestCreateInvitationCannotAssignRoleAboveCallerPermissions(t *testing.T) {
	service, adminPrincipal, orgID := bootstrapWithOrgAdmin(t)

	if _, err := service.CreateInvitation(context.Background(), adminPrincipal, CreateInvitationParams{
		OrganizationID: orgID,
		Email:          "newowner@example.com",
		Role:           "owner",
	}); err == nil {
		t.Fatal("expected an org admin to be denied inviting a new member as owner")
	} else if !strings.Contains(err.Error(), "cannot grant a permission you do not hold") {
		t.Fatalf("expected a permission-cap error, got: %v", err)
	}
}
