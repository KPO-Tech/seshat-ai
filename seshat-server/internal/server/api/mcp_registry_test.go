package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMCPServerConfigsProbeEndpointRequiresAuth(t *testing.T) {
	handler, _, _, orgID, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"organization_id": orgID, "url": "https://example.com"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/mcp-server-configs/probe", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
	}
}

func TestMCPServerConfigsProbeEndpointClassifiesRealServer(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()

	body, _ := json.Marshal(map[string]any{"organization_id": orgID, "url": target.URL})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/mcp-server-configs/probe", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var result struct {
		AuthMode   string `json:"auth_mode"`
		ServerType string `json:"server_type"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if result.AuthMode != "none" || result.ServerType != "http" {
		t.Fatalf("unexpected probe result: %+v", result)
	}
}
