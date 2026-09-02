package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDataflowSecretsEndpointRequiresAuth(t *testing.T) {
	handler, _, _, orgID, _ := newTestServerRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/dataflow-secrets?organization_id="+orgID, nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
	}
}

func TestDataflowSecretsEndpointCreateListDeleteNeverExposesValue(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	createBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID, "name": "primary-db", "value": "postgres://user:pass@host/db",
	})
	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/dataflow-secrets", bytes.NewReader(createBody))
	createReq.Header.Set("Authorization", "Bearer "+token)
	createReq.Header.Set("Content-Type", "application/json")
	createRec := httptest.NewRecorder()
	handler.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating a secret, got %d: %s", createRec.Code, createRec.Body.String())
	}
	if bytes.Contains(createRec.Body.Bytes(), []byte("postgres://user:pass@host/db")) {
		t.Fatal("the plaintext value must never appear in the create response")
	}
	var created struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := json.NewDecoder(createRec.Body).Decode(&created); err != nil {
		t.Fatalf("decode created secret: %v", err)
	}
	if created.ID == "" || created.Name != "primary-db" {
		t.Fatalf("unexpected created secret: %+v", created)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/dataflow-secrets?organization_id="+orgID, nil)
	listReq.Header.Set("Authorization", "Bearer "+token)
	listRec := httptest.NewRecorder()
	handler.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected 200 listing secrets, got %d: %s", listRec.Code, listRec.Body.String())
	}
	if bytes.Contains(listRec.Body.Bytes(), []byte("postgres://user:pass@host/db")) {
		t.Fatal("the plaintext value must never appear in the list response")
	}
	var list struct {
		Count int `json:"count"`
	}
	if err := json.NewDecoder(listRec.Body).Decode(&list); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if list.Count != 1 {
		t.Fatalf("expected 1 secret listed, got %d", list.Count)
	}

	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/v1/dataflow-secrets/"+created.ID, nil)
	deleteReq.Header.Set("Authorization", "Bearer "+token)
	deleteRec := httptest.NewRecorder()
	handler.ServeHTTP(deleteRec, deleteReq)
	if deleteRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 deleting the secret, got %d: %s", deleteRec.Code, deleteRec.Body.String())
	}
}
