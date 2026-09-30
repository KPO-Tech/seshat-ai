package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOrganizationVerifyDomainEndpoint(t *testing.T) {
	handler, backend, token, orgID, _ := newTestServerRouter(t)

	updateBody, _ := json.Marshal(map[string]any{"name": "Seshat", "slug": "seshat", "domain": "acmecorp.com"})
	updateRequest := httptest.NewRequest(http.MethodPut, "/api/v1/organizations/"+orgID, bytes.NewReader(updateBody))
	updateRequest.Header.Set("Authorization", "Bearer "+token)
	updateRecorder := httptest.NewRecorder()
	handler.ServeHTTP(updateRecorder, updateRequest)
	if updateRecorder.Code != http.StatusOK {
		t.Fatalf("expected domain update success, got %d: %s", updateRecorder.Code, updateRecorder.Body.String())
	}
	var updated struct {
		DomainVerificationToken *string `json:"domain_verification_token"`
	}
	if err := json.NewDecoder(updateRecorder.Body).Decode(&updated); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if updated.DomainVerificationToken == nil {
		t.Fatal("expected a domain verification token in the update response")
	}
	token2 := *updated.DomainVerificationToken

	backend.IAM.SetDomainLookupTXT(func(_ context.Context, host string) ([]string, error) {
		if host != "_seshat-challenge.acmecorp.com" {
			return nil, nil
		}
		return []string{"seshat-verification=" + token2}, nil
	})

	verifyRequest := httptest.NewRequest(http.MethodPost, "/api/v1/organizations/"+orgID+"/verify-domain", nil)
	verifyRequest.Header.Set("Authorization", "Bearer "+token)
	verifyRecorder := httptest.NewRecorder()
	handler.ServeHTTP(verifyRecorder, verifyRequest)
	if verifyRecorder.Code != http.StatusOK {
		t.Fatalf("expected verify-domain success, got %d: %s", verifyRecorder.Code, verifyRecorder.Body.String())
	}
	var verified struct {
		DomainVerifiedAt *string `json:"domain_verified_at"`
	}
	if err := json.NewDecoder(verifyRecorder.Body).Decode(&verified); err != nil {
		t.Fatalf("decode verify response: %v", err)
	}
	if verified.DomainVerifiedAt == nil {
		t.Fatal("expected domain_verified_at to be set after verification")
	}
}
