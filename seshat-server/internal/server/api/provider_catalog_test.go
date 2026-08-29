package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestProviderCatalogListsProvidersFromTheSDK is a smoke test that the
// endpoint actually returns live data from the SDK's registry (not an empty
// or hand-maintained stub) and requires authentication like every other
// data endpoint.
func TestProviderCatalogListsProvidersFromTheSDK(t *testing.T) {
	handler, _, token, _, _ := newTestServerRouter(t)

	unauthed := httptest.NewRequest(http.MethodGet, "/api/v1/provider-catalog", nil)
	unauthedRecorder := httptest.NewRecorder()
	handler.ServeHTTP(unauthedRecorder, unauthed)
	if unauthedRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected an unauthenticated request to be rejected, got %d", unauthedRecorder.Code)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/v1/provider-catalog", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected success, got %d: %s", recorder.Code, recorder.Body.String())
	}

	var body struct {
		Providers []providerCatalogEntry `json:"providers"`
		Count     int                    `json:"count"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Count == 0 || len(body.Providers) != body.Count {
		t.Fatalf("expected a non-empty, consistent provider list, got %+v", body)
	}

	var anthropic *providerCatalogEntry
	for i := range body.Providers {
		if body.Providers[i].Name == "anthropic" {
			anthropic = &body.Providers[i]
			break
		}
	}
	if anthropic == nil {
		t.Fatalf("expected the SDK's anthropic provider to be present, got %+v", body.Providers)
	}
	if anthropic.AuthType != "api_key" || len(anthropic.Models) == 0 {
		t.Fatalf("unexpected anthropic entry: %+v", anthropic)
	}
}
