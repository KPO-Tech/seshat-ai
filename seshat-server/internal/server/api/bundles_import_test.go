package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func TestBundlesImportEndpointRequiresAuth(t *testing.T) {
	handler, _, _, orgID, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"organization_id": orgID, "manifest": map[string]any{}})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/bundles/import", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
	}
}

func TestBundlesImportEndpointCreatesItemsAndTheyAreUsable(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"manifest": map[string]any{
			"name": "Test Bundle",
			"hooks": []map[string]any{
				{"name": "block-rm", "matcher": "bash", "command": "exit 0"},
			},
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/bundles/import", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 importing a bundle, got %d: %s", rec.Code, rec.Body.String())
	}
	var result struct {
		BundleImportID string `json:"bundle_import_id"`
		Created        []struct {
			Name string `json:"name"`
		} `json:"created"`
		Failed []any `json:"failed"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("decode result: %v", err)
	}
	if result.BundleImportID == "" || len(result.Created) != 1 || len(result.Failed) != 0 {
		t.Fatalf("unexpected import result: %+v", result)
	}

	// The imported hook must be a real, independently listable row.
	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/hook-configs?organization_id="+orgID, nil)
	listReq.Header.Set("Authorization", "Bearer "+token)
	listRec := httptest.NewRecorder()
	handler.ServeHTTP(listRec, listReq)
	var list struct {
		Count int `json:"count"`
	}
	if err := json.NewDecoder(listRec.Body).Decode(&list); err != nil {
		t.Fatalf("decode hook list: %v", err)
	}
	if list.Count != 1 {
		t.Fatalf("expected the imported hook to show up in the normal hooks list, got count=%d", list.Count)
	}
}

func TestBundlesImportEndpointRejectsInvalidManifest(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"manifest":        map[string]any{"name": "Empty"},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/bundles/import", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code == http.StatusOK {
		t.Fatalf("expected an error for an empty manifest, got 200: %s", rec.Body.String())
	}
}

// TestBundlesExportThenImportRoundTrip is the real end-to-end proof: export
// a manifest from one organization and import it into a second, unrelated
// one - the actual scenario a portable bundle exists for (handing a
// manifest to a different organization), rather than re-importing into the
// same org where the original row's name would just collide.
func TestBundlesExportThenImportRoundTrip(t *testing.T) {
	handler, app, token, orgID, principal := newTestServerRouter(t)

	createBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID, "name": "internal-jira", "url": "https://github.com/example/jira-helpers",
	})
	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/skill-repos", bytes.NewReader(createBody))
	createReq.Header.Set("Authorization", "Bearer "+token)
	createReq.Header.Set("Content-Type", "application/json")
	createRec := httptest.NewRecorder()
	handler.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated && createRec.Code != http.StatusOK {
		t.Fatalf("expected success creating a skill repo, got %d: %s", createRec.Code, createRec.Body.String())
	}
	var skill struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(createRec.Body).Decode(&skill); err != nil {
		t.Fatalf("decode created skill: %v", err)
	}

	exportBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID, "name": "Round Trip", "skill_repo_ids": []string{skill.ID},
	})
	exportReq := httptest.NewRequest(http.MethodPost, "/api/v1/bundles/export", bytes.NewReader(exportBody))
	exportReq.Header.Set("Authorization", "Bearer "+token)
	exportReq.Header.Set("Content-Type", "application/json")
	exportRec := httptest.NewRecorder()
	handler.ServeHTTP(exportRec, exportReq)
	if exportRec.Code != http.StatusOK {
		t.Fatalf("expected 200 exporting, got %d: %s", exportRec.Code, exportRec.Body.String())
	}
	var manifest map[string]any
	if err := json.NewDecoder(exportRec.Body).Decode(&manifest); err != nil {
		t.Fatalf("decode manifest: %v", err)
	}

	// Import into a second, unrelated organization - a user can only ever
	// belong to one organization in this product, so this requires a
	// genuinely different admin user, not just a different organization_id
	// under the same principal.
	otherOrg, err := app.IAM.CreateOrganization(context.Background(), principal, iam.CreateOrganizationParams{
		Name: "Other Org", Slug: "other-org",
	})
	if err != nil {
		t.Fatalf("create other org: %v", err)
	}
	otherUser, err := app.IAM.CreateUser(context.Background(), principal, iam.CreateUserParams{
		Email: "other-admin@example.com", Password: "password123", DisplayName: "Other Admin",
		OrganizationID: otherOrg.ID, Role: "owner",
	})
	if err != nil {
		t.Fatalf("create other org admin: %v", err)
	}
	otherLogin, err := app.IAM.Login(context.Background(), otherUser.Email, "password123")
	if err != nil {
		t.Fatalf("login other org admin: %v", err)
	}

	importBody, _ := json.Marshal(map[string]any{"organization_id": otherOrg.ID, "manifest": manifest})
	importReq := httptest.NewRequest(http.MethodPost, "/api/v1/bundles/import", bytes.NewReader(importBody))
	importReq.Header.Set("Authorization", "Bearer "+otherLogin.Token)
	importReq.Header.Set("Content-Type", "application/json")
	importRec := httptest.NewRecorder()
	handler.ServeHTTP(importRec, importReq)
	if importRec.Code != http.StatusOK {
		t.Fatalf("expected 200 importing the exported manifest, got %d: %s", importRec.Code, importRec.Body.String())
	}
	var result struct {
		Created []any `json:"created"`
		Failed  []any `json:"failed"`
	}
	if err := json.NewDecoder(importRec.Body).Decode(&result); err != nil {
		t.Fatalf("decode import result: %v", err)
	}
	if len(result.Created) != 1 || len(result.Failed) != 0 {
		t.Fatalf("expected the round-tripped skill repo to import cleanly, got %+v", result)
	}
}
