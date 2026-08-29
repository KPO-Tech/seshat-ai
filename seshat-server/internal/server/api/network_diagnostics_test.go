package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNetworkDiagnosticsEndpointRequiresAuth(t *testing.T) {
	handler, _, _, orgID, _ := newTestServerRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/network-diagnostics?organization_id="+orgID, nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
	}
}

func TestNetworkDiagnosticsEndpointReturnsChecksForOwner(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/network-diagnostics?organization_id="+orgID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Checks []struct {
			Name string `json:"name"`
		} `json:"checks"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	// No SMTP/SSO providers configured in this fixture, so an empty (never
	// nil) list is the correct response, not an error.
	if body.Checks == nil {
		t.Fatal("expected a non-nil (possibly empty) checks list")
	}
}
