package api

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/sdk"
)

func newTranscribeRequest(t *testing.T, token string) *http.Request {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, err := mw.CreateFormFile("audio", "clip.webm")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := fw.Write([]byte("fake-audio-bytes")); err != nil {
		t.Fatalf("write audio: %v", err)
	}
	mw.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/transcribe", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return req
}

func TestHandleTranscribeRequiresAuth(t *testing.T) {
	fx := newSecurityTestFixture(t)
	req := newTranscribeRequest(t, "")
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)
	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestHandleTranscribeRequiresAudioField(t *testing.T) {
	fx := newSecurityTestFixture(t)
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	mw.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/transcribe", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for a missing audio field, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestHandleTranscribeRequiresOpenAIProvider(t *testing.T) {
	fx := newSecurityTestFixture(t)
	// No provider settings configured for this user at all.
	req := newTranscribeRequest(t, fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when no OpenAI provider is configured, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestHandleTranscribeReturnsTranscript(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@settings.test", "adminpass")
	createProviderSettingWithKeyForTest(t, router, token, "openai", "My OpenAI", "sk-test-key")

	var gotAPIKey string
	app.transcribeAudio = func(ctx context.Context, apiKey string, audioData []byte) (*sdk.TranscriptionResult, error) {
		gotAPIKey = apiKey
		return &sdk.TranscriptionResult{Text: "hello from the test", Language: "en", Duration: 2.5}, nil
	}

	req := newTranscribeRequest(t, token)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.Code, resp.Body.String())
	}
	var payload map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload["text"] != "hello from the test" {
		t.Fatalf("expected the transcript text, got %+v", payload)
	}
	if gotAPIKey != "sk-test-key" {
		t.Fatalf("expected the configured OpenAI key to be used, got %q", gotAPIKey)
	}
}

func TestHandleTranscribePropagatesTranscriptionFailure(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@settings.test", "adminpass")
	createProviderSettingWithKeyForTest(t, router, token, "openai", "My OpenAI", "sk-test-key")
	app.transcribeAudio = func(ctx context.Context, apiKey string, audioData []byte) (*sdk.TranscriptionResult, error) {
		return nil, errTranscribeTest
	}

	req := newTranscribeRequest(t, token)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	if resp.Code != http.StatusBadGateway {
		t.Fatalf("expected 502 when the transcription call fails, got %d: %s", resp.Code, resp.Body.String())
	}
}

var errTranscribeTest = &transcribeTestError{"whisper unavailable"}

type transcribeTestError struct{ msg string }

func (e *transcribeTestError) Error() string { return e.msg }

// createProviderSettingWithKeyForTest mirrors createProviderSettingForTest
// but also sets an api_key, since transcription needs a real decryptable
// secret to resolve.
func createProviderSettingWithKeyForTest(t *testing.T, router http.Handler, token, provider, name, apiKey string) string {
	t.Helper()
	body, _ := json.Marshal(map[string]string{
		"provider": provider,
		"name":     name,
		"api_key":  apiKey,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create setting: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var payload map[string]any
	json.NewDecoder(rec.Body).Decode(&payload)
	return payload["id"].(string)
}
