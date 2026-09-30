package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDataflowTemplatesEndpointRequiresAuth(t *testing.T) {
	handler, _, _, _, _ := newTestServerRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/dataflow/templates", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
	}
}

func TestDataflowTemplatesEndpointListsBuiltInTemplates(t *testing.T) {
	handler, _, token, _, _ := newTestServerRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/dataflow/templates", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Count     int `json:"count"`
		Templates []struct {
			ID         string `json:"id"`
			Definition struct {
				Nodes []struct {
					Type string `json:"type"`
				} `json:"nodes"`
			} `json:"definition"`
		} `json:"templates"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Count != 4 || len(body.Templates) != body.Count {
		t.Fatalf("expected 4 templates, got %+v", body)
	}
	for _, tpl := range body.Templates {
		if tpl.ID == "" || len(tpl.Definition.Nodes) == 0 {
			t.Fatalf("template %+v is missing an id or a real graph definition", tpl)
		}
	}
}
