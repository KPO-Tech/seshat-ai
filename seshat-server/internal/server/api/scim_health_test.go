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

func TestScimConnectionEventsEndpoint(t *testing.T) {
	handler, backend, token, orgID, principal := newTestServerRouter(t)
	connection, err := backend.Scim.CreateConnection(context.Background(), principal, scim.CreateConnectionParams{
		OrganizationID: orgID, Name: "Okta",
	})
	if err != nil {
		t.Fatalf("create connection: %v", err)
	}

	createUserBody, _ := json.Marshal(map[string]any{"userName": "alice@example.com", "displayName": "Alice", "active": true})
	createUserRequest := httptest.NewRequest(http.MethodPost, "/scim/v2/Users", bytes.NewReader(createUserBody))
	createUserRequest.Header.Set("Authorization", "Bearer "+connection.Token)
	createUserRecorder := httptest.NewRecorder()
	handler.ServeHTTP(createUserRecorder, createUserRequest)
	if createUserRecorder.Code != http.StatusCreated {
		t.Fatalf("expected user create success, got %d: %s", createUserRecorder.Code, createUserRecorder.Body.String())
	}

	eventsRequest := httptest.NewRequest(http.MethodGet, "/api/v1/scim-connections/events?organization_id="+orgID, nil)
	eventsRequest.Header.Set("Authorization", "Bearer "+token)
	eventsRecorder := httptest.NewRecorder()
	handler.ServeHTTP(eventsRecorder, eventsRequest)
	if eventsRecorder.Code != http.StatusOK {
		t.Fatalf("expected events list success, got %d: %s", eventsRecorder.Code, eventsRecorder.Body.String())
	}
	var body struct {
		Events []struct {
			Operation string
			Success   bool
		}
		Total int64
	}
	if err := json.NewDecoder(eventsRecorder.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Total != 1 || len(body.Events) != 1 || body.Events[0].Operation != "user.create" || !body.Events[0].Success {
		t.Fatalf("unexpected events response: %+v", body)
	}

	getConnectionRequest := httptest.NewRequest(http.MethodGet, "/api/v1/scim-connections?organization_id="+orgID, nil)
	getConnectionRequest.Header.Set("Authorization", "Bearer "+token)
	getConnectionRecorder := httptest.NewRecorder()
	handler.ServeHTTP(getConnectionRecorder, getConnectionRequest)
	if getConnectionRecorder.Code != http.StatusOK {
		t.Fatalf("expected get connection success, got %d: %s", getConnectionRecorder.Code, getConnectionRecorder.Body.String())
	}
	var connectionBody struct {
		Connection struct {
			LastSyncAt      *string `json:"last_sync_at"`
			LastSyncSuccess *bool   `json:"last_sync_success"`
		} `json:"connection"`
	}
	if err := json.NewDecoder(getConnectionRecorder.Body).Decode(&connectionBody); err != nil {
		t.Fatalf("decode connection: %v", err)
	}
	if connectionBody.Connection.LastSyncAt == nil || connectionBody.Connection.LastSyncSuccess == nil || !*connectionBody.Connection.LastSyncSuccess {
		t.Fatalf("expected the connection response to include health fields, got %+v", connectionBody.Connection)
	}
}
