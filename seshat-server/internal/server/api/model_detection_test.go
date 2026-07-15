package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDetectProviderModelsRequiresAuth(t *testing.T) {
	handler, _, _, _, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"provider": "ollama"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/provider-settings/detect-models", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestDetectProviderModelsNonOllamaReturnsEmpty(t *testing.T) {
	handler, _, token, _, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"provider": "anthropic"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/provider-settings/detect-models", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var result struct {
		Models []string `json:"models"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(result.Models) != 0 {
		t.Fatalf("expected no models for a non-ollama provider, got %v", result.Models)
	}
}

// An unreachable Ollama target must resolve with 200 + an empty list, not an
// error status - the console falls back to manual model entry either way,
// and a probe failure isn't a client error.
func TestDetectProviderModelsUnreachableOllamaReturnsEmptyNotError(t *testing.T) {
	handler, _, token, _, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"provider": "ollama", "base_url": "http://127.0.0.1:1"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/provider-settings/detect-models", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 even when unreachable, got %d: %s", rec.Code, rec.Body.String())
	}
	var result struct {
		Models []string `json:"models"`
		Error  string   `json:"error"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(result.Models) != 0 {
		t.Fatalf("expected no models, got %v", result.Models)
	}
	if result.Error == "" {
		t.Fatal("expected an error message describing the probe failure")
	}
}

func TestDetectEmbedderModelsRequiresAuth(t *testing.T) {
	handler, _, _, _, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"provider": "openai"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/embedder-settings/detect-models", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestDetectEmbedderModelsNonOllamaReturnsStaticList(t *testing.T) {
	handler, _, token, _, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"provider": "openai"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/embedder-settings/detect-models", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var result struct {
		EmbeddingModels []string `json:"embedding_models"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(result.EmbeddingModels) == 0 {
		t.Fatal("expected a static curated list for openai")
	}
}

func TestIsOllamaEmbeddingModelClassification(t *testing.T) {
	cases := []struct {
		name     string
		model    string
		family   string
		families []string
		want     bool
	}{
		{name: "nomic embed by name", model: "nomic-embed-text", want: true},
		{name: "mxbai embed by name", model: "mxbai-embed-large", want: true},
		{name: "bert family", model: "some-model", family: "bert", want: true},
		{name: "regular llm", model: "llama3.1:8b", family: "llama", want: false},
		{name: "embed family in families list", model: "custom-model", families: []string{"bert"}, want: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := isOllamaEmbeddingModel(tc.model, tc.family, tc.families)
			if got != tc.want {
				t.Fatalf("isOllamaEmbeddingModel(%q, %q, %v) = %v, want %v", tc.model, tc.family, tc.families, got, tc.want)
			}
		})
	}
}
