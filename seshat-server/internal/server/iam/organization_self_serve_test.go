package iam

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func TestNonAdminUserCanCreateOrganizationAndBecomesOwner(t *testing.T) {
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
	adminPrincipal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve admin principal: %v", err)
	}

	// A regular (non-admin, org-less) user should be able to self-serve a new
	// organization without going through the platform admin.
	user, err := service.CreateUser(context.Background(), adminPrincipal, CreateUserParams{
		Email:       "founder@example.com",
		Password:    "password123",
		DisplayName: "Founder",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	login, err := service.Login(context.Background(), "founder@example.com", "password123")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	founderPrincipal, err := service.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve founder principal: %v", err)
	}
	if founderPrincipal.User.IsAdmin {
		t.Fatalf("expected founder to not be a global admin")
	}

	org, err := service.CreateOrganization(context.Background(), founderPrincipal, CreateOrganizationParams{
		Name: "Founder Co",
		Slug: "founder-co",
	})
	if err != nil {
		t.Fatalf("create organization as non-admin: %v", err)
	}

	// The founder must be able to see and manage the org they just created,
	// which only holds if an owner membership was attached automatically.
	loaded, err := service.GetOrganization(context.Background(), founderPrincipal, org.ID)
	if err != nil {
		t.Fatalf("founder cannot access their own new organization: %v", err)
	}
	if loaded.ID != org.ID {
		t.Fatalf("unexpected organization loaded: %s", loaded.ID)
	}

	orgs, _, err := service.ListOrganizations(context.Background(), founderPrincipal, sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list organizations: %v", err)
	}
	found := false
	for _, o := range orgs {
		if o.ID == org.ID {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected founder-created organization in their organization list")
	}

	memberships, _, err := service.ListMemberships(context.Background(), founderPrincipal, org.ID, "", sdb.ListParams{Sort: "created_at", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list memberships: %v", err)
	}
	if len(memberships) != 1 || memberships[0].UserID != user.ID || memberships[0].Role != "owner" {
		t.Fatalf("expected founder to hold a single owner membership, got %+v", memberships)
	}

	events, _, err := service.ListAuditEvents(context.Background(), adminPrincipal, ListAuditEventsParams{
		OrganizationID: org.ID,
		Action:         "membership.created",
	}, sdb.ListParams{Sort: "created_at", Order: "desc", Limit: 200})
	if err != nil {
		t.Fatalf("list audit events: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected one membership.created audit event for the new organization, got %d", len(events))
	}
}

// TestPlatformAdminCreatingOrganizationDoesNotBecomeAMember locks in the
// superadmin model: a platform admin provisioning an organization (e.g. for
// a customer) is not the same action as a founder self-serving their own —
// the admin should not end up "belonging to" every org they ever create.
// IsAdmin already grants full access regardless of membership, so nothing
// is lost; see the reasoning on CreateOrganization itself.
func TestPlatformAdminCreatingOrganizationDoesNotBecomeAMember(t *testing.T) {
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
	adminPrincipal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve admin principal: %v", err)
	}

	org, err := service.CreateOrganization(context.Background(), adminPrincipal, CreateOrganizationParams{
		Name: "Customer Co",
		Slug: "customer-co",
	})
	if err != nil {
		t.Fatalf("create organization as platform admin: %v", err)
	}

	memberships, _, err := service.ListMemberships(context.Background(), adminPrincipal, org.ID, "", sdb.ListParams{Sort: "created_at", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list memberships: %v", err)
	}
	if len(memberships) != 0 {
		t.Fatalf("expected the platform admin to hold no membership in an organization they provisioned, got %+v", memberships)
	}

	// IsAdmin still grants full access despite holding no membership at all.
	loaded, err := service.GetOrganization(context.Background(), adminPrincipal, org.ID)
	if err != nil {
		t.Fatalf("expected the platform admin to access the organization without being a member: %v", err)
	}
	if loaded.ID != org.ID {
		t.Fatalf("unexpected organization loaded: %s", loaded.ID)
	}

	// The admin can still explicitly add someone (including themselves) as
	// owner afterward — provisioning, then handing over, in two steps.
	customerUser, err := service.CreateUser(context.Background(), adminPrincipal, CreateUserParams{
		Email:       "customer-owner@example.com",
		Password:    "password123",
		DisplayName: "Customer Owner",
	})
	if err != nil {
		t.Fatalf("create customer user: %v", err)
	}
	if _, err := service.CreateMembership(context.Background(), adminPrincipal, CreateMembershipParams{
		OrganizationID: org.ID,
		UserID:         customerUser.ID,
		Role:           "owner",
	}); err != nil {
		t.Fatalf("attach customer as owner: %v", err)
	}

	memberships, _, err = service.ListMemberships(context.Background(), adminPrincipal, org.ID, "", sdb.ListParams{Sort: "created_at", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list memberships after attaching customer: %v", err)
	}
	if len(memberships) != 1 || memberships[0].UserID != customerUser.ID || memberships[0].Role != "owner" {
		t.Fatalf("expected only the customer to hold a membership, got %+v", memberships)
	}
}
