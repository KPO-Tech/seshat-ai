package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBundlesExportEndpointRequiresAuth(t *testing.T) {
	handler, _, _, orgID, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"organization_id": orgID, "name": "Test"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/bundles/export", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
	}
}

func TestBundlesExportEndpointBuildsManifest(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	// Create a hook to export - no encryption key needed, unlike MCP servers.
	createBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID, "name": "block-rm", "command": "exit 0",
	})
	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/hook-configs", bytes.NewReader(createBody))
	createReq.Header.Set("Authorization", "Bearer "+token)
	createReq.Header.Set("Content-Type", "application/json")
	createRec := httptest.NewRecorder()
	handler.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating a hook, got %d: %s", createRec.Code, createRec.Body.String())
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(createRec.Body).Decode(&created); err != nil {
		t.Fatalf("decode created hook: %v", err)
	}

	exportBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID, "name": "Test Bundle", "hook_config_ids": []string{created.ID},
	})
	exportReq := httptest.NewRequest(http.MethodPost, "/api/v1/bundles/export", bytes.NewReader(exportBody))
	exportReq.Header.Set("Authorization", "Bearer "+token)
	exportReq.Header.Set("Content-Type", "application/json")
	exportRec := httptest.NewRecorder()
	handler.ServeHTTP(exportRec, exportReq)
	if exportRec.Code != http.StatusOK {
		t.Fatalf("expected 200 exporting a bundle, got %d: %s", exportRec.Code, exportRec.Body.String())
	}
	var manifest struct {
		Name  string `json:"name"`
		Hooks []struct {
			Name    string `json:"name"`
			Command string `json:"command"`
		} `json:"hooks"`
	}
	if err := json.NewDecoder(exportRec.Body).Decode(&manifest); err != nil {
		t.Fatalf("decode manifest: %v", err)
	}
	if manifest.Name != "Test Bundle" || len(manifest.Hooks) != 1 || manifest.Hooks[0].Name != "block-rm" {
		t.Fatalf("unexpected manifest: %+v", manifest)
	}
	if disposition := exportRec.Header().Get("Content-Disposition"); disposition == "" {
		t.Fatal("expected a Content-Disposition header on the export response")
	}
}

func TestBundlesExportEndpointRejectsUnknownID(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{
		"organization_id": orgID, "name": "Test", "hook_config_ids": []string{"does-not-exist"},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/bundles/export", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code == http.StatusOK {
		t.Fatalf("expected an error for a nonexistent hook id, got 200: %s", rec.Body.String())
	}
}
