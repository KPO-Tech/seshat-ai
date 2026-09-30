package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/scim"
)

func TestScimUsersFullLifecycleOverHTTP(t *testing.T) {
	handler, scimToken := scimTestConnection(t)

	// Create.
	createBody, _ := json.Marshal(map[string]any{
		"schemas":     []string{"urn:ietf:params:scim:schemas:core:2.0:User"},
		"userName":    "alice@example.com",
		"displayName": "Alice",
		"active":      true,
		"externalId":  "idp-alice-1",
	})
	createRequest := httptest.NewRequest(http.MethodPost, "/scim/v2/Users", bytes.NewReader(createBody))
	createRequest.Header.Set("Authorization", "Bearer "+scimToken)
	createRecorder := httptest.NewRecorder()
	handler.ServeHTTP(createRecorder, createRequest)
	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("expected create success, got %d: %s", createRecorder.Code, createRecorder.Body.String())
	}
	var created struct {
		ID         string `json:"id"`
		UserName   string `json:"userName"`
		Active     bool   `json:"active"`
		ExternalID string `json:"externalId"`
	}
	if err := json.NewDecoder(createRecorder.Body).Decode(&created); err != nil {
		t.Fatalf("decode created: %v", err)
	}
	if created.ID == "" || created.UserName != "alice@example.com" || !created.Active || created.ExternalID != "idp-alice-1" {
		t.Fatalf("unexpected created resource: %+v", created)
	}

	// Duplicate create -> 409.
	dupRequest := httptest.NewRequest(http.MethodPost, "/scim/v2/Users", bytes.NewReader(createBody))
	dupRequest.Header.Set("Authorization", "Bearer "+scimToken)
	dupRecorder := httptest.NewRecorder()
	handler.ServeHTTP(dupRecorder, dupRequest)
	if dupRecorder.Code != http.StatusConflict {
		t.Fatalf("expected 409 on duplicate email, got %d: %s", dupRecorder.Code, dupRecorder.Body.String())
	}

	// Get by id.
	getRequest := httptest.NewRequest(http.MethodGet, "/scim/v2/Users/"+created.ID, nil)
	getRequest.Header.Set("Authorization", "Bearer "+scimToken)
	getRecorder := httptest.NewRecorder()
	handler.ServeHTTP(getRecorder, getRequest)
	if getRecorder.Code != http.StatusOK {
		t.Fatalf("expected get success, got %d: %s", getRecorder.Code, getRecorder.Body.String())
	}

	// Filtered list.
	listRequest := httptest.NewRequest(http.MethodGet, `/scim/v2/Users?filter=userName+eq+"alice@example.com"`, nil)
	listRequest.Header.Set("Authorization", "Bearer "+scimToken)
	listRecorder := httptest.NewRecorder()
	handler.ServeHTTP(listRecorder, listRequest)
	if listRecorder.Code != http.StatusOK {
		t.Fatalf("expected list success, got %d: %s", listRecorder.Code, listRecorder.Body.String())
	}
	var listBody struct {
		TotalResults int `json:"totalResults"`
	}
	if err := json.NewDecoder(listRecorder.Body).Decode(&listBody); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if listBody.TotalResults != 1 {
		t.Fatalf("expected exactly one filtered match, got %d", listBody.TotalResults)
	}

	// PATCH active:false (the real-world Okta/Entra deprovisioning shape).
	patchBody, _ := json.Marshal(map[string]any{
		"schemas": []string{"urn:ietf:params:scim:api:messages:2.0:PatchOp"},
		"Operations": []map[string]any{
			{"op": "replace", "path": "active", "value": false},
		},
	})
	patchRequest := httptest.NewRequest(http.MethodPatch, "/scim/v2/Users/"+created.ID, bytes.NewReader(patchBody))
	patchRequest.Header.Set("Authorization", "Bearer "+scimToken)
	patchRecorder := httptest.NewRecorder()
	handler.ServeHTTP(patchRecorder, patchRequest)
	if patchRecorder.Code != http.StatusOK {
		t.Fatalf("expected patch success, got %d: %s", patchRecorder.Code, patchRecorder.Body.String())
	}
	var patched struct{ Active bool }
	if err := json.NewDecoder(patchRecorder.Body).Decode(&patched); err != nil {
		t.Fatalf("decode patched: %v", err)
	}
	if patched.Active {
		t.Fatal("expected active:false patch to deactivate the user")
	}

	// PUT full replace, reactivating.
	putBody, _ := json.Marshal(map[string]any{
		"userName": "alice@example.com", "displayName": "Alice Renamed", "active": true,
	})
	putRequest := httptest.NewRequest(http.MethodPut, "/scim/v2/Users/"+created.ID, bytes.NewReader(putBody))
	putRequest.Header.Set("Authorization", "Bearer "+scimToken)
	putRecorder := httptest.NewRecorder()
	handler.ServeHTTP(putRecorder, putRequest)
	if putRecorder.Code != http.StatusOK {
		t.Fatalf("expected put success, got %d: %s", putRecorder.Code, putRecorder.Body.String())
	}
	var replaced struct {
		Active      bool
		DisplayName string
	}
	if err := json.NewDecoder(putRecorder.Body).Decode(&replaced); err != nil {
		t.Fatalf("decode replaced: %v", err)
	}
	if !replaced.Active || replaced.DisplayName != "Alice Renamed" {
		t.Fatalf("unexpected replaced resource: %+v", replaced)
	}

	// DELETE -> deactivates, doesn't remove.
	deleteRequest := httptest.NewRequest(http.MethodDelete, "/scim/v2/Users/"+created.ID, nil)
	deleteRequest.Header.Set("Authorization", "Bearer "+scimToken)
	deleteRecorder := httptest.NewRecorder()
	handler.ServeHTTP(deleteRecorder, deleteRequest)
	if deleteRecorder.Code != http.StatusNoContent {
		t.Fatalf("expected delete success, got %d: %s", deleteRecorder.Code, deleteRecorder.Body.String())
	}
	getAfterDeleteRequest := httptest.NewRequest(http.MethodGet, "/scim/v2/Users/"+created.ID, nil)
	getAfterDeleteRequest.Header.Set("Authorization", "Bearer "+scimToken)
	getAfterDeleteRecorder := httptest.NewRecorder()
	handler.ServeHTTP(getAfterDeleteRecorder, getAfterDeleteRequest)
	if getAfterDeleteRecorder.Code != http.StatusOK {
		t.Fatalf("expected get-after-delete to still find the (deactivated) resource, got %d: %s", getAfterDeleteRecorder.Code, getAfterDeleteRecorder.Body.String())
	}
	var afterDelete struct{ Active bool }
	if err := json.NewDecoder(getAfterDeleteRecorder.Body).Decode(&afterDelete); err != nil {
		t.Fatalf("decode get-after-delete: %v", err)
	}
	if afterDelete.Active {
		t.Fatal("expected the resource to remain deactivated after DELETE, not reset")
	}
}

func TestScimUserGetUnknownIDReturns404(t *testing.T) {
	handler, scimToken := scimTestConnection(t)

	request := httptest.NewRequest(http.MethodGet, "/scim/v2/Users/usr_does_not_exist", nil)
	request.Header.Set("Authorization", "Bearer "+scimToken)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestScimUserUnsupportedFilterReturns400(t *testing.T) {
	handler, scimToken := scimTestConnection(t)

	request := httptest.NewRequest(http.MethodGet, `/scim/v2/Users?filter=id+eq+"usr_x"`, nil)
	request.Header.Set("Authorization", "Bearer "+scimToken)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for an unsupported filter attribute, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestScimUsersCrossOrganizationIsolation(t *testing.T) {
	handler, backend, _, orgA, principal := newTestServerRouter(t)
	connectionA, err := backend.Scim.CreateConnection(context.Background(), principal, scim.CreateConnectionParams{
		OrganizationID: orgA, Name: "Okta",
	})
	if err != nil {
		t.Fatalf("create connection a: %v", err)
	}

	createBody, _ := json.Marshal(map[string]any{"userName": "alice@example.com", "displayName": "Alice", "active": true})
	createRequest := httptest.NewRequest(http.MethodPost, "/scim/v2/Users", bytes.NewReader(createBody))
	createRequest.Header.Set("Authorization", "Bearer "+connectionA.Token)
	createRecorder := httptest.NewRecorder()
	handler.ServeHTTP(createRecorder, createRequest)
	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("expected create success, got %d: %s", createRecorder.Code, createRecorder.Body.String())
	}
	var created struct{ ID string }
	if err := json.NewDecoder(createRecorder.Body).Decode(&created); err != nil {
		t.Fatalf("decode: %v", err)
	}

	// A second organization on the SAME server, with its own SCIM
	// connection, must not be able to see the first organization's user by
	// id - the real security property this test exists for (two independent
	// in-memory servers would never collide anyway, so that would prove
	// nothing).
	orgB, err := backend.IAM.CreateOrganization(context.Background(), principal, iam.CreateOrganizationParams{Name: "Org B", Slug: "org-b"})
	if err != nil {
		t.Fatalf("create org b: %v", err)
	}
	connectionB, err := backend.Scim.CreateConnection(context.Background(), principal, scim.CreateConnectionParams{
		OrganizationID: orgB.ID, Name: "Entra",
	})
	if err != nil {
		t.Fatalf("create connection b: %v", err)
	}

	getRequest := httptest.NewRequest(http.MethodGet, "/scim/v2/Users/"+created.ID, nil)
	getRequest.Header.Set("Authorization", "Bearer "+connectionB.Token)
	getRecorder := httptest.NewRecorder()
	handler.ServeHTTP(getRecorder, getRequest)
	if getRecorder.Code != http.StatusNotFound {
		t.Fatalf("expected a different organization's connection to get 404, got %d: %s", getRecorder.Code, getRecorder.Body.String())
	}
}
