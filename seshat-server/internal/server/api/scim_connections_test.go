package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestScimConnectionCRUDOverHTTPNeverExposesTheTokenAfterCreate(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	createBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"name":            "Okta",
		"sync_groups":     true,
	})
	createRequest := httptest.NewRequest(http.MethodPost, "/api/v1/scim-connections", bytes.NewReader(createBody))
	createRequest.Header.Set("Authorization", "Bearer "+token)
	createRecorder := httptest.NewRecorder()
	handler.ServeHTTP(createRecorder, createRequest)
	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("expected create success, got %d: %s", createRecorder.Code, createRecorder.Body.String())
	}
	var created struct {
		ID    string `json:"id"`
		Token string `json:"token"`
		Name  string `json:"name"`
	}
	if err := json.NewDecoder(createRecorder.Body).Decode(&created); err != nil {
		t.Fatalf("decode created connection: %v", err)
	}
	if created.Token == "" {
		t.Fatal("expected the raw token to be present exactly once, on create")
	}

	getRequest := httptest.NewRequest(http.MethodGet, "/api/v1/scim-connections?organization_id="+orgID, nil)
	getRequest.Header.Set("Authorization", "Bearer "+token)
	getRecorder := httptest.NewRecorder()
	handler.ServeHTTP(getRecorder, getRequest)
	if getRecorder.Code != http.StatusOK {
		t.Fatalf("expected get success, got %d: %s", getRecorder.Code, getRecorder.Body.String())
	}
	if bytes.Contains(getRecorder.Body.Bytes(), []byte(created.Token)) {
		t.Fatal("the raw token must never appear in a GET response")
	}

	updateBody, _ := json.Marshal(map[string]any{"name": "Okta Prod", "enabled": true})
	updateRequest := httptest.NewRequest(http.MethodPut, "/api/v1/scim-connections?organization_id="+orgID, bytes.NewReader(updateBody))
	updateRequest.Header.Set("Authorization", "Bearer "+token)
	updateRecorder := httptest.NewRecorder()
	handler.ServeHTTP(updateRecorder, updateRequest)
	if updateRecorder.Code != http.StatusOK {
		t.Fatalf("expected update success, got %d: %s", updateRecorder.Code, updateRecorder.Body.String())
	}
	if bytes.Contains(updateRecorder.Body.Bytes(), []byte(created.Token)) {
		t.Fatal("the raw token must never appear in a PUT response")
	}

	rotateRequest := httptest.NewRequest(http.MethodPost, "/api/v1/scim-connections/rotate-token?organization_id="+orgID, nil)
	rotateRequest.Header.Set("Authorization", "Bearer "+token)
	rotateRecorder := httptest.NewRecorder()
	handler.ServeHTTP(rotateRecorder, rotateRequest)
	if rotateRecorder.Code != http.StatusOK {
		t.Fatalf("expected rotate success, got %d: %s", rotateRecorder.Code, rotateRecorder.Body.String())
	}
	var rotated struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(rotateRecorder.Body).Decode(&rotated); err != nil {
		t.Fatalf("decode rotated connection: %v", err)
	}
	if rotated.Token == "" || rotated.Token == created.Token {
		t.Fatalf("expected a fresh raw token from rotate, got %q (was %q)", rotated.Token, created.Token)
	}

	deleteRequest := httptest.NewRequest(http.MethodDelete, "/api/v1/scim-connections?organization_id="+orgID, nil)
	deleteRequest.Header.Set("Authorization", "Bearer "+token)
	deleteRecorder := httptest.NewRecorder()
	handler.ServeHTTP(deleteRecorder, deleteRequest)
	if deleteRecorder.Code != http.StatusNoContent {
		t.Fatalf("expected delete success, got %d: %s", deleteRecorder.Code, deleteRecorder.Body.String())
	}

	getAfterDeleteRequest := httptest.NewRequest(http.MethodGet, "/api/v1/scim-connections?organization_id="+orgID, nil)
	getAfterDeleteRequest.Header.Set("Authorization", "Bearer "+token)
	getAfterDeleteRecorder := httptest.NewRecorder()
	handler.ServeHTTP(getAfterDeleteRecorder, getAfterDeleteRequest)
	if getAfterDeleteRecorder.Code != http.StatusOK {
		t.Fatalf("expected get-after-delete to still succeed with a null connection, got %d: %s", getAfterDeleteRecorder.Code, getAfterDeleteRecorder.Body.String())
	}
	var afterDelete struct {
		Connection *struct{ ID string } `json:"connection"`
	}
	if err := json.NewDecoder(getAfterDeleteRecorder.Body).Decode(&afterDelete); err != nil {
		t.Fatalf("decode get-after-delete: %v", err)
	}
	if afterDelete.Connection != nil {
		t.Fatalf("expected no connection after delete, got %+v", afterDelete.Connection)
	}
}
