package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDesktopPolicyCatalogEndpoint(t *testing.T) {
	handler, _, token, _, _ := newTestServerRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/desktop-policies/catalog", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var body struct {
		DesktopPolicies []struct {
			Code         string `json:"code"`
			DefaultValue bool   `json:"default_value"`
		} `json:"desktop_policies"`
		Count int `json:"count"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Count != 4 || len(body.DesktopPolicies) != 4 {
		t.Fatalf("expected 4 catalog entries, got %+v", body)
	}
	for _, policy := range body.DesktopPolicies {
		if !policy.DefaultValue {
			t.Fatalf("expected every catalog entry to default to true, got %+v", policy)
		}
	}
}

func TestDesktopPolicyCatalogEndpointRequiresAuth(t *testing.T) {
	handler, _, _, _, _ := newTestServerRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/desktop-policies/catalog", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
	}
}

func TestDesktopPolicyBindingsEndpointCRUDRoundTrip(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	// List starts empty.
	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/desktop-policy-bindings?organization_id="+orgID, nil)
	listReq.Header.Set("Authorization", "Bearer "+token)
	listRec := httptest.NewRecorder()
	handler.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected 200 listing bindings, got %d: %s", listRec.Code, listRec.Body.String())
	}
	var emptyList struct {
		Count int `json:"count"`
	}
	if err := json.NewDecoder(listRec.Body).Decode(&emptyList); err != nil {
		t.Fatalf("decode empty list: %v", err)
	}
	if emptyList.Count != 0 {
		t.Fatalf("expected an empty list before any binding exists, got count=%d", emptyList.Count)
	}

	// Create an org-wide binding.
	createBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID, "policy_code": "allow_custom_providers", "subject_type": "org", "value": false,
	})
	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/desktop-policy-bindings", bytes.NewReader(createBody))
	createReq.Header.Set("Authorization", "Bearer "+token)
	createReq.Header.Set("Content-Type", "application/json")
	createRec := httptest.NewRecorder()
	handler.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusOK {
		t.Fatalf("expected 200 creating a binding, got %d: %s", createRec.Code, createRec.Body.String())
	}
	var created struct {
		ID         string `json:"id"`
		PolicyCode string `json:"policy_code"`
		Value      bool   `json:"value"`
	}
	if err := json.NewDecoder(createRec.Body).Decode(&created); err != nil {
		t.Fatalf("decode created binding: %v", err)
	}
	if created.ID == "" || created.PolicyCode != "allow_custom_providers" || created.Value {
		t.Fatalf("unexpected created binding: %+v", created)
	}

	// List now shows it.
	listReq2 := httptest.NewRequest(http.MethodGet, "/api/v1/desktop-policy-bindings?organization_id="+orgID, nil)
	listReq2.Header.Set("Authorization", "Bearer "+token)
	listRec2 := httptest.NewRecorder()
	handler.ServeHTTP(listRec2, listReq2)
	var populatedList struct {
		Count int `json:"count"`
	}
	if err := json.NewDecoder(listRec2.Body).Decode(&populatedList); err != nil {
		t.Fatalf("decode populated list: %v", err)
	}
	if populatedList.Count != 1 {
		t.Fatalf("expected exactly one binding after creation, got count=%d", populatedList.Count)
	}

	// Posting again for the same subject/policy upserts rather than
	// duplicating.
	updateBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID, "policy_code": "allow_custom_providers", "subject_type": "org", "value": true,
	})
	updateReq := httptest.NewRequest(http.MethodPost, "/api/v1/desktop-policy-bindings", bytes.NewReader(updateBody))
	updateReq.Header.Set("Authorization", "Bearer "+token)
	updateReq.Header.Set("Content-Type", "application/json")
	updateRec := httptest.NewRecorder()
	handler.ServeHTTP(updateRec, updateReq)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("expected 200 upserting a binding, got %d: %s", updateRec.Code, updateRec.Body.String())
	}
	var updated struct {
		ID    string `json:"id"`
		Value bool   `json:"value"`
	}
	if err := json.NewDecoder(updateRec.Body).Decode(&updated); err != nil {
		t.Fatalf("decode updated binding: %v", err)
	}
	if updated.ID != created.ID || !updated.Value {
		t.Fatalf("expected the same binding updated in place with value=true, got %+v", updated)
	}

	// Delete it.
	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/v1/desktop-policy-bindings/"+created.ID, nil)
	deleteReq.Header.Set("Authorization", "Bearer "+token)
	deleteRec := httptest.NewRecorder()
	handler.ServeHTTP(deleteRec, deleteReq)
	if deleteRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 deleting the binding, got %d: %s", deleteRec.Code, deleteRec.Body.String())
	}

	listReq3 := httptest.NewRequest(http.MethodGet, "/api/v1/desktop-policy-bindings?organization_id="+orgID, nil)
	listReq3.Header.Set("Authorization", "Bearer "+token)
	listRec3 := httptest.NewRecorder()
	handler.ServeHTTP(listRec3, listReq3)
	var finalList struct {
		Count int `json:"count"`
	}
	if err := json.NewDecoder(listRec3.Body).Decode(&finalList); err != nil {
		t.Fatalf("decode final list: %v", err)
	}
	if finalList.Count != 0 {
		t.Fatalf("expected the list to be empty again after deletion, got count=%d", finalList.Count)
	}
}

func TestDesktopPolicyBindingsEndpointRejectsUnknownPolicyCode(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{
		"organization_id": orgID, "policy_code": "not_a_real_policy", "subject_type": "org", "value": false,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/desktop-policy-bindings", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code == http.StatusOK {
		t.Fatalf("expected an unknown policy_code to be rejected, got 200: %s", rec.Body.String())
	}
}
