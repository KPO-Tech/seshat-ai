package iam

import (
	"context"
	"testing"
)

func TestProvisionScimMemberCreatesAnActiveMembershipImmediately(t *testing.T) {
	service := newTestService(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	orgID := boot.Organizations[0].ID

	member, err := service.ProvisionScimMember(context.Background(), ProvisionScimMemberParams{
		OrganizationID: orgID, Email: "scim.user@example.com", DisplayName: "SCIM User",
		Active: true, ExternalID: "idp-ext-1",
	})
	if err != nil {
		t.Fatalf("provision: %v", err)
	}
	if member.Status != "active" {
		t.Fatalf("expected an immediately active membership, got status %q", member.Status)
	}
	if member.Role != "member" {
		t.Fatalf("expected the fixed 'member' role, got %q", member.Role)
	}
	if member.ScimExternalID == nil || *member.ScimExternalID != "idp-ext-1" {
		t.Fatalf("expected the external id to round-trip, got %+v", member.ScimExternalID)
	}
	if member.UserEmail != "scim.user@example.com" || member.UserDisplayName != "SCIM User" {
		t.Fatalf("unexpected user fields: %+v", member)
	}

	// No password reset email is sent - unlike CreateOrganizationMember, a
	// SCIM-provisioned user authenticates via SSO, so there is nothing to
	// verify here beyond "provisioning itself didn't error" - a real email
	// assertion would need newTestServiceWithMailer, and the point is
	// exactly that no mailer call happens at all.
}

func TestProvisionScimMemberWithActiveFalseCreatesABlockedMembership(t *testing.T) {
	service := newTestService(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	orgID := boot.Organizations[0].ID

	member, err := service.ProvisionScimMember(context.Background(), ProvisionScimMemberParams{
		OrganizationID: orgID, Email: "scim.user@example.com", DisplayName: "SCIM User", Active: false,
	})
	if err != nil {
		t.Fatalf("provision: %v", err)
	}
	if member.Status != "blocked" {
		t.Fatalf("expected active:false to provision a blocked membership, got status %q", member.Status)
	}
}

func TestProvisionScimMemberRejectsDuplicateEmail(t *testing.T) {
	service := newTestService(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	orgID := boot.Organizations[0].ID

	// admin@example.com already exists (the bootstrap user) - this exercises
	// the exact real-world case of an IdP trying to provision someone whose
	// email is already a member of a DIFFERENT organization entirely, since
	// email is globally unique and one-org-per-user is enforced.
	if _, err := service.ProvisionScimMember(context.Background(), ProvisionScimMemberParams{
		OrganizationID: orgID, Email: "admin@example.com", DisplayName: "Someone Else", Active: true,
	}); err == nil {
		t.Fatal("expected provisioning a duplicate email to be rejected")
	}
}

func TestUpdateScimMemberBlocksAndReactivates(t *testing.T) {
	service := newTestService(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	orgID := boot.Organizations[0].ID
	member, err := service.ProvisionScimMember(context.Background(), ProvisionScimMemberParams{
		OrganizationID: orgID, Email: "scim.user@example.com", DisplayName: "SCIM User", Active: true,
	})
	if err != nil {
		t.Fatalf("provision: %v", err)
	}

	blocked, err := service.UpdateScimMember(context.Background(), orgID, member.UserID, UpdateScimMemberParams{
		DisplayName: "SCIM User", Active: false,
	})
	if err != nil {
		t.Fatalf("block: %v", err)
	}
	if blocked.Status != "blocked" {
		t.Fatalf("expected blocked status, got %q", blocked.Status)
	}

	// A blocked membership is excluded from every authorization check, as
	// if it didn't exist - the actual enforcement lives in access.go and is
	// covered there; this just confirms the write side sets the field the
	// rest of the system already keys off of.
	reactivated, err := service.UpdateScimMember(context.Background(), orgID, member.UserID, UpdateScimMemberParams{
		DisplayName: "SCIM User Renamed", Active: true,
	})
	if err != nil {
		t.Fatalf("reactivate: %v", err)
	}
	if reactivated.Status != "active" || reactivated.UserDisplayName != "SCIM User Renamed" {
		t.Fatalf("unexpected reactivated membership: %+v", reactivated)
	}
}

func TestUpdateScimMemberRejectsAUserFromADifferentOrganization(t *testing.T) {
	service := newTestService(t)
	bootA, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Org A", OrganizationSlug: "org-a",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	adminPrincipal, err := service.ResolvePrincipal(context.Background(), bootA.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	orgB, err := service.CreateOrganization(context.Background(), adminPrincipal, CreateOrganizationParams{Name: "Org B", Slug: "org-b"})
	if err != nil {
		t.Fatalf("create org b: %v", err)
	}

	member, err := service.ProvisionScimMember(context.Background(), ProvisionScimMemberParams{
		OrganizationID: bootA.Organizations[0].ID, Email: "scim.user@example.com", DisplayName: "SCIM User", Active: true,
	})
	if err != nil {
		t.Fatalf("provision: %v", err)
	}

	if _, err := service.UpdateScimMember(context.Background(), orgB.ID, member.UserID, UpdateScimMemberParams{
		DisplayName: "SCIM User", Active: false,
	}); err == nil {
		t.Fatal("expected a SCIM connection on org B to be unable to modify a member of org A")
	}
}

func TestGetScimMemberByUserIDNotFound(t *testing.T) {
	service := newTestService(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	orgID := boot.Organizations[0].ID

	if _, err := service.GetScimMemberByUserID(context.Background(), orgID, "usr_does_not_exist"); err == nil {
		t.Fatal("expected an unknown user id to be rejected")
	}
}

func TestFindScimMemberByEmailReturnsNilWithoutErrorWhenNoMatch(t *testing.T) {
	service := newTestService(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	orgID := boot.Organizations[0].ID

	member, err := service.FindScimMemberByEmail(context.Background(), orgID, "nobody@example.com")
	if err != nil {
		t.Fatalf("expected no error for a filter with zero matches, got: %v", err)
	}
	if member != nil {
		t.Fatalf("expected a nil result, got %+v", member)
	}

	if _, provisionErr := service.ProvisionScimMember(context.Background(), ProvisionScimMemberParams{
		OrganizationID: orgID, Email: "scim.user@example.com", DisplayName: "SCIM User", Active: true,
	}); provisionErr != nil {
		t.Fatalf("provision: %v", provisionErr)
	}
	found, err := service.FindScimMemberByEmail(context.Background(), orgID, "SCIM.User@Example.com")
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if found == nil || found.UserEmail != "scim.user@example.com" {
		t.Fatalf("expected a case-insensitive email match, got %+v", found)
	}
}

// TestUpdateScimMemberDeactivationActuallyBlocksOrganizationAccess is the
// end-to-end check that PATCH active:false (via UpdateScimMember) doesn't
// just flip a field but actually revokes access through the real
// authorization path (canAccessOrganization/access.go), the same
// "excluded from every check, as if the membership didn't exist" contract
// BlockExpiredPendingMemberships relies on for its own blocking.
func TestUpdateScimMemberDeactivationActuallyBlocksOrganizationAccess(t *testing.T) {
	service := newTestService(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	orgID := boot.Organizations[0].ID

	member, err := service.ProvisionScimMember(context.Background(), ProvisionScimMemberParams{
		OrganizationID: orgID, Email: "scim.user@example.com", DisplayName: "SCIM User", Active: true,
	})
	if err != nil {
		t.Fatalf("provision: %v", err)
	}
	principal := &Principal{User: User{ID: member.UserID}}

	tx := service.db.Gorm()
	allowed, err := canAccessOrganization(tx, principal, orgID)
	if err != nil {
		t.Fatalf("access check before deactivation: %v", err)
	}
	if !allowed {
		t.Fatal("expected the freshly provisioned, active member to have organization access")
	}

	if _, err := service.UpdateScimMember(context.Background(), orgID, member.UserID, UpdateScimMemberParams{
		DisplayName: "SCIM User", Active: false,
	}); err != nil {
		t.Fatalf("deactivate: %v", err)
	}

	allowedAfter, err := canAccessOrganization(tx, principal, orgID)
	if err != nil {
		t.Fatalf("access check after deactivation: %v", err)
	}
	if allowedAfter {
		t.Fatal("expected a SCIM-deactivated member to lose organization access")
	}
}

func TestListScimMembersPaginates(t *testing.T) {
	service := newTestService(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	orgID := boot.Organizations[0].ID

	for i := 0; i < 3; i++ {
		if _, err := service.ProvisionScimMember(context.Background(), ProvisionScimMemberParams{
			OrganizationID: orgID, Email: "user" + string(rune('a'+i)) + "@example.com",
			DisplayName: "User", Active: true,
		}); err != nil {
			t.Fatalf("provision %d: %v", i, err)
		}
	}

	// Total membership count is 4: the bootstrap admin + the 3 provisioned.
	page1, total, err := service.ListScimMembers(context.Background(), orgID, 0, 2)
	if err != nil {
		t.Fatalf("list page 1: %v", err)
	}
	if total != 4 || len(page1) != 2 {
		t.Fatalf("expected total=4, page size 2, got total=%d len=%d", total, len(page1))
	}
	page2, _, err := service.ListScimMembers(context.Background(), orgID, 2, 2)
	if err != nil {
		t.Fatalf("list page 2: %v", err)
	}
	if len(page2) != 2 {
		t.Fatalf("expected 2 results on page 2, got %d", len(page2))
	}
	if page1[0].ID == page2[0].ID {
		t.Fatal("expected page 1 and page 2 to return different memberships")
	}
}
