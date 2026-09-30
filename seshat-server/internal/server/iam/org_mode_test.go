package iam

import (
	"context"
	"testing"
)

func TestSetOrgModeRejectsInvalidValue(t *testing.T) {
	service := newTestService(t)

	if err := service.SetOrgMode("bogus"); err == nil {
		t.Fatal("expected an invalid org mode to be rejected")
	}
	if got := service.OrgMode(); got != orgModeMulti {
		t.Fatalf("expected a rejected value to leave the mode at %q, got %q", orgModeMulti, got)
	}
}

func TestSetOrgModeEmptyDefaultsToMulti(t *testing.T) {
	service := newTestService(t)

	if err := service.SetOrgMode(""); err != nil {
		t.Fatalf("expected an empty org mode to be accepted: %v", err)
	}
	if got := service.OrgMode(); got != orgModeMulti {
		t.Fatalf("expected empty org mode to default to %q, got %q", orgModeMulti, got)
	}
}

// TestCreateOrganizationRejectsSecondOrganizationInSingleMode locks in the
// deployment-wide half of single-org mode: even a non-admin, org-less user
// (who would otherwise be free to found their own organization) is blocked
// once the deployment's one organization already exists.
func TestCreateOrganizationRejectsSecondOrganizationInSingleMode(t *testing.T) {
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

	if _, err := service.CreateUser(context.Background(), adminPrincipal, CreateUserParams{
		Email:       "founder@example.com",
		Password:    "password123",
		DisplayName: "Founder",
	}); err != nil {
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

	if err := service.SetOrgMode("single"); err != nil {
		t.Fatalf("set org mode: %v", err)
	}

	if _, err := service.CreateOrganization(context.Background(), founderPrincipal, CreateOrganizationParams{
		Name: "Second Co",
		Slug: "second-co",
	}); err == nil {
		t.Fatal("expected creating a second organization in single mode to fail")
	}
}

// TestCreateOrganizationRejectsAdminSecondOrgInSingleMode is the gap this
// feature actually closes: CreateOrganization's existing per-user check
// only applies to non-admin principals, so a platform admin could otherwise
// create unlimited additional organizations even in single mode.
func TestCreateOrganizationRejectsAdminSecondOrgInSingleMode(t *testing.T) {
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

	if err := service.SetOrgMode("single"); err != nil {
		t.Fatalf("set org mode: %v", err)
	}

	if _, err := service.CreateOrganization(context.Background(), adminPrincipal, CreateOrganizationParams{
		Name: "Customer Co",
		Slug: "customer-co",
	}); err == nil {
		t.Fatal("expected a platform admin's second organization to be rejected in single mode")
	}
}

// TestCreateOrganizationAllowsAdminSecondOrgInMultiMode locks in that
// today's default behavior (multi mode, i.e. SetOrgMode never called) is
// unchanged by this feature.
func TestCreateOrganizationAllowsAdminSecondOrgInMultiMode(t *testing.T) {
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

	if _, err := service.CreateOrganization(context.Background(), adminPrincipal, CreateOrganizationParams{
		Name: "Customer Co",
		Slug: "customer-co",
	}); err != nil {
		t.Fatalf("expected a platform admin's second organization to succeed in multi mode: %v", err)
	}
}

// TestHasAnyOrganizationReflectsOrgCountNotUserCount is the subtlety this
// design is built around: BootstrapStatus reports "does at least one User
// exist," which Register can make true with zero organizations involved.
// HasAnyOrganization must not be confused with that signal.
func TestHasAnyOrganizationReflectsOrgCountNotUserCount(t *testing.T) {
	service := newTestService(t)

	if _, err := service.Register(context.Background(), RegisterParams{
		Email:       "solo@example.com",
		Password:    "password123",
		DisplayName: "Solo",
	}); err != nil {
		t.Fatalf("register: %v", err)
	}

	initialized, err := service.BootstrapStatus(context.Background())
	if err != nil {
		t.Fatalf("bootstrap status: %v", err)
	}
	if !initialized {
		t.Fatal("expected BootstrapStatus to report initialized once a user exists")
	}

	hasOrg, err := service.HasAnyOrganization(context.Background())
	if err != nil {
		t.Fatalf("has any organization: %v", err)
	}
	if hasOrg {
		t.Fatal("expected HasAnyOrganization to be false when only an org-less user exists")
	}

	if _, err := service.CreateOrganization(context.Background(), mustResolvePrincipal(t, service, "solo@example.com", "password123"), CreateOrganizationParams{
		Name: "Solo Co",
		Slug: "solo-co",
	}); err != nil {
		t.Fatalf("create organization: %v", err)
	}

	hasOrg, err = service.HasAnyOrganization(context.Background())
	if err != nil {
		t.Fatalf("has any organization after creation: %v", err)
	}
	if !hasOrg {
		t.Fatal("expected HasAnyOrganization to be true once an organization exists")
	}
}

func mustResolvePrincipal(t *testing.T, service *Service, email, password string) *Principal {
	t.Helper()
	login, err := service.Login(context.Background(), email, password)
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	principal, err := service.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	return principal
}
