package iam

import (
	"context"
	"testing"
	"time"
)

func TestDeleteProviderAndApplicationFlow(t *testing.T) {
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
	orgID := boot.Organizations[0].ID

	provider, err := service.CreateProvider(context.Background(), principal, CreateProviderParams{
		OrganizationID: orgID,
		Name:           "Google Workspace",
		Slug:           "google-workspace",
		Kind:           "oidc",
		ClientID:       "client-id",
		ClientSecret:   "client-secret",
		IssuerURL:      "https://accounts.google.com",
	})
	if err != nil {
		t.Fatalf("create provider: %v", err)
	}

	application, err := service.CreateApplication(context.Background(), principal, CreateApplicationParams{
		OrganizationID: orgID,
		Name:           "Seshat Desktop",
		Slug:           "seshat-desktop",
		DisplayName:    "Seshat Desktop",
		HomepageURL:    "https://seshat.ai",
		CallbackURL:    "http://localhost:8090/callback",
		ProviderIDs:    []string{provider.ID},
	})
	if err != nil {
		t.Fatalf("create application: %v", err)
	}

	if err := service.DeleteProvider(context.Background(), principal, provider.ID); err == nil {
		t.Fatal("expected provider deletion to fail while referenced")
	}

	if err := service.DeleteApplication(context.Background(), principal, application.ID); err != nil {
		t.Fatalf("delete application: %v", err)
	}
	if _, err := service.GetApplication(context.Background(), principal, application.ID); err == nil {
		t.Fatal("expected deleted application to be missing")
	}

	if err := service.DeleteProvider(context.Background(), principal, provider.ID); err != nil {
		t.Fatalf("delete provider: %v", err)
	}
	if _, err := service.GetProvider(context.Background(), principal, provider.ID); err == nil {
		t.Fatal("expected deleted provider to be missing")
	}
}

// TestDeleteProviderRequiresFreshAuth proves the step-up gate itself (see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 9) - deleting a
// provider is rejected for a stale session even with full permission, and
// the provider survives untouched.
func TestDeleteProviderRequiresFreshAuth(t *testing.T) {
	service := newTestService(t)

	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	principal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	orgID := boot.Organizations[0].ID

	provider, err := service.CreateProvider(context.Background(), principal, CreateProviderParams{
		OrganizationID: orgID, Name: "Google Workspace", Slug: "google-workspace",
		Kind: "oidc", ClientID: "client-id", ClientSecret: "client-secret", IssuerURL: "https://accounts.google.com",
	})
	if err != nil {
		t.Fatalf("create provider: %v", err)
	}
	principal.Session.ReauthenticatedAt = time.Now().UTC().Add(-stepUpFreshnessTTL - time.Minute)

	if err := service.DeleteProvider(context.Background(), principal, provider.ID); err == nil {
		t.Fatal("expected a stale session to be denied provider deletion")
	}
	if _, err := service.GetProvider(context.Background(), principal, provider.ID); err != nil {
		t.Fatalf("expected the provider to still exist after a rejected deletion, got: %v", err)
	}
}
