package iam

import (
	"context"
	"testing"
)

func TestCustomRoleLifecycleAndPermissionResolution(t *testing.T) {
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

	role, err := service.CreateRole(context.Background(), ownerPrincipal, CreateRoleParams{
		OrganizationID: orgID,
		Code:           "support_ops",
		Name:           "Support Ops",
		Description:    "Delegated support operations",
		Permissions:    []string{"invitations.manage"},
	})
	if err != nil {
		t.Fatalf("create custom role: %v", err)
	}
	if role.System {
		t.Fatal("expected custom role to be non-system")
	}

	roles, err := service.ListRoles(context.Background(), ownerPrincipal, orgID)
	if err != nil {
		t.Fatalf("list roles: %v", err)
	}
	if !containsRole(roles, "support_ops") {
		t.Fatalf("expected custom role in list, got %+v", roles)
	}

	supportUser, err := service.CreateUser(context.Background(), ownerPrincipal, CreateUserParams{
		Email:          "support@example.com",
		Password:       "password123",
		DisplayName:    "Support",
		OrganizationID: orgID,
		Role:           "support_ops",
	})
	if err != nil {
		t.Fatalf("create support user: %v", err)
	}
	supportLogin, err := service.Login(context.Background(), supportUser.Email, "password123")
	if err != nil {
		t.Fatalf("login support user: %v", err)
	}
	supportPrincipal, err := service.ResolvePrincipal(context.Background(), supportLogin.Token)
	if err != nil {
		t.Fatalf("resolve support principal: %v", err)
	}

	tx := service.db.Gorm().WithContext(context.Background())
	if ok, err := hasOrganizationPermission(tx, supportPrincipal, orgID, "invitations.manage"); err != nil {
		t.Fatalf("check invitations.manage: %v", err)
	} else if !ok {
		t.Fatal("expected custom role permission to grant invitations.manage")
	}
	if ok, err := hasOrganizationPermission(tx, supportPrincipal, orgID, "groups.read"); err != nil {
		t.Fatalf("check groups.read before binding: %v", err)
	} else if ok {
		t.Fatal("did not expect groups.read before role policy binding")
	}

	binding, err := service.CreatePolicyBinding(context.Background(), ownerPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgID,
		Name:            "Support Groups Read",
		Description:     "Role-level delegated group read access",
		SubjectType:     policySubjectRole,
		SubjectID:       "support_ops",
		PermissionCodes: []string{"groups.read"},
	})
	if err != nil {
		t.Fatalf("create policy binding: %v", err)
	}
	if binding.SubjectID != "support_ops" {
		t.Fatalf("unexpected binding role subject: %s", binding.SubjectID)
	}
	if ok, err := hasOrganizationPermission(tx, supportPrincipal, orgID, "groups.read"); err != nil {
		t.Fatalf("check groups.read after binding: %v", err)
	} else if !ok {
		t.Fatal("expected role policy binding to grant groups.read")
	}

	invite, err := service.CreateInvitation(context.Background(), ownerPrincipal, CreateInvitationParams{
		OrganizationID: orgID,
		Email:          "future-support@example.com",
		Role:           "support_ops",
		ExpiresInDays:  7,
	})
	if err != nil {
		t.Fatalf("create custom role invitation: %v", err)
	}

	updatedRole, err := service.UpdateRole(context.Background(), ownerPrincipal, "support_ops", UpdateRoleParams{
		OrganizationID: orgID,
		Code:           "support_lead",
		Name:           "Support Lead",
		Description:    "Delegated support lead",
		Permissions:    []string{"invitations.manage"},
	})
	if err != nil {
		t.Fatalf("update custom role: %v", err)
	}
	if updatedRole.Code != "support_lead" {
		t.Fatalf("unexpected updated role code: %s", updatedRole.Code)
	}

	membershipRecord, ok, err := findMembershipByUserAndOrganization(service.db.Gorm().WithContext(context.Background()), supportUser.ID, orgID)
	if err != nil {
		t.Fatalf("find support membership: %v", err)
	}
	if !ok || membershipRecord.Role != "support_lead" {
		t.Fatalf("expected cascaded membership role, got %+v", membershipRecord)
	}
	updatedInvitation, err := service.GetInvitation(context.Background(), ownerPrincipal, invite.ID)
	if err != nil {
		t.Fatalf("get updated invitation: %v", err)
	}
	if updatedInvitation.Role != "support_lead" {
		t.Fatalf("expected cascaded invitation role, got %s", updatedInvitation.Role)
	}
	updatedBinding, err := service.GetPolicyBinding(context.Background(), ownerPrincipal, binding.ID)
	if err != nil {
		t.Fatalf("get updated policy binding: %v", err)
	}
	if updatedBinding.SubjectID != "support_lead" {
		t.Fatalf("expected cascaded policy role subject, got %s", updatedBinding.SubjectID)
	}
	if ok, err := hasOrganizationPermission(tx, supportPrincipal, orgID, "groups.read"); err != nil {
		t.Fatalf("check groups.read after rename: %v", err)
	} else if !ok {
		t.Fatal("expected groups.read to survive role rename")
	}
	if ok, err := hasOrganizationPermission(tx, supportPrincipal, orgID, "invitations.manage"); err != nil {
		t.Fatalf("check invitations.manage after rename: %v", err)
	} else if !ok {
		t.Fatal("expected invitations.manage to survive role rename")
	}

	if err := service.DeleteRole(context.Background(), ownerPrincipal, orgID, "support_lead"); err == nil {
		t.Fatal("expected deleting assigned role to fail")
	}
	if _, err := service.UpdateMembership(context.Background(), ownerPrincipal, membershipRecord.ID, UpdateMembershipParams{Role: "viewer"}); err != nil {
		t.Fatalf("demote support membership before delete: %v", err)
	}
	if err := service.DeleteRole(context.Background(), ownerPrincipal, orgID, "support_lead"); err == nil {
		t.Fatal("expected deleting role with active invitation to fail")
	}
	if _, err := service.RevokeInvitation(context.Background(), ownerPrincipal, invite.ID); err != nil {
		t.Fatalf("revoke invitation before delete: %v", err)
	}
	if err := service.DeleteRole(context.Background(), ownerPrincipal, orgID, "support_lead"); err != nil {
		t.Fatalf("delete custom role: %v", err)
	}
	if _, err := service.GetRole(context.Background(), ownerPrincipal, orgID, "support_lead"); err == nil {
		t.Fatal("expected deleted role lookup to fail")
	}
	if _, err := service.GetPolicyBinding(context.Background(), ownerPrincipal, binding.ID); err == nil {
		t.Fatal("expected role policy binding to be removed when role is deleted")
	}
}

func TestCustomRoleInvitationAcceptance(t *testing.T) {
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

	if _, err := service.CreateRole(context.Background(), ownerPrincipal, CreateRoleParams{
		OrganizationID: orgID,
		Code:           "contractor",
		Name:           "Contractor",
		Description:    "Restricted external collaborator",
		Permissions:    []string{"organization.read"},
	}); err != nil {
		t.Fatalf("create contractor role: %v", err)
	}
	invitee, err := service.CreateUser(context.Background(), ownerPrincipal, CreateUserParams{
		Email:       "contractor@example.com",
		Password:    "password123",
		DisplayName: "Contractor",
	})
	if err != nil {
		t.Fatalf("create invitee: %v", err)
	}
	invitation, err := service.CreateInvitation(context.Background(), ownerPrincipal, CreateInvitationParams{
		OrganizationID: orgID,
		Email:          invitee.Email,
		Role:           "contractor",
		ExpiresInDays:  7,
	})
	if err != nil {
		t.Fatalf("create invitation: %v", err)
	}
	login, err := service.Login(context.Background(), invitee.Email, "password123")
	if err != nil {
		t.Fatalf("login invitee: %v", err)
	}
	inviteePrincipal, err := service.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve invitee principal: %v", err)
	}
	membership, err := service.AcceptInvitation(context.Background(), inviteePrincipal, AcceptInvitationParams{Token: invitation.Token})
	if err != nil {
		t.Fatalf("accept custom role invitation: %v", err)
	}
	if membership.Role != "contractor" {
		t.Fatalf("unexpected membership role after accept: %s", membership.Role)
	}
}

func TestCustomRoleManagementAuthorizationAndReservedSystemRoles(t *testing.T) {
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
	bootstrapPrincipal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve bootstrap principal: %v", err)
	}
	orgID := boot.Organizations[0].ID

	orgOwner, err := service.CreateUser(context.Background(), bootstrapPrincipal, CreateUserParams{
		Email:          "owner2@example.com",
		Password:       "password123",
		DisplayName:    "Owner Two",
		OrganizationID: orgID,
		Role:           "owner",
	})
	if err != nil {
		t.Fatalf("create non-platform owner: %v", err)
	}
	orgAdmin, err := service.CreateUser(context.Background(), bootstrapPrincipal, CreateUserParams{
		Email:          "orgadmin@example.com",
		Password:       "password123",
		DisplayName:    "Org Admin",
		OrganizationID: orgID,
		Role:           "admin",
	})
	if err != nil {
		t.Fatalf("create org admin: %v", err)
	}
	member, err := service.CreateUser(context.Background(), bootstrapPrincipal, CreateUserParams{
		Email:          "member@example.com",
		Password:       "password123",
		DisplayName:    "Member",
		OrganizationID: orgID,
		Role:           "member",
	})
	if err != nil {
		t.Fatalf("create member: %v", err)
	}

	ownerLogin, err := service.Login(context.Background(), orgOwner.Email, "password123")
	if err != nil {
		t.Fatalf("login owner: %v", err)
	}
	ownerPrincipal, err := service.ResolvePrincipal(context.Background(), ownerLogin.Token)
	if err != nil {
		t.Fatalf("resolve owner principal: %v", err)
	}
	adminLogin, err := service.Login(context.Background(), orgAdmin.Email, "password123")
	if err != nil {
		t.Fatalf("login org admin: %v", err)
	}
	adminPrincipal, err := service.ResolvePrincipal(context.Background(), adminLogin.Token)
	if err != nil {
		t.Fatalf("resolve org admin principal: %v", err)
	}
	memberLogin, err := service.Login(context.Background(), member.Email, "password123")
	if err != nil {
		t.Fatalf("login member: %v", err)
	}
	memberPrincipal, err := service.ResolvePrincipal(context.Background(), memberLogin.Token)
	if err != nil {
		t.Fatalf("resolve member principal: %v", err)
	}

	if _, err := service.CreateRole(context.Background(), memberPrincipal, CreateRoleParams{
		OrganizationID: orgID,
		Code:           "member_delegate",
		Name:           "Member Delegate",
		Description:    "Should be denied",
		Permissions:    []string{"organization.read"},
	}); err == nil {
		t.Fatal("expected regular member to be denied role creation")
	}
	if _, err := service.CreateRole(context.Background(), adminPrincipal, CreateRoleParams{
		OrganizationID: orgID,
		Code:           "ops_admin",
		Name:           "Ops Admin",
		Description:    "Admin-managed role",
		Permissions:    []string{"organization.read"},
	}); err != nil {
		t.Fatalf("expected org admin to create role: %v", err)
	}
	if _, err := service.CreateRole(context.Background(), ownerPrincipal, CreateRoleParams{
		OrganizationID: orgID,
		Code:           "ops_owner",
		Name:           "Ops Owner",
		Description:    "Owner-managed role",
		Permissions:    []string{"organization.read"},
	}); err != nil {
		t.Fatalf("expected owner to create role: %v", err)
	}
	if _, err := service.CreateRole(context.Background(), ownerPrincipal, CreateRoleParams{
		OrganizationID: orgID,
		Code:           "admin",
		Name:           "Bad",
		Description:    "Reserved code",
		Permissions:    []string{"organization.read"},
	}); err == nil {
		t.Fatal("expected reserved system role code creation to fail")
	}
	if _, err := service.UpdateRole(context.Background(), ownerPrincipal, "owner", UpdateRoleParams{
		OrganizationID: orgID,
		Code:           "owner-renamed",
		Name:           "Owner Renamed",
		Description:    "Should fail",
		Permissions:    []string{"organization.read"},
	}); err == nil {
		t.Fatal("expected system role update to fail")
	}
	if err := service.DeleteRole(context.Background(), ownerPrincipal, orgID, "viewer"); err == nil {
		t.Fatal("expected system role delete to fail")
	}
}

func containsRole(roles []Role, code string) bool {
	for _, role := range roles {
		if role.Code == code {
			return true
		}
	}
	return false
}
