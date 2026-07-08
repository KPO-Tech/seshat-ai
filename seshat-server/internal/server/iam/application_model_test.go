package iam

import (
	"context"
	"testing"
)

func TestCreateApplicationAppliesOIDCDefaults(t *testing.T) {
	service, principal, orgID := newApplicationTestService(t)

	application, err := service.CreateApplication(context.Background(), principal, CreateApplicationParams{
		OrganizationID: orgID,
		Name:           "Seshat Desktop",
		Slug:           "seshat-desktop",
		DisplayName:    "Seshat Desktop",
		CallbackURL:    "http://localhost:8090/callback",
	})
	if err != nil {
		t.Fatalf("create application: %v", err)
	}
	if application.Protocol != "oidc" {
		t.Fatalf("expected default oidc protocol, got %s", application.Protocol)
	}
	if !application.Enabled {
		t.Fatal("expected application to be enabled by default")
	}
	if len(application.RedirectURLs) != 1 || application.RedirectURLs[0] != "http://localhost:8090/callback" {
		t.Fatalf("unexpected redirect urls: %+v", application.RedirectURLs)
	}
	if len(application.GrantTypes) != 1 || application.GrantTypes[0] != "authorization_code" {
		t.Fatalf("unexpected grant types: %+v", application.GrantTypes)
	}
	if len(application.ResponseTypes) != 1 || application.ResponseTypes[0] != "code" {
		t.Fatalf("unexpected response types: %+v", application.ResponseTypes)
	}
	if len(application.Scopes) != 3 {
		t.Fatalf("unexpected scopes: %+v", application.Scopes)
	}
}

func TestCreateApplicationRejectsInteractiveClientWithoutRedirect(t *testing.T) {
	service, principal, orgID := newApplicationTestService(t)

	if _, err := service.CreateApplication(context.Background(), principal, CreateApplicationParams{
		OrganizationID: orgID,
		Name:           "Broken App",
		Slug:           "broken-app",
		DisplayName:    "Broken App",
		Protocol:       "oidc",
		GrantTypes:     []string{"authorization_code"},
	}); err == nil {
		t.Fatal("expected interactive application without redirect to fail")
	}
}

func TestUpdateApplicationSupportsRichClientConfiguration(t *testing.T) {
	service, principal, orgID := newApplicationTestService(t)

	application, err := service.CreateApplication(context.Background(), principal, CreateApplicationParams{
		OrganizationID: orgID,
		Name:           "Seshat Desktop",
		Slug:           "seshat-desktop",
		DisplayName:    "Seshat Desktop",
		CallbackURL:    "http://localhost:8090/callback",
	})
	if err != nil {
		t.Fatalf("create application: %v", err)
	}

	disabled := false
	updatedApplication, err := service.UpdateApplication(context.Background(), principal, application.ID, UpdateApplicationParams{
		Name:                   "Seshat Desktop Cloud",
		Slug:                   "seshat-desktop-cloud",
		DisplayName:            "Seshat Desktop Cloud",
		Description:            "Enterprise desktop auth client",
		Protocol:               "oidc",
		Enabled:                &disabled,
		HomepageURL:            "https://app.seshat.ai",
		CallbackURL:            "https://app.seshat.ai/callback",
		RedirectURLs:           []string{"https://app.seshat.ai/callback", "https://app.seshat.ai/callback-2"},
		PostLogoutRedirectURLs: []string{"https://app.seshat.ai/logout"},
		AllowedOrigins:         []string{"https://app.seshat.ai"},
		GrantTypes:             []string{"authorization_code", "refresh_token"},
		ResponseTypes:          []string{"code"},
		Scopes:                 []string{"openid", "profile", "email", "offline_access"},
		SigninURL:              "https://app.seshat.ai/login",
		SignupURL:              "https://app.seshat.ai/signup",
		AllowSignup:            true,
		AllowPasswordLogin:     true,
		PKCERequired:           true,
		IssueRefreshToken:      true,
		Configuration: map[string]string{
			"theme": "seshat",
		},
	})
	if err != nil {
		t.Fatalf("update application: %v", err)
	}
	if updatedApplication.Enabled {
		t.Fatal("expected application to be disabled after update")
	}
	if updatedApplication.Description != "Enterprise desktop auth client" {
		t.Fatalf("unexpected description: %s", updatedApplication.Description)
	}
	if len(updatedApplication.RedirectURLs) != 2 {
		t.Fatalf("unexpected redirect urls: %+v", updatedApplication.RedirectURLs)
	}
	if !updatedApplication.AllowSignup || !updatedApplication.IssueRefreshToken {
		t.Fatalf("unexpected auth flags: %+v", updatedApplication)
	}
	if updatedApplication.Configuration["theme"] != "seshat" {
		t.Fatalf("unexpected configuration: %+v", updatedApplication.Configuration)
	}
}

func newApplicationTestService(t *testing.T) (*Service, *Principal, string) {
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
