package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
)

func TestEmbedderSettingCRUDOverHTTPNeverExposesTheAPIKey(t *testing.T) {
	t.Setenv("SESHAT_SERVER_ENCRYPTION_KEY", "g/t9EsDxTTJSTu6Q+Kne06PBHoGmhH3yAJaEuHmFl9A=")
	handler, _, token, orgID, _ := newTestServerRouter(t)

	setBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"provider":        "openai",
		"model":           "text-embedding-3-small",
		"base_url":        "https://api.openai.com/v1",
		"api_key":         "sk-embed-should-never-leak",
	})
	setRequest := httptest.NewRequest(http.MethodPut, "/api/v1/embedder-settings", bytes.NewReader(setBody))
	setRequest.Header.Set("Authorization", "Bearer "+token)
	setRecorder := httptest.NewRecorder()
	handler.ServeHTTP(setRecorder, setRequest)
	if setRecorder.Code != http.StatusOK {
		t.Fatalf("expected set success, got %d: %s", setRecorder.Code, setRecorder.Body.String())
	}
	if bytes.Contains(setRecorder.Body.Bytes(), []byte("sk-embed-should-never-leak")) {
		t.Fatal("the raw API key must never appear in the response")
	}
	var setting knowledge.EmbedderSetting
	if err := json.NewDecoder(setRecorder.Body).Decode(&setting); err != nil {
		t.Fatalf("decode setting: %v", err)
	}
	if setting.Provider != "openai" || setting.OrganizationID != orgID {
		t.Fatalf("unexpected setting: %+v", setting)
	}

	getRequest := httptest.NewRequest(http.MethodGet, "/api/v1/embedder-settings?organization_id="+orgID, nil)
	getRequest.Header.Set("Authorization", "Bearer "+token)
	getRecorder := httptest.NewRecorder()
	handler.ServeHTTP(getRecorder, getRequest)
	if getRecorder.Code != http.StatusOK {
		t.Fatalf("expected get success, got %d: %s", getRecorder.Code, getRecorder.Body.String())
	}
	if bytes.Contains(getRecorder.Body.Bytes(), []byte("sk-embed-should-never-leak")) {
		t.Fatal("the raw API key must never appear in the get response")
	}

	deleteRequest := httptest.NewRequest(http.MethodDelete, "/api/v1/embedder-settings?organization_id="+orgID, nil)
	deleteRequest.Header.Set("Authorization", "Bearer "+token)
	deleteRecorder := httptest.NewRecorder()
	handler.ServeHTTP(deleteRecorder, deleteRequest)
	if deleteRecorder.Code != http.StatusNoContent {
		t.Fatalf("expected delete success, got %d: %s", deleteRecorder.Code, deleteRecorder.Body.String())
	}

	getAfterDeleteRequest := httptest.NewRequest(http.MethodGet, "/api/v1/embedder-settings?organization_id="+orgID, nil)
	getAfterDeleteRequest.Header.Set("Authorization", "Bearer "+token)
	getAfterDeleteRecorder := httptest.NewRecorder()
	handler.ServeHTTP(getAfterDeleteRecorder, getAfterDeleteRequest)
	if getAfterDeleteRecorder.Code != http.StatusNotFound {
		t.Fatalf("expected the deleted setting to 404, got %d", getAfterDeleteRecorder.Code)
	}
}

func TestPlatformEmbedderSettingRequiresPlatformAdminOverHTTP(t *testing.T) {
	handler, backend, token, orgID, principal := newTestServerRouter(t)

	setBody, _ := json.Marshal(map[string]any{
		"provider": "openai", "model": "text-embedding-3-small", "base_url": "https://api.openai.com/v1",
	})
	setRequest := httptest.NewRequest(http.MethodPut, "/api/v1/platform/embedder-settings", bytes.NewReader(setBody))
	setRequest.Header.Set("Authorization", "Bearer "+token)
	setRecorder := httptest.NewRecorder()
	handler.ServeHTTP(setRecorder, setRequest)
	if setRecorder.Code != http.StatusOK {
		t.Fatalf("expected the platform admin to set the platform embedder, got %d: %s", setRecorder.Code, setRecorder.Body.String())
	}

	member, err := backend.IAM.CreateUser(context.Background(), principal, iam.CreateUserParams{
		Email:          "member@example.com",
		Password:       "password123",
		DisplayName:    "Member",
		OrganizationID: orgID,
		Role:           "member",
	})
	if err != nil {
		t.Fatalf("create member: %v", err)
	}
	memberLogin, err := backend.IAM.Login(context.Background(), member.Email, "password123")
	if err != nil {
		t.Fatalf("login member: %v", err)
	}
	getRequest := httptest.NewRequest(http.MethodGet, "/api/v1/platform/embedder-settings", nil)
	getRequest.Header.Set("Authorization", "Bearer "+memberLogin.Token)
	getRecorder := httptest.NewRecorder()
	handler.ServeHTTP(getRecorder, getRequest)
	if getRecorder.Code != http.StatusForbidden {
		t.Fatalf("expected a non-admin member to be denied reading the platform embedder setting, got %d", getRecorder.Code)
	}
}
