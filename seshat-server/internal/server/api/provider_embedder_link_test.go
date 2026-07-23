package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCreatingProviderSettingAutoConfiguresEmbedder(t *testing.T) {
	t.Setenv("SESHAT_SERVER_ENCRYPTION_KEY", "g/t9EsDxTTJSTu6Q+Kne06PBHoGmhH3yAJaEuHmFl9A=")
	handler, _, token, orgID, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"provider":        "mistral",
		"default_model":   "mistral-small-latest",
		"api_key":         "sk-mistral-test",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/provider-settings", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/embedder-settings?organization_id="+orgID, nil)
	getReq.Header.Set("Authorization", "Bearer "+token)
	getRec := httptest.NewRecorder()
	handler.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("expected embedder setting to have been auto-configured, got %d: %s", getRec.Code, getRec.Body.String())
	}
	var embedder struct {
		Provider string `json:"provider"`
		Model    string `json:"model"`
		BaseURL  string `json:"base_url"`
	}
	if err := json.NewDecoder(getRec.Body).Decode(&embedder); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if embedder.Provider != "openai" || embedder.Model != "mistral-embed" || embedder.BaseURL != "https://api.mistral.ai/v1" {
		t.Fatalf("unexpected auto-configured embedder: %+v", embedder)
	}
}

func TestCreatingProviderSettingNeverOverwritesExistingEmbedder(t *testing.T) {
	t.Setenv("SESHAT_SERVER_ENCRYPTION_KEY", "g/t9EsDxTTJSTu6Q+Kne06PBHoGmhH3yAJaEuHmFl9A=")
	handler, _, token, orgID, _ := newTestServerRouter(t)

	// Org already has its own embedder configured deliberately.
	embedderBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"provider":        "ollama",
		"model":           "nomic-embed-text",
		"base_url":        "http://localhost:11434",
	})
	embedderReq := httptest.NewRequest(http.MethodPut, "/api/v1/embedder-settings", bytes.NewReader(embedderBody))
	embedderReq.Header.Set("Authorization", "Bearer "+token)
	embedderRec := httptest.NewRecorder()
	handler.ServeHTTP(embedderRec, embedderReq)
	if embedderRec.Code != http.StatusOK {
		t.Fatalf("expected embedder setup to succeed, got %d: %s", embedderRec.Code, embedderRec.Body.String())
	}

	providerBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"provider":        "mistral",
		"default_model":   "mistral-small-latest",
		"api_key":         "sk-mistral-test",
	})
	providerReq := httptest.NewRequest(http.MethodPost, "/api/v1/provider-settings", bytes.NewReader(providerBody))
	providerReq.Header.Set("Authorization", "Bearer "+token)
	providerRec := httptest.NewRecorder()
	handler.ServeHTTP(providerRec, providerReq)
	if providerRec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", providerRec.Code, providerRec.Body.String())
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/embedder-settings?organization_id="+orgID, nil)
	getReq.Header.Set("Authorization", "Bearer "+token)
	getRec := httptest.NewRecorder()
	handler.ServeHTTP(getRec, getReq)
	var embedder struct {
		Provider string `json:"provider"`
	}
	if err := json.NewDecoder(getRec.Body).Decode(&embedder); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if embedder.Provider != "ollama" {
		t.Fatalf("expected the pre-existing ollama embedder to survive untouched, got provider=%q", embedder.Provider)
	}
}

func TestSettingEmbedderAutoConfiguresProvider(t *testing.T) {
	t.Setenv("SESHAT_SERVER_ENCRYPTION_KEY", "g/t9EsDxTTJSTu6Q+Kne06PBHoGmhH3yAJaEuHmFl9A=")
	handler, _, token, orgID, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"provider":        "openai",
		"model":           "mistral-embed",
		"base_url":        "https://api.mistral.ai/v1",
		"api_key":         "sk-mistral-test",
	})
	req := httptest.NewRequest(http.MethodPut, "/api/v1/embedder-settings", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/provider-settings?organization_id="+orgID, nil)
	listReq.Header.Set("Authorization", "Bearer "+token)
	listRec := httptest.NewRecorder()
	handler.ServeHTTP(listRec, listReq)
	var result struct {
		ProviderSettings []struct {
			Provider     string `json:"provider"`
			DefaultModel string `json:"default_model"`
			BaseURL      string `json:"base_url"`
		} `json:"provider_settings"`
	}
	if err := json.NewDecoder(listRec.Body).Decode(&result); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(result.ProviderSettings) != 1 {
		t.Fatalf("expected exactly one auto-configured provider setting, got %d", len(result.ProviderSettings))
	}
	if result.ProviderSettings[0].Provider != "mistral" || result.ProviderSettings[0].BaseURL != "https://api.mistral.ai/v1" {
		t.Fatalf("unexpected auto-configured provider setting: %+v", result.ProviderSettings[0])
	}
}

func TestUnrecognizedEmbedderEndpointDoesNotAutoConfigureAnyProvider(t *testing.T) {
	t.Setenv("SESHAT_SERVER_ENCRYPTION_KEY", "g/t9EsDxTTJSTu6Q+Kne06PBHoGmhH3yAJaEuHmFl9A=")
	handler, _, token, orgID, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"provider":        "ollama",
		"model":           "nomic-embed-text",
		"base_url":        "http://localhost:11434",
	})
	req := httptest.NewRequest(http.MethodPut, "/api/v1/embedder-settings", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/provider-settings?organization_id="+orgID, nil)
	listReq.Header.Set("Authorization", "Bearer "+token)
	listRec := httptest.NewRecorder()
	handler.ServeHTTP(listRec, listReq)
	var result struct {
		Count int `json:"count"`
	}
	if err := json.NewDecoder(listRec.Body).Decode(&result); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if result.Count != 0 {
		t.Fatalf("expected no auto-configured provider setting for a local ollama embedder, got %d", result.Count)
	}
}
