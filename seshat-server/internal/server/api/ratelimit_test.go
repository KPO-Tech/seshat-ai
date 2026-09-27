package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"golang.org/x/time/rate"
)

func TestLoginIsRateLimitedPerIP(t *testing.T) {
	body, _ := json.Marshal(map[string]any{"email": "admin@example.com", "password": "wrong-password"})
	limiter := newIPRateLimiter(rate.Limit(5.0/60.0), 5)
	handler := rateLimited(limiter, func(w http.ResponseWriter, _ *http.Request) {
		writeJSONError(w, http.StatusUnauthorized, "bad credentials")
	})

	// Burst is 5: the first five attempts should reach the handler (and be
	// rejected for bad credentials), the sixth should be stopped by the
	// limiter before ever touching auth logic.
	for i := 0; i < 5; i++ {
		request := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected 401 for bad credentials, got %d", i+1, recorder.Code)
		}
	}

	sixth := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
	sixthRecorder := httptest.NewRecorder()
	handler.ServeHTTP(sixthRecorder, sixth)
	if sixthRecorder.Code != http.StatusTooManyRequests {
		t.Fatalf("expected the sixth rapid attempt to be rate limited, got %d", sixthRecorder.Code)
	}
}

// TestInvitationAcceptIsRateLimitedPerIP is a regression test for the
// 2026-08-06 audit finding: unlike every other token-bearing auth endpoint
// (login, register, forgot/reset-password), /invitations/accept had no rate
// limit — an authenticated caller could submit unlimited guessed invitation
// tokens per second.
func TestInvitationAcceptIsRateLimitedPerIP(t *testing.T) {
	handler, _, token, _, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"token": "invite_does-not-exist"})

	// Burst is 5: the first five attempts should reach the handler (and fail
	// because the token doesn't correspond to any real invitation), the
	// sixth should be stopped by the limiter before ever touching that logic.
	for i := 0; i < 5; i++ {
		request := httptest.NewRequest(http.MethodPost, "/api/v1/invitations/accept", bytes.NewReader(body))
		request.Header.Set("Authorization", "Bearer "+token)
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		if recorder.Code == http.StatusTooManyRequests {
			t.Fatalf("attempt %d: unexpectedly rate limited already, got %d", i+1, recorder.Code)
		}
	}

	sixth := httptest.NewRequest(http.MethodPost, "/api/v1/invitations/accept", bytes.NewReader(body))
	sixth.Header.Set("Authorization", "Bearer "+token)
	sixthRecorder := httptest.NewRecorder()
	handler.ServeHTTP(sixthRecorder, sixth)
	if sixthRecorder.Code != http.StatusTooManyRequests {
		t.Fatalf("expected the sixth rapid attempt to be rate limited, got %d", sixthRecorder.Code)
	}
}
