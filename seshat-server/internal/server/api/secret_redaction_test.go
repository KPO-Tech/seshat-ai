package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func TestApplicationSecretIsRevealedOnceThenRedacted(t *testing.T) {
	handler, backend, token, orgID, principal := newTestServerRouter(t)

	application, err := backend.IAM.CreateApplication(context.Background(), principal, iam.CreateApplicationParams{
		OrganizationID: orgID,
		Name:           "Seshat Desktop",
		Slug:           "seshat-desktop",
		DisplayName:    "Seshat Desktop",
		HomepageURL:    "https://seshat.ai",
		CallbackURL:    "http://localhost:8090/callback",
	})
	if err != nil {
		t.Fatalf("create application: %v", err)
	}
	if application.ClientSecret == "" {
		t.Fatal("expected the service layer to generate a client secret")
	}

	// The HTTP create response is the one place the real secret is allowed
	// to appear, since it is server-generated and this is the caller's only
	// chance to capture it.
	createBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"name":            "Second App",
		"slug":            "second-app",
		"display_name":    "Second App",
		"homepage_url":    "https://seshat.ai",
		"callback_url":    "http://localhost:8090/callback",
	})
	createRequest := httptest.NewRequest(http.MethodPost, "/api/v1/applications", bytes.NewReader(createBody))
	createRequest.Header.Set("Authorization", "Bearer "+token)
	createRecorder := httptest.NewRecorder()
	handler.ServeHTTP(createRecorder, createRequest)
	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("expected application creation success, got %d: %s", createRecorder.Code, createRecorder.Body.String())
	}
	var created iam.Application
	if err := json.NewDecoder(createRecorder.Body).Decode(&created); err != nil {
		t.Fatalf("decode created application: %v", err)
	}
	if created.ClientSecret == "" || strings.Contains(created.ClientSecret, "*") {
		t.Fatalf("expected create response to reveal the real client secret, got %q", created.ClientSecret)
	}

	getRequest := httptest.NewRequest(http.MethodGet, "/api/v1/applications/"+application.ID, nil)
	getRequest.Header.Set("Authorization", "Bearer "+token)
	getRecorder := httptest.NewRecorder()
	handler.ServeHTTP(getRecorder, getRequest)
	if getRecorder.Code != http.StatusOK {
		t.Fatalf("expected get application success, got %d", getRecorder.Code)
	}
	var fetched iam.Application
	if err := json.NewDecoder(getRecorder.Body).Decode(&fetched); err != nil {
		t.Fatalf("decode fetched application: %v", err)
	}
	if fetched.ClientSecret != redactSecret(application.ClientSecret) {
		t.Fatalf("expected get response to redact the client secret, got %q", fetched.ClientSecret)
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/api/v1/applications", nil)
	listRequest.Header.Set("Authorization", "Bearer "+token)
	listRecorder := httptest.NewRecorder()
	handler.ServeHTTP(listRecorder, listRequest)
	if listRecorder.Code != http.StatusOK {
		t.Fatalf("expected list applications success, got %d", listRecorder.Code)
	}
	var listPayload struct {
		Applications []iam.Application `json:"applications"`
	}
	if err := json.NewDecoder(listRecorder.Body).Decode(&listPayload); err != nil {
		t.Fatalf("decode application list: %v", err)
	}
	for _, item := range listPayload.Applications {
		if item.ClientSecret != "" && !strings.Contains(item.ClientSecret, "*") {
			t.Fatalf("expected every listed application secret to be redacted, got %q for %s", item.ClientSecret, item.ID)
		}
	}
}

func TestProviderSecretIsNeverRevealedOverAPI(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	createBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"name":            "Google Workspace",
		"slug":            "google-workspace",
		"kind":            "oidc",
		"client_id":       "client-id",
		"client_secret":   "client-secret-value",
		"issuer_url":      "https://accounts.google.com",
	})
	createRequest := httptest.NewRequest(http.MethodPost, "/api/v1/providers", bytes.NewReader(createBody))
	createRequest.Header.Set("Authorization", "Bearer "+token)
	createRecorder := httptest.NewRecorder()
	handler.ServeHTTP(createRecorder, createRequest)
	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("expected provider creation success, got %d: %s", createRecorder.Code, createRecorder.Body.String())
	}
	var created iam.Provider
	if err := json.NewDecoder(createRecorder.Body).Decode(&created); err != nil {
		t.Fatalf("decode created provider: %v", err)
	}
	if created.ClientSecret != redactSecret("client-secret-value") {
		t.Fatalf("expected create response to redact the caller-supplied secret, got %q", created.ClientSecret)
	}

	getRequest := httptest.NewRequest(http.MethodGet, "/api/v1/providers/"+created.ID, nil)
	getRequest.Header.Set("Authorization", "Bearer "+token)
	getRecorder := httptest.NewRecorder()
	handler.ServeHTTP(getRecorder, getRequest)
	if getRecorder.Code != http.StatusOK {
		t.Fatalf("expected get provider success, got %d", getRecorder.Code)
	}
	var fetched iam.Provider
	if err := json.NewDecoder(getRecorder.Body).Decode(&fetched); err != nil {
		t.Fatalf("decode fetched provider: %v", err)
	}
	if fetched.ClientSecret != redactSecret("client-secret-value") {
		t.Fatalf("expected get response to redact the client secret, got %q", fetched.ClientSecret)
	}
}

func TestViewerCannotReadApplicationsOrProvidersWithoutExplicitGrant(t *testing.T) {
	handler, backend, adminToken, orgID, principal := newTestServerRouter(t)
	_ = adminToken

	application, err := backend.IAM.CreateApplication(context.Background(), principal, iam.CreateApplicationParams{
		OrganizationID: orgID,
		Name:           "Seshat Desktop",
		Slug:           "seshat-desktop",
		DisplayName:    "Seshat Desktop",
		HomepageURL:    "https://seshat.ai",
		CallbackURL:    "http://localhost:8090/callback",
	})
	if err != nil {
		t.Fatalf("create application: %v", err)
	}
	provider, err := backend.IAM.CreateProvider(context.Background(), principal, iam.CreateProviderParams{
		OrganizationID: orgID,
		Name:           "Google Workspace",
		Slug:           "google-workspace",
		Kind:           "oidc",
		ClientID:       "client-id",
		ClientSecret:   "client-secret-value",
		IssuerURL:      "https://accounts.google.com",
	})
	if err != nil {
		t.Fatalf("create provider: %v", err)
	}

	viewer, err := backend.IAM.CreateUser(context.Background(), principal, iam.CreateUserParams{
		Email:       "viewer@example.com",
		Password:    "password123",
		DisplayName: "Viewer",
	})
	if err != nil {
		t.Fatalf("create viewer user: %v", err)
	}
	if _, err := backend.IAM.CreateMembership(context.Background(), principal, iam.CreateMembershipParams{
		OrganizationID: orgID,
		UserID:         viewer.ID,
		Role:           "viewer",
	}); err != nil {
		t.Fatalf("create viewer membership: %v", err)
	}
	viewerLogin, err := backend.IAM.Login(context.Background(), "viewer@example.com", "password123")
	if err != nil {
		t.Fatalf("login viewer: %v", err)
	}

	getApplication := httptest.NewRequest(http.MethodGet, "/api/v1/applications/"+application.ID, nil)
	getApplication.Header.Set("Authorization", "Bearer "+viewerLogin.Token)
	appRecorder := httptest.NewRecorder()
	handler.ServeHTTP(appRecorder, getApplication)
	if appRecorder.Code != http.StatusNotFound {
		t.Fatalf("expected viewer to be denied application access, got %d: %s", appRecorder.Code, appRecorder.Body.String())
	}

	getProvider := httptest.NewRequest(http.MethodGet, "/api/v1/providers/"+provider.ID, nil)
	getProvider.Header.Set("Authorization", "Bearer "+viewerLogin.Token)
	providerRecorder := httptest.NewRecorder()
	handler.ServeHTTP(providerRecorder, getProvider)
	if providerRecorder.Code != http.StatusNotFound {
		t.Fatalf("expected viewer to be denied provider access, got %d: %s", providerRecorder.Code, providerRecorder.Body.String())
	}

	listApplications := httptest.NewRequest(http.MethodGet, "/api/v1/applications", nil)
	listApplications.Header.Set("Authorization", "Bearer "+viewerLogin.Token)
	listRecorder := httptest.NewRecorder()
	handler.ServeHTTP(listRecorder, listApplications)
	if listRecorder.Code != http.StatusOK {
		t.Fatalf("expected list applications success, got %d", listRecorder.Code)
	}
	var listPayload struct {
		Applications []iam.Application `json:"applications"`
	}
	if err := json.NewDecoder(listRecorder.Body).Decode(&listPayload); err != nil {
		t.Fatalf("decode application list: %v", err)
	}
	if len(listPayload.Applications) != 0 {
		t.Fatalf("expected viewer to see no applications, got %d", len(listPayload.Applications))
	}
}
