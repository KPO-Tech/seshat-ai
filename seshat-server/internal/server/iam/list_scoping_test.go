package iam

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func TestUnscopedTenantListsAreScopedToAuthorizedOrganizations(t *testing.T) {
	service := newTestService(t)

	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email:            "platform-admin@example.com",
		Password:         "password123",
		DisplayName:      "Platform Admin",
		OrganizationName: "Org A",
		OrganizationSlug: "org-a",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	adminPrincipal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve admin principal: %v", err)
	}
	orgA := boot.Organizations[0].ID

	orgAdminUser, err := service.CreateUser(context.Background(), adminPrincipal, CreateUserParams{
		Email:          "org-admin@example.com",
		Password:       "password123",
		DisplayName:    "Org Admin",
		OrganizationID: orgA,
		Role:           "admin",
	})
	if err != nil {
		t.Fatalf("create org admin user: %v", err)
	}
	orgAdminLogin, err := service.Login(context.Background(), orgAdminUser.Email, "password123")
	if err != nil {
		t.Fatalf("login org admin: %v", err)
	}
	orgAdminPrincipal, err := service.ResolvePrincipal(context.Background(), orgAdminLogin.Token)
	if err != nil {
		t.Fatalf("resolve org admin principal: %v", err)
	}

	orgB, err := service.CreateOrganization(context.Background(), adminPrincipal, CreateOrganizationParams{
		Name: "Other Org",
		Slug: "other-org",
	})
	if err != nil {
		t.Fatalf("create org B: %v", err)
	}

	providerA, err := service.CreateProvider(context.Background(), adminPrincipal, CreateProviderParams{
		OrganizationID: orgA,
		Name:           "Provider A",
		Slug:           "provider-a",
		Kind:           "oidc",
		ClientID:       "client-a",
		ClientSecret:   "secret-a",
		IssuerURL:      "https://accounts.google.com",
	})
	if err != nil {
		t.Fatalf("create provider A: %v", err)
	}
	providerB, err := service.CreateProvider(context.Background(), adminPrincipal, CreateProviderParams{
		OrganizationID: orgB.ID,
		Name:           "Provider B",
		Slug:           "provider-b",
		Kind:           "oidc",
		ClientID:       "client-b",
		ClientSecret:   "secret-b",
		IssuerURL:      "https://accounts.google.com",
	})
	if err != nil {
		t.Fatalf("create provider B: %v", err)
	}

	if _, err := service.CreateApplication(context.Background(), adminPrincipal, CreateApplicationParams{
		OrganizationID: orgA,
		Name:           "App A",
		Slug:           "app-a",
		DisplayName:    "App A",
		CallbackURL:    "https://a.example.com/callback",
		ProviderIDs:    []string{providerA.ID},
	}); err != nil {
		t.Fatalf("create app A: %v", err)
	}
	if _, err := service.CreateApplication(context.Background(), adminPrincipal, CreateApplicationParams{
		OrganizationID: orgB.ID,
		Name:           "App B",
		Slug:           "app-b",
		DisplayName:    "App B",
		CallbackURL:    "https://b.example.com/callback",
		ProviderIDs:    []string{providerB.ID},
	}); err != nil {
		t.Fatalf("create app B: %v", err)
	}

	groupA, err := service.CreateGroup(context.Background(), adminPrincipal, CreateGroupParams{
		OrganizationID: orgA,
		Name:           "Group A",
		Slug:           "group-a",
		MemberUserIDs:  []string{orgAdminPrincipal.User.ID},
	})
	if err != nil {
		t.Fatalf("create group A: %v", err)
	}
	// A platform admin creating an organization no longer auto-joins it (see
	// CreateOrganization), and a user account now belongs to at most one
	// organization ever (adminPrincipal already has one from Bootstrap) — so
	// group B's member has to be a dedicated user scoped to org B, same as
	// orgAdminUser is scoped to org A above.
	orgBAdminUser, err := service.CreateUser(context.Background(), adminPrincipal, CreateUserParams{
		Email:          "org-b-admin@example.com",
		Password:       "password123",
		DisplayName:    "Org B Admin",
		OrganizationID: orgB.ID,
		Role:           "admin",
	})
	if err != nil {
		t.Fatalf("create org B admin user: %v", err)
	}
	groupB, err := service.CreateGroup(context.Background(), adminPrincipal, CreateGroupParams{
		OrganizationID: orgB.ID,
		Name:           "Group B",
		Slug:           "group-b",
		MemberUserIDs:  []string{orgBAdminUser.ID},
	})
	if err != nil {
		t.Fatalf("create group B: %v", err)
	}

	if _, err := service.CreatePolicyBinding(context.Background(), adminPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgA,
		Name:            "Policy A",
		SubjectType:     "group",
		SubjectID:       groupA.ID,
		PermissionCodes: []string{"applications.read"},
	}); err != nil {
		t.Fatalf("create policy A: %v", err)
	}
	if _, err := service.CreatePolicyBinding(context.Background(), adminPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgB.ID,
		Name:            "Policy B",
		SubjectType:     "group",
		SubjectID:       groupB.ID,
		PermissionCodes: []string{"applications.read"},
	}); err != nil {
		t.Fatalf("create policy B: %v", err)
	}

	if _, err := service.CreateInvitation(context.Background(), adminPrincipal, CreateInvitationParams{
		OrganizationID: orgA,
		Email:          "invite-a@example.com",
		Role:           "viewer",
	}); err != nil {
		t.Fatalf("create invitation A: %v", err)
	}
	if _, err := service.CreateInvitation(context.Background(), adminPrincipal, CreateInvitationParams{
		OrganizationID: orgB.ID,
		Email:          "invite-b@example.com",
		Role:           "viewer",
	}); err != nil {
		t.Fatalf("create invitation B: %v", err)
	}

	applications, _, err := service.ListApplications(context.Background(), orgAdminPrincipal, "", sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list applications: %v", err)
	}
	if len(applications) != 1 || applications[0].OrganizationID != orgA {
		t.Fatalf("expected only org A applications, got %+v", applications)
	}

	providers, _, err := service.ListProviders(context.Background(), orgAdminPrincipal, "", sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list providers: %v", err)
	}
	if len(providers) != 1 || providers[0].OrganizationID != orgA {
		t.Fatalf("expected only org A providers, got %+v", providers)
	}

	groups, _, err := service.ListGroups(context.Background(), orgAdminPrincipal, "", sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list groups: %v", err)
	}
	if len(groups) != 1 || groups[0].OrganizationID != orgA {
		t.Fatalf("expected only org A groups, got %+v", groups)
	}

	bindings, _, err := service.ListPolicyBindings(context.Background(), orgAdminPrincipal, "", sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list policy bindings: %v", err)
	}
	if len(bindings) != 1 || bindings[0].OrganizationID != orgA {
		t.Fatalf("expected only org A policy bindings, got %+v", bindings)
	}

	invitations, _, err := service.ListInvitations(context.Background(), orgAdminPrincipal, "", "", sdb.ListParams{Sort: "created_at", Order: "desc", Limit: 50})
	if err != nil {
		t.Fatalf("list invitations: %v", err)
	}
	if len(invitations) != 1 || invitations[0].OrganizationID != orgA {
		t.Fatalf("expected only org A invitations, got %+v", invitations)
	}

	events, _, err := service.ListAuditEvents(context.Background(), orgAdminPrincipal, ListAuditEventsParams{}, sdb.ListParams{Sort: "created_at", Order: "desc", Limit: 200})
	if err != nil {
		t.Fatalf("list audit events: %v", err)
	}
	if len(events) == 0 {
		t.Fatal("expected audit events for org A")
	}
	for _, event := range events {
		if event.OrganizationID != orgA {
			t.Fatalf("expected unscoped audit list to stay within org A, got event %+v", event)
		}
	}
}
