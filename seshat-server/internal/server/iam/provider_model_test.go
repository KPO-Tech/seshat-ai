package iam

import (
	"context"
	"testing"
)

func TestCreateProviderAppliesOIDCDefaults(t *testing.T) {
	service, principal, orgID := newProviderTestService(t)

	provider, err := service.CreateProvider(context.Background(), principal, CreateProviderParams{
		OrganizationID: orgID,
		Name:           "Google Workspace",
		Slug:           "google-workspace",
		Kind:           "oidc",
		ClientID:       "client-id",
		ClientSecret:   "client-secret",
		IssuerURL:      "https://accounts.google.com",
		AllowAutoLink:  true,
		Configuration: map[string]string{
			"tenant": "main",
		},
	})
	if err != nil {
		t.Fatalf("create provider: %v", err)
	}
	if !provider.Enabled {
		t.Fatal("expected provider to be enabled by default")
	}
	if len(provider.Scopes) != 3 {
		t.Fatalf("expected default oidc scopes, got %+v", provider.Scopes)
	}
	if provider.Scopes[0] != "email" || provider.Scopes[1] != "openid" || provider.Scopes[2] != "profile" {
		t.Fatalf("unexpected default scopes: %+v", provider.Scopes)
	}
	if !provider.AllowAutoLink {
		t.Fatal("expected allow_auto_link to be persisted")
	}
	if provider.Configuration["tenant"] != "main" {
		t.Fatalf("expected configuration to be persisted, got %+v", provider.Configuration)
	}
}

func TestCreateProviderRejectsInvalidProtocolConfig(t *testing.T) {
	service, principal, orgID := newProviderTestService(t)

	if _, err := service.CreateProvider(context.Background(), principal, CreateProviderParams{
		OrganizationID: orgID,
		Name:           "Broken OIDC",
		Slug:           "broken-oidc",
		Kind:           "oidc",
		IssuerURL:      "https://accounts.google.com",
	}); err == nil {
		t.Fatal("expected oidc provider without client_id to fail")
	}

	if _, err := service.CreateProvider(context.Background(), principal, CreateProviderParams{
		OrganizationID: orgID,
		Name:           "Broken SAML",
		Slug:           "broken-saml",
		Kind:           "saml",
		MetadataURL:    "https://example.com/metadata.xml",
	}); err == nil {
		t.Fatal("expected saml provider without entity_id to fail")
	}
}

func TestUpdateProviderSupportsSAMLConfiguration(t *testing.T) {
	service, principal, orgID := newProviderTestService(t)

	provider, err := service.CreateProvider(context.Background(), principal, CreateProviderParams{
		OrganizationID: orgID,
		Name:           "Initial OIDC",
		Slug:           "initial-oidc",
		Kind:           "oidc",
		ClientID:       "client-id",
		IssuerURL:      "https://accounts.google.com",
	})
	if err != nil {
		t.Fatalf("create provider: %v", err)
	}

	disabled := false
	updatedProvider, err := service.UpdateProvider(context.Background(), principal, provider.ID, UpdateProviderParams{
		Name:            "Enterprise SAML",
		Slug:            "enterprise-saml",
		Kind:            "saml",
		Enabled:         &disabled,
		MetadataURL:     "https://idp.example.com/metadata",
		EntityID:        "urn:seshat:test",
		SSOURL:          "https://idp.example.com/sso",
		X509Certificate: "-----BEGIN CERTIFICATE-----test-----END CERTIFICATE-----",
		AllowedDomains:  []string{"example.com", "corp.example.com"},
		ClaimMappings: map[string]string{
			"email": "mail",
			"name":  "displayName",
		},
		Configuration: map[string]string{
			"binding": "redirect",
		},
	})
	if err != nil {
		t.Fatalf("update provider: %v", err)
	}
	if updatedProvider.Kind != "saml" {
		t.Fatalf("expected saml provider kind, got %s", updatedProvider.Kind)
	}
	if updatedProvider.Enabled {
		t.Fatal("expected provider to be disabled after update")
	}
	if updatedProvider.EntityID != "urn:seshat:test" {
		t.Fatalf("unexpected entity id: %s", updatedProvider.EntityID)
	}
	if len(updatedProvider.AllowedDomains) != 2 {
		t.Fatalf("unexpected allowed domains: %+v", updatedProvider.AllowedDomains)
	}
	if updatedProvider.ClaimMappings["email"] != "mail" {
		t.Fatalf("unexpected claim mappings: %+v", updatedProvider.ClaimMappings)
	}
}

func newProviderTestService(t *testing.T) (*Service, *Principal, string) {
	t.Helper()

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
	return service, principal, boot.Organizations[0].ID
}
