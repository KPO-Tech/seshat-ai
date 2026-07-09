package iam

import (
	"context"
	"strings"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func TestBootstrapAndLoginFlow(t *testing.T) {
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
	if boot.User.Email != "admin@example.com" {
		t.Fatalf("unexpected boot email: %s", boot.User.Email)
	}
	if len(boot.Organizations) != 1 {
		t.Fatalf("expected one organization, got %d", len(boot.Organizations))
	}

	principal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	if !principal.User.IsAdmin {
		t.Fatal("expected bootstrap user to be admin")
	}

	login, err := service.Login(context.Background(), "admin@example.com", "password123")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	if login.Token == "" {
		t.Fatal("expected token from login")
	}
}

func TestCreateProviderAndApplicationFlow(t *testing.T) {
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
	if application.ClientID == "" || application.ClientSecret == "" {
		t.Fatal("expected generated client credentials")
	}
	if application.Protocol != "oidc" {
		t.Fatalf("unexpected application protocol: %s", application.Protocol)
	}

	providers, _, err := service.ListProviders(context.Background(), principal, orgID, sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list providers: %v", err)
	}
	if len(providers) != 1 {
		t.Fatalf("expected one provider, got %d", len(providers))
	}

	applications, _, err := service.ListApplications(context.Background(), principal, orgID, sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list applications: %v", err)
	}
	if len(applications) != 1 {
		t.Fatalf("expected one application, got %d", len(applications))
	}
}

func TestGetAndUpdateProviderAndApplicationFlow(t *testing.T) {
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

	loadedProvider, err := service.GetProvider(context.Background(), principal, provider.ID)
	if err != nil {
		t.Fatalf("get provider: %v", err)
	}
	if loadedProvider.ID != provider.ID {
		t.Fatalf("unexpected provider id: %s", loadedProvider.ID)
	}

	loadedApplication, err := service.GetApplication(context.Background(), principal, application.ID)
	if err != nil {
		t.Fatalf("get application: %v", err)
	}
	if loadedApplication.ID != application.ID {
		t.Fatalf("unexpected application id: %s", loadedApplication.ID)
	}

	updatedProvider, err := service.UpdateProvider(context.Background(), principal, provider.ID, UpdateProviderParams{
		Name:         "Google Workspace Production",
		Slug:         "google-workspace-prod",
		Kind:         "oidc",
		ClientID:     "client-id-2",
		ClientSecret: "client-secret-2",
		IssuerURL:    "https://accounts.google.com",
	})
	if err != nil {
		t.Fatalf("update provider: %v", err)
	}
	if updatedProvider.Name != "Google Workspace Production" {
		t.Fatalf("unexpected updated provider name: %s", updatedProvider.Name)
	}

	updatedApplication, err := service.UpdateApplication(context.Background(), principal, application.ID, UpdateApplicationParams{
		Name:                   "Seshat Desktop Production",
		Slug:                   "seshat-desktop-prod",
		DisplayName:            "Seshat Desktop Prod",
		Description:            "Desktop production auth client",
		Protocol:               "oidc",
		HomepageURL:            "https://app.seshat.ai",
		CallbackURL:            "http://localhost:8090/auth/callback",
		RedirectURLs:           []string{"http://localhost:8090/auth/callback", "http://localhost:8090/auth/callback-2"},
		PostLogoutRedirectURLs: []string{"http://localhost:8090/logout"},
		AllowedOrigins:         []string{"http://localhost:8090"},
		GrantTypes:             []string{"authorization_code", "refresh_token"},
		ResponseTypes:          []string{"code"},
		Scopes:                 []string{"openid", "profile", "email", "offline_access"},
		ProviderIDs:            []string{provider.ID},
		AllowSignup:            true,
		AllowPasswordLogin:     true,
		PKCERequired:           true,
		IssueRefreshToken:      true,
	})
	if err != nil {
		t.Fatalf("update application: %v", err)
	}
	if updatedApplication.DisplayName != "Seshat Desktop Prod" {
		t.Fatalf("unexpected updated application display name: %s", updatedApplication.DisplayName)
	}
	if updatedApplication.CallbackURL != "http://localhost:8090/auth/callback" {
		t.Fatalf("unexpected updated callback url: %s", updatedApplication.CallbackURL)
	}
	if len(updatedApplication.RedirectURLs) != 2 {
		t.Fatalf("unexpected redirect urls: %+v", updatedApplication.RedirectURLs)
	}
}

func TestServiceLayerReadPathsDoNotExposeStoredClientSecretCiphertext(t *testing.T) {
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

	var storedProvider sdb.Provider
	if err := service.db.Gorm().First(&storedProvider, "id = ?", provider.ID).Error; err != nil {
		t.Fatalf("load stored provider: %v", err)
	}
	var storedApplication sdb.Application
	if err := service.db.Gorm().First(&storedApplication, "id = ?", application.ID).Error; err != nil {
		t.Fatalf("load stored application: %v", err)
	}

	loadedProvider, err := service.GetProvider(context.Background(), principal, provider.ID)
	if err != nil {
		t.Fatalf("get provider: %v", err)
	}
	if loadedProvider.ClientSecret == storedProvider.ClientSecret {
		t.Fatal("expected provider read path not to expose stored ciphertext")
	}
	if loadedProvider.ClientSecret == "" || !strings.Contains(loadedProvider.ClientSecret, "*") {
		t.Fatalf("expected provider read path to return a masked secret marker, got %q", loadedProvider.ClientSecret)
	}

	loadedApplication, err := service.GetApplication(context.Background(), principal, application.ID)
	if err != nil {
		t.Fatalf("get application: %v", err)
	}
	if loadedApplication.ClientSecret == storedApplication.ClientSecret {
		t.Fatal("expected application read path not to expose stored ciphertext")
	}
	if loadedApplication.ClientSecret == "" || !strings.Contains(loadedApplication.ClientSecret, "*") {
		t.Fatalf("expected application read path to return a masked secret marker, got %q", loadedApplication.ClientSecret)
	}

	providers, _, err := service.ListProviders(context.Background(), principal, orgID, sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list providers: %v", err)
	}
	if len(providers) != 1 || providers[0].ClientSecret == storedProvider.ClientSecret {
		t.Fatalf("expected listed providers to stay masked, got %+v", providers)
	}

	applications, _, err := service.ListApplications(context.Background(), principal, orgID, sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list applications: %v", err)
	}
	if len(applications) != 1 || applications[0].ClientSecret == storedApplication.ClientSecret {
		t.Fatalf("expected listed applications to stay masked, got %+v", applications)
	}
}

func TestPersistedSecretsAreNotStoredInPlaintext(t *testing.T) {
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

	var storedSession sdb.Session
	if err := service.db.Gorm().First(&storedSession, "id = ?", principal.Session.ID).Error; err != nil {
		t.Fatalf("load stored session: %v", err)
	}
	if storedSession.Token == boot.Token {
		t.Fatal("expected the stored session token to be hashed")
	}

	provider, err := service.CreateProvider(context.Background(), principal, CreateProviderParams{
		OrganizationID: boot.Organizations[0].ID,
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
	var storedProvider sdb.Provider
	if err := service.db.Gorm().First(&storedProvider, "id = ?", provider.ID).Error; err != nil {
		t.Fatalf("load stored provider: %v", err)
	}
	if storedProvider.ClientSecret == "client-secret" {
		t.Fatal("expected the stored provider secret to be encrypted")
	}

	application, err := service.CreateApplication(context.Background(), principal, CreateApplicationParams{
		OrganizationID: boot.Organizations[0].ID,
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
	var storedApplication sdb.Application
	if err := service.db.Gorm().First(&storedApplication, "id = ?", application.ID).Error; err != nil {
		t.Fatalf("load stored application: %v", err)
	}
	if storedApplication.ClientSecret == application.ClientSecret {
		t.Fatal("expected the stored application secret to be encrypted")
	}

	invitation, err := service.CreateInvitation(context.Background(), principal, CreateInvitationParams{
		OrganizationID: boot.Organizations[0].ID,
		Email:          "invitee@example.com",
		Role:           "viewer",
	})
	if err != nil {
		t.Fatalf("create invitation: %v", err)
	}
	var storedInvitation sdb.Invitation
	if err := service.db.Gorm().First(&storedInvitation, "id = ?", invitation.ID).Error; err != nil {
		t.Fatalf("load stored invitation: %v", err)
	}
	if storedInvitation.Token == invitation.Token {
		t.Fatal("expected the stored invitation token to be hashed")
	}
}
