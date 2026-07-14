package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCORSAllowsConfiguredOriginAndRejectsOthers(t *testing.T) {
	backend, _, _ := newTestBackend(t)
	handler := CreateRouter(Config{CORSAllowedOrigins: []string{"https://app.seshat.ai"}}, backend)

	preflight := httptest.NewRequest(http.MethodOptions, "/api/v1/organizations", nil)
	preflight.Header.Set("Origin", "https://app.seshat.ai")
	preflight.Header.Set("Access-Control-Request-Method", "GET")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, preflight)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected preflight to return 204, got %d", recorder.Code)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "https://app.seshat.ai" {
		t.Fatalf("expected allowed origin echoed back, got %q", got)
	}

	disallowed := httptest.NewRequest(http.MethodOptions, "/api/v1/organizations", nil)
	disallowed.Header.Set("Origin", "https://evil.example.com")
	disallowed.Header.Set("Access-Control-Request-Method", "GET")
	disallowedRecorder := httptest.NewRecorder()
	handler.ServeHTTP(disallowedRecorder, disallowed)

	if got := disallowedRecorder.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("expected no CORS header for a disallowed origin, got %q", got)
	}
}

func TestNoCORSHeadersWhenNoOriginsConfigured(t *testing.T) {
	backend, _, _ := newTestBackend(t)
	handler := CreateRouter(Config{}, backend)

	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	request.Header.Set("Origin", "https://app.seshat.ai")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("expected no CORS header when no origins are configured, got %q", got)
	}
}
