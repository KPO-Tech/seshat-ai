package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	serverapp "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/app"
	serverconfig "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/config"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func TestUsersListSupportsSearchSortAndPagination(t *testing.T) {
	handler, backend, token, _, principal := newTestServerRouter(t)

	for _, params := range []iam.CreateUserParams{
		{Email: "alice@example.com", Password: "password123", DisplayName: "Alice Johnson"},
		{Email: "alicia@example.com", Password: "password123", DisplayName: "Alicia Stone"},
		{Email: "bob@example.com", Password: "password123", DisplayName: "Bob Martin"},
	} {
		if _, err := backend.IAM.CreateUser(context.Background(), principal, params); err != nil {
			t.Fatalf("create user %s: %v", params.Email, err)
		}
	}

	request := httptest.NewRequest(http.MethodGet, "/api/v1/users?q=ali&sort=display_name&order=desc&limit=1", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", recorder.Code)
	}

	var payload struct {
		Users   []iam.User `json:"users"`
		Count   int        `json:"count"`
		Total   int        `json:"total"`
		Limit   int        `json:"limit"`
		Offset  int        `json:"offset"`
		HasMore bool       `json:"has_more"`
		Sort    string     `json:"sort"`
		Order   string     `json:"order"`
		Query   string     `json:"query"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if payload.Total != 2 {
		t.Fatalf("expected two filtered users, got %d", payload.Total)
	}
	if payload.Count != 1 {
		t.Fatalf("expected one returned user, got %d", payload.Count)
	}
	if !payload.HasMore {
		t.Fatal("expected has_more to be true")
	}
	if payload.Sort != "display_name" || payload.Order != "desc" {
		t.Fatalf("unexpected sort metadata: %s %s", payload.Sort, payload.Order)
	}
	if len(payload.Users) != 1 || payload.Users[0].DisplayName != "Alicia Stone" {
		t.Fatalf("unexpected first page payload: %+v", payload.Users)
	}
}

func TestApplicationAndProviderDeleteEndpoints(t *testing.T) {
	handler, backend, token, orgID, principal := newTestServerRouter(t)

	provider, err := backend.IAM.CreateProvider(context.Background(), principal, iam.CreateProviderParams{
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
	application, err := backend.IAM.CreateApplication(context.Background(), principal, iam.CreateApplicationParams{
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

	deleteProvider := httptest.NewRequest(http.MethodDelete, "/api/v1/providers/"+provider.ID, nil)
	deleteProvider.Header.Set("Authorization", "Bearer "+token)
	providerRecorder := httptest.NewRecorder()
	handler.ServeHTTP(providerRecorder, deleteProvider)
	if providerRecorder.Code != http.StatusConflict {
		t.Fatalf("expected provider delete conflict, got %d", providerRecorder.Code)
	}

	deleteApplication := httptest.NewRequest(http.MethodDelete, "/api/v1/applications/"+application.ID, nil)
	deleteApplication.Header.Set("Authorization", "Bearer "+token)
	applicationRecorder := httptest.NewRecorder()
	handler.ServeHTTP(applicationRecorder, deleteApplication)
	if applicationRecorder.Code != http.StatusNoContent {
		t.Fatalf("expected application delete success, got %d", applicationRecorder.Code)
	}

	deleteProvider = httptest.NewRequest(http.MethodDelete, "/api/v1/providers/"+provider.ID, nil)
	deleteProvider.Header.Set("Authorization", "Bearer "+token)
	providerRecorder = httptest.NewRecorder()
	handler.ServeHTTP(providerRecorder, deleteProvider)
	if providerRecorder.Code != http.StatusNoContent {
		t.Fatalf("expected provider delete success, got %d", providerRecorder.Code)
	}
}

func TestGroupPolicyBindingEnablesInvitationEndpoint(t *testing.T) {
	handler, backend, adminToken, orgID, principal := newTestServerRouter(t)

	member, err := backend.IAM.CreateUser(context.Background(), principal, iam.CreateUserParams{
		Email:       "member@example.com",
		Password:    "password123",
		DisplayName: "Member",
	})
	if err != nil {
		t.Fatalf("create member: %v", err)
	}
	if _, err := backend.IAM.CreateMembership(context.Background(), principal, iam.CreateMembershipParams{
		OrganizationID: orgID,
		UserID:         member.ID,
		Role:           "viewer",
	}); err != nil {
		t.Fatalf("create membership: %v", err)
	}

	permissionsRequest := httptest.NewRequest(http.MethodGet, "/api/v1/permissions", nil)
	permissionsRequest.Header.Set("Authorization", "Bearer "+adminToken)
	permissionsRecorder := httptest.NewRecorder()
	handler.ServeHTTP(permissionsRecorder, permissionsRequest)
	if permissionsRecorder.Code != http.StatusOK {
		t.Fatalf("expected permissions success, got %d", permissionsRecorder.Code)
	}

	groupBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"name":            "Support Operators",
		"slug":            "support-operators",
		"description":     "Delegated support team",
		"member_user_ids": []string{member.ID},
	})
	groupRequest := httptest.NewRequest(http.MethodPost, "/api/v1/groups", bytes.NewReader(groupBody))
	groupRequest.Header.Set("Authorization", "Bearer "+adminToken)
	groupRecorder := httptest.NewRecorder()
	handler.ServeHTTP(groupRecorder, groupRequest)
	if groupRecorder.Code != http.StatusCreated {
		t.Fatalf("expected group creation success, got %d", groupRecorder.Code)
	}

	var group iam.Group
	if err := json.NewDecoder(groupRecorder.Body).Decode(&group); err != nil {
		t.Fatalf("decode group: %v", err)
	}

	bindingBody, _ := json.Marshal(map[string]any{
		"organization_id":  orgID,
		"name":             "Support Invitations",
		"description":      "Allow the support team to invite users.",
		"subject_type":     "group",
		"subject_id":       group.ID,
		"permission_codes": []string{"invitations.manage"},
	})
	bindingRequest := httptest.NewRequest(http.MethodPost, "/api/v1/policy-bindings", bytes.NewReader(bindingBody))
	bindingRequest.Header.Set("Authorization", "Bearer "+adminToken)
	bindingRecorder := httptest.NewRecorder()
	handler.ServeHTTP(bindingRecorder, bindingRequest)
	if bindingRecorder.Code != http.StatusCreated {
		t.Fatalf("expected policy binding creation success, got %d", bindingRecorder.Code)
	}

	memberLogin, err := backend.IAM.Login(context.Background(), member.Email, "password123")
	if err != nil {
		t.Fatalf("login member: %v", err)
	}
	inviteBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"email":           "future-user@example.com",
		"role":            "viewer",
		"expires_in_days": 7,
	})
	inviteRequest := httptest.NewRequest(http.MethodPost, "/api/v1/invitations", bytes.NewReader(inviteBody))
	inviteRequest.Header.Set("Authorization", "Bearer "+memberLogin.Token)
	inviteRecorder := httptest.NewRecorder()
	handler.ServeHTTP(inviteRecorder, inviteRequest)
	if inviteRecorder.Code != http.StatusCreated {
		t.Fatalf("expected invitation creation success, got %d", inviteRecorder.Code)
	}
}

func newTestServerRouter(t *testing.T) (http.Handler, *serverapp.App, string, string, *iam.Principal) {
	t.Helper()
	backend, boot, principal := newTestBackend(t)
	handler := CreateRouter(Config{}, backend)
	return handler, backend, boot.Token, boot.Organizations[0].ID, principal
}

// newTestBackend bootstraps a fresh in-memory backend without wiring a
// router, so tests that need a custom api.Config (e.g. CORS origins) can
// build their own router around the same backend.
func newTestBackend(t *testing.T) (*serverapp.App, *iam.AuthResult, *iam.Principal) {
	t.Helper()
	t.Setenv("SESHAT_SERVER_ENCRYPTION_KEY", "g/t9EsDxTTJSTu6Q+Kne06PBHoGmhH3yAJaEuHmFl9A=")

	cfg := serverconfig.Config{
		DB:         sdb.Config{Driver: sdb.DriverSQLite, DSN: ":memory:"},
		SessionTTL: time.Hour,
	}
	backend, err := serverapp.New(cfg)
	if err != nil {
		t.Fatalf("new backend: %v", err)
	}

	boot, err := backend.IAM.Bootstrap(context.Background(), iam.BootstrapParams{
		Email:            "admin@example.com",
		Password:         "password123",
		DisplayName:      "Admin",
		OrganizationName: "Seshat",
		OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	principal, err := backend.IAM.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}

	return backend, boot, principal
}
