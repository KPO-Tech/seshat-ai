package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHookConfigsEndpointRequiresAuth(t *testing.T) {
	handler, _, _, orgID, _ := newTestServerRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/hook-configs?organization_id="+orgID, nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
	}
}

func TestHookConfigsEndpointCRUDRoundTrip(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/hook-configs?organization_id="+orgID, nil)
	listReq.Header.Set("Authorization", "Bearer "+token)
	listRec := httptest.NewRecorder()
	handler.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected 200 listing hooks, got %d: %s", listRec.Code, listRec.Body.String())
	}
	var empty struct {
		Count int `json:"count"`
	}
	if err := json.NewDecoder(listRec.Body).Decode(&empty); err != nil {
		t.Fatalf("decode empty list: %v", err)
	}
	if empty.Count != 0 {
		t.Fatalf("expected an empty list before any hook exists, got count=%d", empty.Count)
	}

	createBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID, "name": "block-rm", "matcher": "bash", "command": "echo test",
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
		ID      string `json:"id"`
		Enabled bool   `json:"enabled"`
	}
	if err := json.NewDecoder(createRec.Body).Decode(&created); err != nil {
		t.Fatalf("decode created hook: %v", err)
	}
	if created.ID == "" || !created.Enabled {
		t.Fatalf("unexpected created hook: %+v", created)
	}

	updateBody, _ := json.Marshal(map[string]any{"matcher": "bash", "command": "echo updated", "enabled": false})
	updateReq := httptest.NewRequest(http.MethodPut, "/api/v1/hook-configs/"+created.ID, bytes.NewReader(updateBody))
	updateReq.Header.Set("Authorization", "Bearer "+token)
	updateReq.Header.Set("Content-Type", "application/json")
	updateRec := httptest.NewRecorder()
	handler.ServeHTTP(updateRec, updateReq)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("expected 200 updating a hook, got %d: %s", updateRec.Code, updateRec.Body.String())
	}
	var updated struct {
		Command string `json:"command"`
		Enabled bool   `json:"enabled"`
	}
	if err := json.NewDecoder(updateRec.Body).Decode(&updated); err != nil {
		t.Fatalf("decode updated hook: %v", err)
	}
	if updated.Command != "echo updated" || updated.Enabled {
		t.Fatalf("unexpected updated hook: %+v", updated)
	}

	// Disabled hooks are excluded from resolve.
	resolveReq := httptest.NewRequest(http.MethodGet, "/api/v1/hook-configs/resolve?organization_id="+orgID, nil)
	resolveReq.Header.Set("Authorization", "Bearer "+token)
	resolveRec := httptest.NewRecorder()
	handler.ServeHTTP(resolveRec, resolveReq)
	if resolveRec.Code != http.StatusOK {
		t.Fatalf("expected 200 resolving hooks, got %d: %s", resolveRec.Code, resolveRec.Body.String())
	}
	var resolved struct {
		Count int `json:"count"`
	}
	if err := json.NewDecoder(resolveRec.Body).Decode(&resolved); err != nil {
		t.Fatalf("decode resolved hooks: %v", err)
	}
	if resolved.Count != 0 {
		t.Fatalf("expected the disabled hook to be excluded from resolve, got count=%d", resolved.Count)
	}

	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/v1/hook-configs/"+created.ID, nil)
	deleteReq.Header.Set("Authorization", "Bearer "+token)
	deleteRec := httptest.NewRecorder()
	handler.ServeHTTP(deleteRec, deleteReq)
	if deleteRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 deleting the hook, got %d: %s", deleteRec.Code, deleteRec.Body.String())
	}
}
