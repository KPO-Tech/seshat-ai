package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/scim"
)

// scimTestConnection bootstraps a server and creates a SCIM connection for
// its default organization, returning the router and the connection's raw
// bearer token - the credential every /scim/v2/* test authenticates with,
// as opposed to the session token newTestServerRouter also returns (which
// /scim/v2/* routes must reject, see TestScimProtocolRejectsANormalSessionToken).
func scimTestConnection(t *testing.T) (http.Handler, string) {
	t.Helper()
	handler, backend, _, orgID, principal := newTestServerRouter(t)
	created, err := backend.Scim.CreateConnection(context.Background(), principal, scim.CreateConnectionParams{
		OrganizationID: orgID, Name: "Okta",
	})
	if err != nil {
		t.Fatalf("create scim connection: %v", err)
	}
	return handler, created.Token
}

func TestScimDiscoveryEndpointsRequireAValidBearerToken(t *testing.T) {
	handler, _ := scimTestConnection(t)

	for _, path := range []string{
		"/scim/v2/ServiceProviderConfig",
		"/scim/v2/ResourceTypes",
		"/scim/v2/ResourceTypes/User",
		"/scim/v2/Schemas",
		"/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:User",
	} {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("%s: expected 401 without a bearer token, got %d: %s", path, recorder.Code, recorder.Body.String())
		}
		var body struct {
			Schemas []string `json:"schemas"`
		}
		if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil {
			t.Fatalf("%s: decode error body: %v", path, err)
		}
		if len(body.Schemas) != 1 || body.Schemas[0] != scimErrorSchema {
			t.Fatalf("%s: expected a SCIM-formatted error body, got %+v", path, body)
		}

		request2 := httptest.NewRequest(http.MethodGet, path, nil)
		request2.Header.Set("Authorization", "Bearer not-a-real-token")
		recorder2 := httptest.NewRecorder()
		handler.ServeHTTP(recorder2, request2)
		if recorder2.Code != http.StatusUnauthorized {
			t.Fatalf("%s: expected 401 for an unknown token, got %d", path, recorder2.Code)
		}
	}
}

func TestScimProtocolRejectsANormalSessionToken(t *testing.T) {
	handler, _, sessionToken, _, _ := newTestServerRouter(t)

	request := httptest.NewRequest(http.MethodGet, "/scim/v2/ServiceProviderConfig", nil)
	request.Header.Set("Authorization", "Bearer "+sessionToken)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected a normal user session token to be rejected by the SCIM protocol surface, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestScimServiceProviderConfigDeclaresPatchAndFilterSupport(t *testing.T) {
	handler, scimToken := scimTestConnection(t)

	request := httptest.NewRequest(http.MethodGet, "/scim/v2/ServiceProviderConfig", nil)
	request.Header.Set("Authorization", "Bearer "+scimToken)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected success, got %d: %s", recorder.Code, recorder.Body.String())
	}
	var body struct {
		Patch  struct{ Supported bool } `json:"patch"`
		Filter struct{ Supported bool } `json:"filter"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !body.Patch.Supported || !body.Filter.Supported {
		t.Fatalf("expected patch and filter to be declared as supported, got %+v", body)
	}
}

func TestScimResourceTypesListsUserAndGroup(t *testing.T) {
	handler, scimToken := scimTestConnection(t)

	request := httptest.NewRequest(http.MethodGet, "/scim/v2/ResourceTypes", nil)
	request.Header.Set("Authorization", "Bearer "+scimToken)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected success, got %d: %s", recorder.Code, recorder.Body.String())
	}
	var body struct {
		TotalResults int                      `json:"totalResults"`
		Resources    []map[string]interface{} `json:"Resources"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.TotalResults != 2 || len(body.Resources) != 2 {
		t.Fatalf("expected User and Group resource types, got %+v", body)
	}
}

func TestScimResourceTypeByIDReturns404ForUnknownID(t *testing.T) {
	handler, scimToken := scimTestConnection(t)

	request := httptest.NewRequest(http.MethodGet, "/scim/v2/ResourceTypes/Widget", nil)
	request.Header.Set("Authorization", "Bearer "+scimToken)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for an unknown resource type, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestScimSchemasListsUserAndGroupWithAttributes(t *testing.T) {
	handler, scimToken := scimTestConnection(t)

	request := httptest.NewRequest(http.MethodGet, "/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:User", nil)
	request.Header.Set("Authorization", "Bearer "+scimToken)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected success, got %d: %s", recorder.Code, recorder.Body.String())
	}
	var body struct {
		ID         string                   `json:"id"`
		Attributes []map[string]interface{} `json:"attributes"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.ID != "urn:ietf:params:scim:schemas:core:2.0:User" || len(body.Attributes) == 0 {
		t.Fatalf("unexpected schema: %+v", body)
	}
}

func TestScimSchemaByIDReturns404ForUnknownSchema(t *testing.T) {
	handler, scimToken := scimTestConnection(t)

	request := httptest.NewRequest(http.MethodGet, "/scim/v2/Schemas/urn:unknown", nil)
	request.Header.Set("Authorization", "Bearer "+scimToken)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for an unknown schema, got %d: %s", recorder.Code, recorder.Body.String())
	}
}
