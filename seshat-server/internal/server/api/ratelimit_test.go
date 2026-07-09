package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLoginIsRateLimitedPerIP(t *testing.T) {
	handler, _, _, _, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"email": "admin@example.com", "password": "wrong-password"})

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
