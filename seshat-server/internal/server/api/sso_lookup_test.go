package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func TestSSOLookupEndpointIsPublic(t *testing.T) {
	handler, _, _, _, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"email": "nobody@unmatched.example"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/sso-lookup", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 without a token (public endpoint), got %d: %s", rec.Code, rec.Body.String())
	}
	var decoded map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&decoded); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(decoded) != 0 {
		t.Fatalf("expected an empty object for an unmatched email, got %+v", decoded)
	}
}

func TestSSOLookupEndpointFindsAMatchingProvider(t *testing.T) {
	handler, backend, _, orgID, principal := newTestServerRouter(t)

	if _, err := backend.IAM.CreateProvider(context.Background(), principal, iam.CreateProviderParams{
		OrganizationID: orgID, Name: "Acme Okta", Slug: "acme-okta", Kind: "oidc",
		ClientID: "client-id", ClientSecret: "client-secret", IssuerURL: "https://accounts.google.com",
		AllowedDomains: []string{"acme.com"},
	}); err != nil {
		t.Fatalf("create provider: %v", err)
	}

	body, _ := json.Marshal(map[string]any{"email": "employee@acme.com"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/sso-lookup", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var match struct {
		ProviderID string `json:"provider_id"`
		Kind       string `json:"kind"`
		Name       string `json:"name"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&match); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if match.Kind != "oidc" || match.Name != "Acme Okta" {
		t.Fatalf("unexpected match: %+v", match)
	}
}
