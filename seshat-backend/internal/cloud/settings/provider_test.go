package cloudsettings

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
)

func principalWithOrg(orgID string) *backendauth.Principal {
	return &backendauth.Principal{
		User:        backendauth.User{ID: "usr_1", Email: "member@example.com"},
		AuthSession: backendauth.AuthSession{ID: "token123"},
		Roles:       []string{"member"},
		WorkspaceMemberships: []backendauth.WorkspaceMembership{
			{WorkspaceID: "ws_1", OrganizationID: orgID, Role: "member"},
		},
	}
}

// TestResolveDefaultForUserFallsBackToOrgProvider is a regression test for
// the onboarding gap this session found: a freshly connected-mode account
// with zero personal provider keys used to silently resolve to nothing (and
// therefore the backend's own unconfigured env vars) even when the
// organization already has a provider configured in Seshat Console. It must
// now pick up the org's first configured provider automatically.
func TestResolveDefaultForUserFallsBackToOrgProvider(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("provider") != "anthropic" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		_ = json.NewEncoder(w).Encode(ResolvedProviderSetting{
			Provider: "anthropic", DefaultModel: "claude-opus-4-8", APIKey: "sk-secret", Source: "organization",
		})
	}))
	defer srv.Close()

	p := NewProvider(srv.URL, nil)
	principal := principalWithOrg("org_1")

	resolved, err := p.ResolveDefaultForUser(context.Background(), principal)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resolved == nil {
		t.Fatal("expected a resolved provider config, got nil")
	}
	if resolved.Provider != "anthropic" || resolved.Secret != "sk-secret" {
		t.Errorf("unexpected resolved config: %+v", resolved)
	}
	if resolved.SettingID != "org:anthropic" {
		t.Errorf("expected synthetic org setting id, got %q", resolved.SettingID)
	}
}

func TestResolveDefaultForUserReturnsNilWithoutOrganization(t *testing.T) {
	p := NewProvider("http://unused.invalid", nil)
	principal := &backendauth.Principal{
		User:        backendauth.User{ID: "usr_2", Email: "admin@example.com"},
		AuthSession: backendauth.AuthSession{ID: "token456"},
		Roles:       []string{"admin"},
	}

	resolved, err := p.ResolveDefaultForUser(context.Background(), principal)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resolved != nil {
		t.Errorf("expected nil for a caller with no organization membership, got %+v", resolved)
	}
}
