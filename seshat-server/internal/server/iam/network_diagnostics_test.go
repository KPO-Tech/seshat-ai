package iam

import (
	"context"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mailer"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mailer/mailertest"
)

func newNetworkDiagnosticsTestEnv(t *testing.T) (*Service, *Principal, string) {
	t.Helper()
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
	return service, principal, boot.Organizations[0].ID
}

func TestRunNetworkDiagnosticsRequiresPermission(t *testing.T) {
	service, adminPrincipal, orgID := newNetworkDiagnosticsTestEnv(t)

	member, err := service.CreateUser(context.Background(), adminPrincipal, CreateUserParams{
		Email: "member@example.com", Password: "password123", DisplayName: "Member",
		OrganizationID: orgID, Role: "member",
	})
	if err != nil {
		t.Fatalf("create member user: %v", err)
	}
	login, err := service.Login(context.Background(), member.Email, "password123")
	if err != nil {
		t.Fatalf("login member: %v", err)
	}
	memberPrincipal, err := service.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve member principal: %v", err)
	}

	if _, err := service.RunNetworkDiagnostics(context.Background(), memberPrincipal, orgID); err == nil {
		t.Fatal("expected a plain member without network_diagnostics.read to be rejected")
	}
	if _, err := service.RunNetworkDiagnostics(context.Background(), adminPrincipal, orgID); err != nil {
		t.Fatalf("expected the org owner to be allowed: %v", err)
	}
}

func TestRunNetworkDiagnosticsOmitsSMTPWithoutTarget(t *testing.T) {
	service, adminPrincipal, orgID := newNetworkDiagnosticsTestEnv(t)
	service.SetMailer(mailertest.New(), "http://localhost:3000")

	result, err := service.RunNetworkDiagnostics(context.Background(), adminPrincipal, orgID)
	if err != nil {
		t.Fatalf("run network diagnostics: %v", err)
	}
	for _, check := range result.Checks {
		if check.Name == "Email delivery (SMTP relay)" {
			t.Fatalf("expected no SMTP check for a mailer with no reportable target, got %+v", result.Checks)
		}
	}
}

func TestRunNetworkDiagnosticsIncludesSMTPWhenConfigured(t *testing.T) {
	service, adminPrincipal, orgID := newNetworkDiagnosticsTestEnv(t)
	service.SetMailer(mailer.NewSMTPSender(mailer.Config{Host: "127.0.0.1", Port: 1}), "http://localhost:3000")

	result, err := service.RunNetworkDiagnostics(context.Background(), adminPrincipal, orgID)
	if err != nil {
		t.Fatalf("run network diagnostics: %v", err)
	}
	found := false
	for _, check := range result.Checks {
		if check.Name == "Email delivery (SMTP relay)" {
			found = true
			if check.Target != "127.0.0.1:1" {
				t.Fatalf("expected target 127.0.0.1:1, got %q", check.Target)
			}
		}
	}
	if !found {
		t.Fatalf("expected an SMTP check when the mailer reports a target, got %+v", result.Checks)
	}
}

func TestRunNetworkDiagnosticsIncludesOnlyEnabledSSOProviders(t *testing.T) {
	service, adminPrincipal, orgID := newNetworkDiagnosticsTestEnv(t)

	// Created enabled, then disabled via a follow-up UpdateProvider - not
	// Enabled:&disabled at creation time. GORM's `gorm:"default:true"` tag
	// on Provider.Enabled makes Create() silently ignore an explicit `false`
	// (its own zero value) and let the DB apply the column default instead;
	// Save() (what UpdateProvider uses) has no such special-casing. This is
	// a pre-existing quirk of CreateProvider, not something introduced
	// here - saml_test.go's own disableProvider() helper already works
	// around it the same way, confirming it's a known shape, not a
	// regression to fix as part of this feature.
	disabledProvider, err := service.CreateProvider(context.Background(), adminPrincipal, CreateProviderParams{
		OrganizationID: orgID, Name: "Disabled OIDC", Slug: "disabled-oidc", Kind: "oidc",
		ClientID: "cid", ClientSecret: "secret", IssuerURL: "https://disabled.example.com",
	})
	if err != nil {
		t.Fatalf("create disabled oidc provider: %v", err)
	}
	disabled := false
	if _, err := service.UpdateProvider(context.Background(), adminPrincipal, disabledProvider.ID, UpdateProviderParams{
		Name: "Disabled OIDC", Slug: "disabled-oidc", Kind: "oidc",
		ClientID: "cid", ClientSecret: "secret", IssuerURL: "https://disabled.example.com",
		Enabled: &disabled,
	}); err != nil {
		t.Fatalf("disable oidc provider: %v", err)
	}

	if _, err := service.CreateProvider(context.Background(), adminPrincipal, CreateProviderParams{
		OrganizationID: orgID, Name: "Okta", Slug: "okta", Kind: "oidc",
		ClientID: "cid", ClientSecret: "secret", IssuerURL: "https://okta.example.com",
	}); err != nil {
		t.Fatalf("create oidc provider: %v", err)
	}

	certPEM := selfSignedTestCertPEM(t)
	if _, err := service.CreateProvider(context.Background(), adminPrincipal, CreateProviderParams{
		OrganizationID: orgID, Name: "Entra ID", Slug: "entra", Kind: "saml",
		EntityID: "urn:test-idp:entity", SSOURL: "https://entra.example.com/sso", X509Certificate: certPEM,
	}); err != nil {
		t.Fatalf("create saml provider: %v", err)
	}

	result, err := service.RunNetworkDiagnostics(context.Background(), adminPrincipal, orgID)
	if err != nil {
		t.Fatalf("run network diagnostics: %v", err)
	}

	names := map[string]string{}
	for _, check := range result.Checks {
		names[check.Name] = check.Target
	}
	if _, ok := names["SSO provider: Disabled OIDC"]; ok {
		t.Fatalf("expected the disabled provider to be excluded, got %+v", result.Checks)
	}
	oidcTarget, ok := names["SSO provider: Okta"]
	if !ok {
		t.Fatalf("expected an enabled OIDC provider check, got %+v", result.Checks)
	}
	if oidcTarget != "https://okta.example.com" {
		t.Fatalf("expected the OIDC check to target IssuerURL, got %q", oidcTarget)
	}
	samlTarget, ok := names["SSO provider: Entra ID"]
	if !ok {
		t.Fatalf("expected an enabled SAML provider check, got %+v", result.Checks)
	}
	if samlTarget != "https://entra.example.com/sso" {
		t.Fatalf("expected the SAML check to target SSOURL (not MetadataURL, which is never fetched dynamically), got %q", samlTarget)
	}
}

// TestRunNetworkDiagnosticsSucceedsAgainstARealOIDCIdP is a genuine live
// round trip (not a construction-only check like the test above): a real
// fake OIDC IdP server (the same newFakeIdP helper oidc_test.go's own
// real-signature tests use), proving the well-known discovery path this
// package builds actually resolves against a real HTTP server.
func TestRunNetworkDiagnosticsSucceedsAgainstARealOIDCIdP(t *testing.T) {
	service, adminPrincipal, orgID := newNetworkDiagnosticsTestEnv(t)
	idp := newFakeIdP(t)

	if _, err := service.CreateProvider(context.Background(), adminPrincipal, CreateProviderParams{
		OrganizationID: orgID, Name: "Test IdP", Slug: "test-idp", Kind: "oidc",
		ClientID: "test-client-id", ClientSecret: "test-client-secret", IssuerURL: idp.server.URL,
	}); err != nil {
		t.Fatalf("create oidc provider: %v", err)
	}

	result, err := service.RunNetworkDiagnostics(context.Background(), adminPrincipal, orgID)
	if err != nil {
		t.Fatalf("run network diagnostics: %v", err)
	}
	if len(result.Checks) != 1 || !result.Checks[0].OK {
		t.Fatalf("expected a single successful check against the real fake IdP, got %+v", result.Checks)
	}
}
