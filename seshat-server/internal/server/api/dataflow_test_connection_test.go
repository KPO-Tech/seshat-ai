package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDataflowTestConnectionEndpointRequiresAuth(t *testing.T) {
	handler, _, _, _, _ := newTestServerRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/dataflow/test-connection", bytes.NewBufferString(`{}`))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
	}
}

func TestDataflowTestConnectionEndpointRequiresNodeType(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"organization_id": orgID})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/dataflow/test-connection", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for a missing node_type, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestDataflowTestConnectionEndpointRejectsANodeTypeWithNoConnectionToTest(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"organization_id": orgID, "node_type": "if"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/dataflow/test-connection", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code < 400 {
		t.Fatalf("expected a request-level error for a node type with nothing to test, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestDataflowTestConnectionEndpointSucceedsAgainstARealSavedSecret(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	secretBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID, "name": "primary-db", "value": "file::memory:?cache=shared",
	})
	secretReq := httptest.NewRequest(http.MethodPost, "/api/v1/dataflow-secrets", bytes.NewReader(secretBody))
	secretReq.Header.Set("Authorization", "Bearer "+token)
	secretReq.Header.Set("Content-Type", "application/json")
	secretRec := httptest.NewRecorder()
	handler.ServeHTTP(secretRec, secretReq)
	if secretRec.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating the secret, got %d: %s", secretRec.Code, secretRec.Body.String())
	}

	body, _ := json.Marshal(map[string]any{
		"organization_id": orgID, "node_type": "sqlite",
		"parameters": map[string]any{"dsnSecretRef": "primary-db"},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/dataflow/test-connection", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		OK      bool   `json:"ok"`
		Message string `json:"message"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !resp.OK {
		t.Fatalf("expected a real sqlite connection to succeed, got %+v", resp)
	}
}
