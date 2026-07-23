package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func TestLogoutRevokesTheCurrentSessionOnly(t *testing.T) {
	handler, backend, adminToken, _, _ := newTestServerRouter(t)

	logoutRequest := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
	logoutRequest.Header.Set("Authorization", "Bearer "+adminToken)
	logoutRecorder := httptest.NewRecorder()
	handler.ServeHTTP(logoutRecorder, logoutRequest)
	if logoutRecorder.Code != http.StatusNoContent {
		t.Fatalf("expected logout success, got %d: %s", logoutRecorder.Code, logoutRecorder.Body.String())
	}

	meRequest := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	meRequest.Header.Set("Authorization", "Bearer "+adminToken)
	meRecorder := httptest.NewRecorder()
	handler.ServeHTTP(meRecorder, meRequest)
	if meRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected the logged-out token to be rejected, got %d", meRecorder.Code)
	}

	if _, err := backend.IAM.Login(context.Background(), "admin@example.com", "password123"); err != nil {
		t.Fatalf("expected to still be able to log back in: %v", err)
	}
}

func TestRegularUserCanManageOnlyTheirOwnSessions(t *testing.T) {
	handler, backend, _, orgID, principal := newTestServerRouter(t)

	alice, err := backend.IAM.CreateUser(context.Background(), principal, iam.CreateUserParams{
		Email: "alice@example.com", Password: "password123", DisplayName: "Alice", OrganizationID: orgID, Role: "member",
	})
	if err != nil {
		t.Fatalf("create alice: %v", err)
	}
	bob, err := backend.IAM.CreateUser(context.Background(), principal, iam.CreateUserParams{
		Email: "bob@example.com", Password: "password123", DisplayName: "Bob", OrganizationID: orgID, Role: "member",
	})
	if err != nil {
		t.Fatalf("create bob: %v", err)
	}
	aliceLogin, err := backend.IAM.Login(context.Background(), "alice@example.com", "password123")
	if err != nil {
		t.Fatalf("login alice: %v", err)
	}
	bobLogin, err := backend.IAM.Login(context.Background(), "bob@example.com", "password123")
	if err != nil {
		t.Fatalf("login bob: %v", err)
	}
	_ = bob

	// Alice must only ever see her own session, even though she is asking
	// the shared /sessions endpoint that admins can use to see everyone's.
	listRequest := httptest.NewRequest(http.MethodGet, "/api/v1/sessions", nil)
	listRequest.Header.Set("Authorization", "Bearer "+aliceLogin.Token)
	listRecorder := httptest.NewRecorder()
	handler.ServeHTTP(listRecorder, listRequest)
	if listRecorder.Code != http.StatusOK {
		t.Fatalf("expected alice to list her sessions, got %d", listRecorder.Code)
	}
	var listPayload struct {
		Sessions []iam.SessionInfo `json:"sessions"`
	}
	if err := json.NewDecoder(listRecorder.Body).Decode(&listPayload); err != nil {
		t.Fatalf("decode session list: %v", err)
	}
	for _, session := range listPayload.Sessions {
		if session.UserID != alice.ID {
			t.Fatalf("expected alice to only see her own sessions, saw session for %s", session.UserID)
		}
	}
	if len(listPayload.Sessions) == 0 {
		t.Fatal("expected alice to see at least her own session")
	}

	// Alice must not be able to revoke Bob's session.
	bobSessions, _, err := backend.IAM.ListSessions(context.Background(), principal, iam.ListSessionsParams{UserID: bob.ID}, sdb.ListParams{Sort: "created_at", Order: "desc", Limit: 50})
	if err != nil {
		t.Fatalf("list bob sessions as admin: %v", err)
	}
	if len(bobSessions) != 1 {
		t.Fatalf("expected exactly one session for bob, got %d", len(bobSessions))
	}
	revokeBobRequest := httptest.NewRequest(http.MethodDelete, "/api/v1/sessions/"+bobSessions[0].ID, nil)
	revokeBobRequest.Header.Set("Authorization", "Bearer "+aliceLogin.Token)
	revokeBobRecorder := httptest.NewRecorder()
	handler.ServeHTTP(revokeBobRecorder, revokeBobRequest)
	if revokeBobRecorder.Code != http.StatusForbidden {
		t.Fatalf("expected alice to be denied revoking bob's session, got %d", revokeBobRecorder.Code)
	}

	// Bob's session must still work after alice's denied attempt.
	bobMeRequest := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	bobMeRequest.Header.Set("Authorization", "Bearer "+bobLogin.Token)
	bobMeRecorder := httptest.NewRecorder()
	handler.ServeHTTP(bobMeRecorder, bobMeRequest)
	if bobMeRecorder.Code != http.StatusOK {
		t.Fatalf("expected bob's session to remain valid, got %d", bobMeRecorder.Code)
	}
}

func TestAuthMeDoesNotExposeSessionToken(t *testing.T) {
	handler, _, adminToken, _, _ := newTestServerRouter(t)

	request := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	request.Header.Set("Authorization", "Bearer "+adminToken)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected auth/me success, got %d", recorder.Code)
	}

	var payload map[string]any
	if err := json.NewDecoder(recorder.Body).Decode(&payload); err != nil {
		t.Fatalf("decode auth/me: %v", err)
	}
	session, ok := payload["session"].(map[string]any)
	if !ok {
		t.Fatalf("expected session object, got %#v", payload["session"])
	}
	if token, ok := session["token"]; ok && token != "" {
		t.Fatalf("expected auth/me session token to be omitted, got %#v", token)
	}
}

func TestChangePasswordEndpoint(t *testing.T) {
	handler, _, adminToken, _, _ := newTestServerRouter(t)

	wrongBody, _ := json.Marshal(map[string]any{
		"current_password": "wrong-password",
		"new_password":     "newpassword123",
	})
	wrongRequest := httptest.NewRequest(http.MethodPut, "/api/v1/users/me/password", bytes.NewReader(wrongBody))
	wrongRequest.Header.Set("Authorization", "Bearer "+adminToken)
	wrongRecorder := httptest.NewRecorder()
	handler.ServeHTTP(wrongRecorder, wrongRequest)
	if wrongRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected wrong current password to be rejected, got %d: %s", wrongRecorder.Code, wrongRecorder.Body.String())
	}

	correctBody, _ := json.Marshal(map[string]any{
		"current_password": "password123",
		"new_password":     "newpassword123",
	})
	correctRequest := httptest.NewRequest(http.MethodPut, "/api/v1/users/me/password", bytes.NewReader(correctBody))
	correctRequest.Header.Set("Authorization", "Bearer "+adminToken)
	correctRecorder := httptest.NewRecorder()
	handler.ServeHTTP(correctRecorder, correctRequest)
	if correctRecorder.Code != http.StatusNoContent {
		t.Fatalf("expected password change success, got %d: %s", correctRecorder.Code, correctRecorder.Body.String())
	}

	// The old token must still work (password change doesn't revoke the
	// current session).
	meRequest := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	meRequest.Header.Set("Authorization", "Bearer "+adminToken)
	meRecorder := httptest.NewRecorder()
	handler.ServeHTTP(meRecorder, meRequest)
	if meRecorder.Code != http.StatusOK {
		t.Fatalf("expected the existing session to remain valid after a password change, got %d", meRecorder.Code)
	}

	oldLoginBody, _ := json.Marshal(map[string]any{"email": "admin@example.com", "password": "password123"})
	oldLoginRequest := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(oldLoginBody))
	oldLoginRecorder := httptest.NewRecorder()
	handler.ServeHTTP(oldLoginRecorder, oldLoginRequest)
	if oldLoginRecorder.Code == http.StatusOK {
		t.Fatal("expected logging in with the old password to fail after it was changed")
	}

	newLoginBody, _ := json.Marshal(map[string]any{"email": "admin@example.com", "password": "newpassword123"})
	newLoginRequest := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(newLoginBody))
	newLoginRecorder := httptest.NewRecorder()
	handler.ServeHTTP(newLoginRecorder, newLoginRequest)
	if newLoginRecorder.Code != http.StatusOK {
		t.Fatalf("expected logging in with the new password to succeed, got %d: %s", newLoginRecorder.Code, newLoginRecorder.Body.String())
	}
}
