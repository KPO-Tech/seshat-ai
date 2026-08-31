package iam

import (
	"context"
	"testing"
)

func TestLookupSSOProviderForEmailRejectsInvalidEmail(t *testing.T) {
	service := newTestService(t)
	if _, err := service.LookupSSOProviderForEmail(context.Background(), "not-an-email"); err == nil {
		t.Fatal("expected an error for an email with no domain")
	}
}

func TestLookupSSOProviderForEmailReturnsNilWithoutError(t *testing.T) {
	service := newTestService(t)
	match, err := service.LookupSSOProviderForEmail(context.Background(), "nobody@unmatched-domain.example")
	if err != nil {
		t.Fatalf("expected no error for an unmatched domain, got: %v", err)
	}
	if match != nil {
		t.Fatalf("expected no match, got %+v", match)
	}
}

func TestLookupSSOProviderForEmailFindsOIDCProviderByDomainCaseInsensitively(t *testing.T) {
	service := newTestService(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Acme Corp", OrganizationSlug: "acme",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	principal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	orgID := boot.Organizations[0].ID

	if _, err := service.CreateProvider(context.Background(), principal, CreateProviderParams{
		OrganizationID: orgID, Name: "Acme Okta", Slug: "acme-okta", Kind: "oidc",
		ClientID: "client-id", ClientSecret: "client-secret", IssuerURL: "https://accounts.google.com",
		AllowedDomains: []string{"Acme.com"},
	}); err != nil {
		t.Fatalf("create provider: %v", err)
	}

	match, err := service.LookupSSOProviderForEmail(context.Background(), "employee@acme.com")
	if err != nil {
		t.Fatalf("lookup: %v", err)
	}
	if match == nil {
		t.Fatal("expected a match")
	}
	if match.Kind != "oidc" || match.Name != "Acme Okta" || match.OrganizationName != "Acme Corp" {
		t.Fatalf("unexpected match: %+v", match)
	}
}

func TestLookupSSOProviderForEmailIgnoresDisabledProvider(t *testing.T) {
	service := newTestService(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Acme Corp", OrganizationSlug: "acme",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	principal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	orgID := boot.Organizations[0].ID

	created, err := service.CreateProvider(context.Background(), principal, CreateProviderParams{
		OrganizationID: orgID, Name: "Acme Okta", Slug: "acme-okta", Kind: "oidc",
		ClientID: "client-id", ClientSecret: "client-secret", IssuerURL: "https://accounts.google.com",
		AllowedDomains: []string{"acme.com"},
	})
	if err != nil {
		t.Fatalf("create provider: %v", err)
	}
	disabled := false
	if _, err := service.UpdateProvider(context.Background(), principal, created.ID, UpdateProviderParams{
		Name: "Acme Okta", Slug: "acme-okta", Kind: "oidc", Enabled: &disabled,
		ClientID: "client-id", ClientSecret: "client-secret", IssuerURL: "https://accounts.google.com",
		AllowedDomains: []string{"acme.com"},
	}); err != nil {
		t.Fatalf("disable provider: %v", err)
	}

	match, err := service.LookupSSOProviderForEmail(context.Background(), "employee@acme.com")
	if err != nil {
		t.Fatalf("lookup: %v", err)
	}
	if match != nil {
		t.Fatalf("expected a disabled provider to never be discoverable, got %+v", match)
	}
}

func TestLookupSSOProviderForEmailIgnoresProviderWithNoAllowedDomains(t *testing.T) {
	service := newTestService(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Acme Corp", OrganizationSlug: "acme",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	principal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	orgID := boot.Organizations[0].ID

	if _, err := service.CreateProvider(context.Background(), principal, CreateProviderParams{
		OrganizationID: orgID, Name: "Acme Okta", Slug: "acme-okta", Kind: "oidc",
		ClientID: "client-id", ClientSecret: "client-secret", IssuerURL: "https://accounts.google.com",
	}); err != nil {
		t.Fatalf("create provider: %v", err)
	}

	match, err := service.LookupSSOProviderForEmail(context.Background(), "employee@acme.com")
	if err != nil {
		t.Fatalf("lookup: %v", err)
	}
	if match != nil {
		t.Fatalf("expected a provider with no configured domains to never be discovered by domain, got %+v", match)
	}
}
