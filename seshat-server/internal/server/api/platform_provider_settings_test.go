package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/automation"
)

func TestPlatformProviderSettingsCRUDOverHTTPNeverExposesTheAPIKey(t *testing.T) {
	t.Setenv("SESHAT_SERVER_ENCRYPTION_KEY", "g/t9EsDxTTJSTu6Q+Kne06PBHoGmhH3yAJaEuHmFl9A=")
	handler, _, token, _, _ := newTestServerRouter(t)

	createBody, _ := json.Marshal(map[string]any{
		"provider":      "anthropic",
		"default_model": "claude-sonnet-5",
		"api_key":       "sk-ant-should-never-leak",
	})
	createRequest := httptest.NewRequest(http.MethodPost, "/api/v1/platform/provider-settings", bytes.NewReader(createBody))
	createRequest.Header.Set("Authorization", "Bearer "+token)
	createRecorder := httptest.NewRecorder()
	handler.ServeHTTP(createRecorder, createRequest)
	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("expected create success, got %d: %s", createRecorder.Code, createRecorder.Body.String())
	}
	if bytes.Contains(createRecorder.Body.Bytes(), []byte("sk-ant-should-never-leak")) {
		t.Fatal("the raw API key must never appear in the create response")
	}
	var created automation.PlatformProviderSetting
	if err := json.NewDecoder(createRecorder.Body).Decode(&created); err != nil {
		t.Fatalf("decode created setting: %v", err)
	}
	if created.Provider != "anthropic" {
		t.Fatalf("unexpected provider: %s", created.Provider)
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/api/v1/platform/provider-settings", nil)
	listRequest.Header.Set("Authorization", "Bearer "+token)
	listRecorder := httptest.NewRecorder()
	handler.ServeHTTP(listRecorder, listRequest)
	if listRecorder.Code != http.StatusOK {
		t.Fatalf("expected list success, got %d: %s", listRecorder.Code, listRecorder.Body.String())
	}
	if bytes.Contains(listRecorder.Body.Bytes(), []byte("sk-ant-should-never-leak")) {
		t.Fatal("the raw API key must never appear in the list response")
	}

	updateBody, _ := json.Marshal(map[string]any{"default_model": "claude-opus-5"})
	updateRequest := httptest.NewRequest(http.MethodPut, "/api/v1/platform/provider-settings/"+created.ID, bytes.NewReader(updateBody))
	updateRequest.Header.Set("Authorization", "Bearer "+token)
	updateRecorder := httptest.NewRecorder()
	handler.ServeHTTP(updateRecorder, updateRequest)
	if updateRecorder.Code != http.StatusOK {
		t.Fatalf("expected update success, got %d: %s", updateRecorder.Code, updateRecorder.Body.String())
	}

	deleteRequest := httptest.NewRequest(http.MethodDelete, "/api/v1/platform/provider-settings/"+created.ID, nil)
	deleteRequest.Header.Set("Authorization", "Bearer "+token)
	deleteRecorder := httptest.NewRecorder()
	handler.ServeHTTP(deleteRecorder, deleteRequest)
	if deleteRecorder.Code != http.StatusNoContent {
		t.Fatalf("expected delete success, got %d: %s", deleteRecorder.Code, deleteRecorder.Body.String())
	}

	getRequest := httptest.NewRequest(http.MethodGet, "/api/v1/platform/provider-settings/"+created.ID, nil)
	getRequest.Header.Set("Authorization", "Bearer "+token)
	getRecorder := httptest.NewRecorder()
	handler.ServeHTTP(getRecorder, getRequest)
	if getRecorder.Code != http.StatusNotFound {
		t.Fatalf("expected the deleted setting to 404, got %d", getRecorder.Code)
	}
}

func TestPlatformProviderSettingsRequireAuthentication(t *testing.T) {
	handler, _, _, _, _ := newTestServerRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/platform/provider-settings", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a bearer token, got %d", recorder.Code)
	}
}
