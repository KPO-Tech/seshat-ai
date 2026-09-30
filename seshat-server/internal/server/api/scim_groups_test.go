package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/scim"
)

// scimTestConnectionWithMode is scimTestConnection with explicit
// SyncGroups/AutoCreateTeams flags, for the group-mode-dependent tests.
func scimTestConnectionWithMode(t *testing.T, syncGroups, autoCreateTeams bool) (http.Handler, string) {
	t.Helper()
	handler, backend, _, orgID, principal := newTestServerRouter(t)
	created, err := backend.Scim.CreateConnection(context.Background(), principal, scim.CreateConnectionParams{
		OrganizationID: orgID, Name: "Okta", SyncGroups: syncGroups, AutoCreateTeams: autoCreateTeams,
	})
	if err != nil {
		t.Fatalf("create scim connection: %v", err)
	}
	return handler, created.Token
}

func TestScimGroupsRejectedWhenSyncGroupsDisabled(t *testing.T) {
	handler, scimToken := scimTestConnectionWithMode(t, false, false)

	body, _ := json.Marshal(map[string]any{"displayName": "Engineering"})
	request := httptest.NewRequest(http.MethodPost, "/scim/v2/Groups", bytes.NewReader(body))
	request.Header.Set("Authorization", "Bearer "+scimToken)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403 when group sync is disabled, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestScimGroupsFullLifecycleInAutoCreateTeamsMode(t *testing.T) {
	handler, scimToken := scimTestConnectionWithMode(t, true, true)

	// Provision a user first - a SCIM group can only reference already-
	// provisioned members.
	userBody, _ := json.Marshal(map[string]any{"userName": "alice@example.com", "displayName": "Alice", "active": true})
	userRequest := httptest.NewRequest(http.MethodPost, "/scim/v2/Users", bytes.NewReader(userBody))
	userRequest.Header.Set("Authorization", "Bearer "+scimToken)
	userRecorder := httptest.NewRecorder()
	handler.ServeHTTP(userRecorder, userRequest)
	if userRecorder.Code != http.StatusCreated {
		t.Fatalf("expected user create success, got %d: %s", userRecorder.Code, userRecorder.Body.String())
	}
	var user struct{ ID string }
	if err := json.NewDecoder(userRecorder.Body).Decode(&user); err != nil {
		t.Fatalf("decode user: %v", err)
	}

	// Create the group with that member.
	createBody, _ := json.Marshal(map[string]any{
		"displayName": "Engineering",
		"members":     []map[string]any{{"value": user.ID}},
	})
	createRequest := httptest.NewRequest(http.MethodPost, "/scim/v2/Groups", bytes.NewReader(createBody))
	createRequest.Header.Set("Authorization", "Bearer "+scimToken)
	createRecorder := httptest.NewRecorder()
	handler.ServeHTTP(createRecorder, createRequest)
	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("expected group create success, got %d: %s", createRecorder.Code, createRecorder.Body.String())
	}
	var created struct {
		ID      string
		Members []struct{ Value string }
	}
	if err := json.NewDecoder(createRecorder.Body).Decode(&created); err != nil {
		t.Fatalf("decode created group: %v", err)
	}
	if len(created.Members) != 1 || created.Members[0].Value != user.ID {
		t.Fatalf("unexpected members: %+v", created.Members)
	}

	// Get it back.
	getRequest := httptest.NewRequest(http.MethodGet, "/scim/v2/Groups/"+created.ID, nil)
	getRequest.Header.Set("Authorization", "Bearer "+scimToken)
	getRecorder := httptest.NewRecorder()
	handler.ServeHTTP(getRecorder, getRequest)
	if getRecorder.Code != http.StatusOK {
		t.Fatalf("expected get success, got %d: %s", getRecorder.Code, getRecorder.Body.String())
	}

	// PATCH remove the member.
	patchBody, _ := json.Marshal(map[string]any{
		"Operations": []map[string]any{
			{"op": "remove", "path": `members[value eq "` + user.ID + `"]`},
		},
	})
	patchRequest := httptest.NewRequest(http.MethodPatch, "/scim/v2/Groups/"+created.ID, bytes.NewReader(patchBody))
	patchRequest.Header.Set("Authorization", "Bearer "+scimToken)
	patchRecorder := httptest.NewRecorder()
	handler.ServeHTTP(patchRecorder, patchRequest)
	if patchRecorder.Code != http.StatusOK {
		t.Fatalf("expected patch success, got %d: %s", patchRecorder.Code, patchRecorder.Body.String())
	}
	var patched struct{ Members []struct{ Value string } }
	if err := json.NewDecoder(patchRecorder.Body).Decode(&patched); err != nil {
		t.Fatalf("decode patched: %v", err)
	}
	if len(patched.Members) != 0 {
		t.Fatalf("expected the member to be removed, got %+v", patched.Members)
	}

	// Delete.
	deleteRequest := httptest.NewRequest(http.MethodDelete, "/scim/v2/Groups/"+created.ID, nil)
	deleteRequest.Header.Set("Authorization", "Bearer "+scimToken)
	deleteRecorder := httptest.NewRecorder()
	handler.ServeHTTP(deleteRecorder, deleteRequest)
	if deleteRecorder.Code != http.StatusNoContent {
		t.Fatalf("expected delete success, got %d: %s", deleteRecorder.Code, deleteRecorder.Body.String())
	}
	getAfterDeleteRequest := httptest.NewRequest(http.MethodGet, "/scim/v2/Groups/"+created.ID, nil)
	getAfterDeleteRequest.Header.Set("Authorization", "Bearer "+scimToken)
	getAfterDeleteRecorder := httptest.NewRecorder()
	handler.ServeHTTP(getAfterDeleteRecorder, getAfterDeleteRequest)
	if getAfterDeleteRecorder.Code != http.StatusNotFound {
		t.Fatalf("expected the group to be genuinely gone after delete, got %d", getAfterDeleteRecorder.Code)
	}
}

func TestScimGroupsMetadataOnlyModeCreateSucceedsButIsNotAddressableAfterward(t *testing.T) {
	handler, scimToken := scimTestConnectionWithMode(t, true, false)

	createBody, _ := json.Marshal(map[string]any{"displayName": "Engineering"})
	createRequest := httptest.NewRequest(http.MethodPost, "/scim/v2/Groups", bytes.NewReader(createBody))
	createRequest.Header.Set("Authorization", "Bearer "+scimToken)
	createRecorder := httptest.NewRecorder()
	handler.ServeHTTP(createRecorder, createRequest)
	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("expected create to still report success in metadata-only mode, got %d: %s", createRecorder.Code, createRecorder.Body.String())
	}
	var created struct{ ID string }
	if err := json.NewDecoder(createRecorder.Body).Decode(&created); err != nil {
		t.Fatalf("decode: %v", err)
	}

	getRequest := httptest.NewRequest(http.MethodGet, "/scim/v2/Groups/"+created.ID, nil)
	getRequest.Header.Set("Authorization", "Bearer "+scimToken)
	getRecorder := httptest.NewRecorder()
	handler.ServeHTTP(getRecorder, getRequest)
	if getRecorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for a metadata-only group id, got %d: %s", getRecorder.Code, getRecorder.Body.String())
	}
}
