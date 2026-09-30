package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDataflowPreviewExpressionEndpointRequiresAuth(t *testing.T) {
	handler, _, _, _, _ := newTestServerRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/dataflow/preview-expression", bytes.NewBufferString(`{"expression":"1+1"}`))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
	}
}

func TestDataflowPreviewExpressionEndpointResolvesAgainstSampleItem(t *testing.T) {
	handler, _, token, _, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{
		"expression": "$json.n * 2",
		"item":       map[string]any{"n": 3},
		"item_index": 0,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/dataflow/preview-expression", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Value float64 `json:"value"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Value != 6 {
		t.Fatalf("expected value 6, got %+v", resp.Value)
	}
}

func TestDataflowPreviewExpressionEndpointReturns400OnInvalidExpression(t *testing.T) {
	handler, _, token, _, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"expression": "this is not valid js at all (((", "item": map[string]any{}})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/dataflow/preview-expression", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for an invalid expression, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestDataflowPreviewExpressionEndpointRequiresExpressionField(t *testing.T) {
	handler, _, token, _, _ := newTestServerRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/dataflow/preview-expression", bytes.NewBufferString(`{}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for a missing expression, got %d: %s", rec.Code, rec.Body.String())
	}
}
