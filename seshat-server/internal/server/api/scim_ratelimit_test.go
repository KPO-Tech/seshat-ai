package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestScimProtocolRateLimitedWithASCIMFormattedError proves two things at
// once: the /scim/v2/* surface is rate-limited at all (Étape 7 of the
// staged plan), and a 429 from it still parses as a SCIM error body, not
// this API's usual {"error":{"message":...}} envelope - a real IdP's SCIM
// client only knows how to parse the former.
func TestScimProtocolRateLimitedWithASCIMFormattedError(t *testing.T) {
	handler, scimToken := scimTestConnection(t)

	var lastCode int
	var lastBody []byte
	// The connection's own scimLimiter has a burst of 60 - comfortably
	// exceeded by 80 rapid requests from the same test client IP.
	for i := 0; i < 80; i++ {
		request := httptest.NewRequest(http.MethodGet, "/scim/v2/ServiceProviderConfig", nil)
		request.Header.Set("Authorization", "Bearer "+scimToken)
		request.RemoteAddr = "203.0.113.10:12345"
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		lastCode = recorder.Code
		lastBody = recorder.Body.Bytes()
		if lastCode == http.StatusTooManyRequests {
			break
		}
	}
	if lastCode != http.StatusTooManyRequests {
		t.Fatalf("expected to hit the rate limit within 80 rapid requests, last status was %d", lastCode)
	}
	var body struct {
		Schemas []string `json:"schemas"`
		Status  string   `json:"status"`
	}
	if err := json.Unmarshal(lastBody, &body); err != nil {
		t.Fatalf("decode rate-limit error body: %v", err)
	}
	if len(body.Schemas) != 1 || body.Schemas[0] != scimErrorSchema || body.Status != "429" {
		t.Fatalf("expected a SCIM-formatted 429 error, got %+v (raw: %s)", body, lastBody)
	}
}
