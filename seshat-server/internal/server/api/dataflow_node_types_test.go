package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDataflowNodeTypesEndpointRequiresAuth(t *testing.T) {
	handler, _, _, _, _ := newTestServerRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/dataflow/node-types", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
	}
}

// TestDataflowNodeTypesEndpointListsRegisteredNodes proves this reads the
// real registry app.New() builds (builtins + generic + database nodes), not
// a stub - a node-palette UI needs the exact list a Job.Graph can actually
// reference on this deployment.
func TestDataflowNodeTypesEndpointListsRegisteredNodes(t *testing.T) {
	handler, _, token, _, _ := newTestServerRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/dataflow/node-types", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Count     int `json:"count"`
		NodeTypes []struct {
			Type string `json:"type"`
		} `json:"node_types"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Count == 0 || len(body.NodeTypes) != body.Count {
		t.Fatalf("expected a non-empty, consistent node type list, got %+v", body)
	}
	found := map[string]bool{}
	for _, n := range body.NodeTypes {
		found[n.Type] = true
	}
	for _, want := range []string{"agent", "subworkflow", "http_request", "if", "postgres"} {
		if !found[want] {
			t.Fatalf("expected node type %q in the list, got %+v", want, body.NodeTypes)
		}
	}
}
