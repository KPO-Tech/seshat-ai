package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestModelsListReturnsTheLiveSDKCatalog is a regression test for the
// dynamic-catalog rewrite: this endpoint used to return a hand-rolled
// map keyed by provider name; it now mirrors seshat-server's
// GET /provider-catalog shape (an ordered array, same field names) so both
// frontends can share one mental model of the response.
func TestModelsListReturnsTheLiveSDKCatalog(t *testing.T) {
	app, _ := newAuditTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/models", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected success, got %d: %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Providers  []providerCatalogEntry `json:"providers"`
		Count      int                    `json:"count"`
		TotalCount int                    `json:"total_count"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Count == 0 || len(body.Providers) != body.Count {
		t.Fatalf("expected a non-empty, consistent provider list, got %+v", body)
	}
	if body.TotalCount == 0 {
		t.Fatal("expected a non-zero total model count across all providers")
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

func TestModelsListRejectsNonGET(t *testing.T) {
	app, _ := newAuditTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/models", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}
