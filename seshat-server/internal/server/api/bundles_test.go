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

func TestBundlesProvenanceEndpointReportsWhichHookCameFromWhichBundle(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	// A directly-created hook has no provenance.
	directBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID, "name": "manual-hook", "command": "exit 0",
	})
	directReq := httptest.NewRequest(http.MethodPost, "/api/v1/hook-configs", bytes.NewReader(directBody))
	directReq.Header.Set("Authorization", "Bearer "+token)
	directReq.Header.Set("Content-Type", "application/json")
	directRec := httptest.NewRecorder()
	handler.ServeHTTP(directRec, directReq)
	var direct struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(directRec.Body).Decode(&direct); err != nil {
		t.Fatalf("decode directly-created hook: %v", err)
	}

	// An imported hook does.
	importBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"manifest": map[string]any{
			"name":  "Jira Integration",
			"hooks": []map[string]any{{"name": "block-rm", "command": "exit 0"}},
		},
	})
	importReq := httptest.NewRequest(http.MethodPost, "/api/v1/bundles/import", bytes.NewReader(importBody))
	importReq.Header.Set("Authorization", "Bearer "+token)
	importReq.Header.Set("Content-Type", "application/json")
	importRec := httptest.NewRecorder()
	handler.ServeHTTP(importRec, importReq)
	var imported struct {
		Created []struct {
			ResourceID string `json:"resource_id"`
		} `json:"created"`
	}
	if err := json.NewDecoder(importRec.Body).Decode(&imported); err != nil {
		t.Fatalf("decode import result: %v", err)
	}
	if len(imported.Created) != 1 {
		t.Fatalf("expected 1 imported hook, got %+v", imported)
	}
	importedHookID := imported.Created[0].ResourceID

	req := httptest.NewRequest(http.MethodGet, "/api/v1/bundles/provenance?organization_id="+orgID+
		"&resource_type=hook_config&resource_ids="+direct.ID+","+importedHookID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var result struct {
		Provenance map[string]struct {
			BundleName string `json:"bundle_name"`
		} `json:"provenance"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("decode provenance: %v", err)
	}
	if _, ok := result.Provenance[direct.ID]; ok {
		t.Fatalf("expected no provenance entry for the directly-created hook, got %+v", result.Provenance)
	}
	entry, ok := result.Provenance[importedHookID]
	if !ok || entry.BundleName != "Jira Integration" {
		t.Fatalf("expected a provenance entry naming the source bundle, got %+v", result.Provenance)
	}
}

func TestBundlesProvenanceEndpointRequiresAuth(t *testing.T) {
	handler, _, _, orgID, _ := newTestServerRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/bundles/provenance?organization_id="+orgID+"&resource_type=hook_config&resource_ids=x", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
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
