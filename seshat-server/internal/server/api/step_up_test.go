package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func TestStepUpPasswordEndpointRequiresAuth(t *testing.T) {
	handler, _, _, _, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"current_password": "password123"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/step-up/password", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
	}
}

func TestStepUpPasswordEndpointRejectsWrongPassword(t *testing.T) {
	handler, _, token, _, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"current_password": "not-the-password"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/step-up/password", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for a wrong password, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStepUpPasswordEndpointSucceedsWithCorrectPassword(t *testing.T) {
	handler, _, token, _, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"current_password": "password123"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/step-up/password", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestStepUpRequiredErrorMapsTo428WithMachineReadableCode proves the
// apperr.StepUpRequired -> HTTP wire mapping directly: writeControlPlaneError
// is the one function every sensitive action's error already flows through
// (writeIAMError is a thin alias of it), so this doesn't need a real
// sensitive action wired to RequireFreshAuth yet (see Etape 5) to verify
// the response shape a client will actually see.
func TestStepUpRequiredErrorMapsTo428WithMachineReadableCode(t *testing.T) {
	rec := httptest.NewRecorder()
	writeIAMError(rec, iam.ErrStepUpRequired("please confirm your identity again"))

	if rec.Code != http.StatusPreconditionRequired {
		t.Fatalf("expected 428, got %d: %s", rec.Code, rec.Body.String())
	}
	var decoded struct {
		Error struct {
			Message string `json:"message"`
			Code    string `json:"code"`
		} `json:"error"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&decoded); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if decoded.Error.Code != "step_up_required" {
		t.Fatalf("expected error.code=step_up_required, got %q", decoded.Error.Code)
	}
	if decoded.Error.Message == "" {
		t.Fatal("expected a non-empty message alongside the code")
	}
}

func TestOIDCStepUpStartEndpointRequiresAuth(t *testing.T) {
	handler, _, _, _, _ := newTestServerRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/step-up/oidc/some-provider/start?redirect_uri=https://console.example.com/x", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
	}
}

func TestSAMLStepUpStartEndpointRequiresAuth(t *testing.T) {
	handler, _, _, _, _ := newTestServerRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/step-up/saml/some-provider/start?redirect_uri=https://console.example.com/x", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
	}
}

// TestOtherErrorKindsNeverGetTheStepUpCode guards the "additive, not a
// contract change for everyone else" claim: a plain 401 must never grow a
// "code" field just because step_up_required's mapping added one to the
// shared Error schema.
func TestOtherErrorKindsNeverGetTheStepUpCode(t *testing.T) {
	rec := httptest.NewRecorder()
	writeIAMError(rec, iam.ErrUnauthorized("invalid session token"))

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
	var decoded map[string]json.RawMessage
	if err := json.NewDecoder(rec.Body).Decode(&decoded); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	var errObj map[string]json.RawMessage
	if err := json.Unmarshal(decoded["error"], &errObj); err != nil {
		t.Fatalf("decode error object: %v", err)
	}
	if _, hasCode := errObj["code"]; hasCode {
		t.Fatal("expected a plain unauthorized error to have no code field")
	}
}
