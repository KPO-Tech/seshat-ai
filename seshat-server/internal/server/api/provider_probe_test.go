package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProbeProviderCredentialRejectsEmptyAPIKey(t *testing.T) {
	result := probeProviderCredential(context.Background(), "openai", "https://example.com", "")
	if result.Status != providerProbeUnknown {
		t.Fatalf("expected unknown for an empty API key, got %+v", result)
	}
}

func TestProbeProviderCredentialReportsUnsupportedForNonAPIKeyProviders(t *testing.T) {
	for _, provider := range []string{"ollama", "codex", "foundry", "bedrock", "vertex", "workers-ai"} {
		result := probeProviderCredential(context.Background(), provider, "https://example.com", "some-key")
		if result.Status != providerProbeUnsupported {
			t.Fatalf("expected unsupported for %q, got %+v", provider, result)
		}
	}
}

func TestProbeProviderCredentialReportsUnknownOnUnreachableEndpoint(t *testing.T) {
	result := probeProviderCredential(context.Background(), "openai", "http://127.0.0.1:1", "some-key")
	if result.Status != providerProbeUnknown {
		t.Fatalf("expected unknown for an unreachable endpoint, got %+v", result)
	}
}

// fakeProviderServer serves /v1/models or /models, accepting only the exact
// header value wantHeader:wantValue and returning 401 otherwise - the same
// real-request/real-response classification pattern as
// mcpregistry.ProbeMCPServer's own test harness.
func fakeProviderServer(t *testing.T, path, wantHeader, wantValue string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != path {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if r.Header.Get(wantHeader) != wantValue {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)
	return server
}

func TestProbeProviderCredentialGenericBearerConvention(t *testing.T) {
	server := fakeProviderServer(t, "/v1/models", "Authorization", "Bearer good-key")

	if got := probeProviderCredential(context.Background(), "openai", server.URL, "good-key"); got.Status != providerProbeOK {
		t.Fatalf("expected ok for a valid key, got %+v", got)
	}
	if got := probeProviderCredential(context.Background(), "openai", server.URL, "bad-key"); got.Status != providerProbeInvalidCredential {
		t.Fatalf("expected invalid_credential for a wrong key, got %+v", got)
	}
	// An unrecognized/future provider name falls back to the same convention.
	if got := probeProviderCredential(context.Background(), "some-new-provider", server.URL, "good-key"); got.Status != providerProbeOK {
		t.Fatalf("expected the default fallback to also succeed with a valid key, got %+v", got)
	}
}

func TestProbeProviderCredentialAnthropicHeaders(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" || r.Header.Get("anthropic-version") != "2023-06-01" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if r.Header.Get("x-api-key") != "good-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)

	if got := probeProviderCredential(context.Background(), "anthropic", server.URL, "good-key"); got.Status != providerProbeOK {
		t.Fatalf("expected ok, got %+v", got)
	}
	if got := probeProviderCredential(context.Background(), "anthropic", server.URL, "bad-key"); got.Status != providerProbeInvalidCredential {
		t.Fatalf("expected invalid_credential, got %+v", got)
	}
}

func TestProbeProviderCredentialZAiUsesXAPIKeyOnModelsPath(t *testing.T) {
	server := fakeProviderServer(t, "/models", "x-api-key", "good-key")
	if got := probeProviderCredential(context.Background(), "z-ai", server.URL, "good-key"); got.Status != providerProbeOK {
		t.Fatalf("expected ok, got %+v", got)
	}
	if got := probeProviderCredential(context.Background(), "z-ai", server.URL, "bad-key"); got.Status != providerProbeInvalidCredential {
		t.Fatalf("expected invalid_credential, got %+v", got)
	}
}

func TestProbeProviderCredentialGeminiUsesBearerOnModelsPath(t *testing.T) {
	server := fakeProviderServer(t, "/models", "Authorization", "Bearer good-key")
	if got := probeProviderCredential(context.Background(), "gemini", server.URL, "good-key"); got.Status != providerProbeOK {
		t.Fatalf("expected ok, got %+v", got)
	}
}

func TestProviderSettingsProbeEndpointRequiresAuth(t *testing.T) {
	handler, _, _, _, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"provider": "openai", "api_key": "x"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/provider-settings/probe", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
	}
}

func TestProviderSettingsProbeEndpointReturnsClassificationNotHTTPError(t *testing.T) {
	handler, _, token, _, _ := newTestServerRouter(t)

	body, _ := json.Marshal(map[string]any{"provider": "ollama", "api_key": "x"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/provider-settings/probe", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	// Even an "unsupported" classification is still a normal 200 - the
	// caller reads the body's status field, never an HTTP error code, for
	// the same reason handleProviderSettingsDetectModels never errors out
	// on an unreachable Ollama either.
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var result struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if result.Status != "unsupported" {
		t.Fatalf("expected status=unsupported for ollama, got %q", result.Status)
	}
}
