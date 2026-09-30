package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDataflowTestRunEndpointRequiresAuth(t *testing.T) {
	handler, _, _, _, _ := newTestServerRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/dataflow/test-run", bytes.NewBufferString(`{}`))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
	}
}

func TestDataflowTestRunEndpointRequiresGraph(t *testing.T) {
	handler, _, token, _, _ := newTestServerRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/dataflow/test-run", bytes.NewBufferString(`{"organization_id":"x"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for a missing graph, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestDataflowTestRunEndpointRejectsAnUnknownOrganization(t *testing.T) {
	handler, _, token, _, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{
		"organization_id": "org-not-mine",
		"graph": map[string]any{
			"name":  "test",
			"nodes": []map[string]any{{"id": "a", "type": "filter", "parameters": map[string]any{"expression": "true"}}},
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/dataflow/test-run", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code < 400 {
		t.Fatalf("expected a request-level error for an org the caller has no access to, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestDataflowTestRunEndpointRunsAGraphAgainstTheRealRegistry(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"graph": map[string]any{
			"name":  "test",
			"nodes": []map[string]any{{"id": "a", "type": "filter", "parameters": map[string]any{"expression": "true"}}},
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/dataflow/test-run", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Success bool `json:"success"`
		Results map[string]struct {
			Success bool `json:"success"`
		} `json:"results"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !resp.Success || !resp.Results["a"].Success {
		t.Fatalf("expected node %q to have run successfully, got %+v", "a", resp)
	}
}
