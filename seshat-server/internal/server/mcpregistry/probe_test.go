package mcpregistry

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProbeMCPServerSucceedsWithHTTPContentType(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected a POST (real MCP handshake), got %s", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	result, err := ProbeMCPServer(context.Background(), server.URL, "", "")
	if err != nil {
		t.Fatalf("probe: %v", err)
	}
	if result.AuthMode != MCPProbeAuthNone {
		t.Fatalf("expected auth_mode none, got %+v", result)
	}
	if result.ServerType != "http" {
		t.Fatalf("expected server_type http, got %q", result.ServerType)
	}
}

func TestProbeMCPServerSucceedsWithSSEContentType(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	result, err := ProbeMCPServer(context.Background(), server.URL, "", "")
	if err != nil {
		t.Fatalf("probe: %v", err)
	}
	if result.ServerType != "sse" {
		t.Fatalf("expected server_type sse, got %q", result.ServerType)
	}
}

func TestProbeMCPServerDetectsCredentialRequiredWithWWWAuthenticate(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "Bearer good-token" {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.Header().Set("WWW-Authenticate", `Bearer realm="mcp"`)
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()

	result, err := ProbeMCPServer(context.Background(), server.URL, "", "")
	if err != nil {
		t.Fatalf("probe: %v", err)
	}
	if result.AuthMode != MCPProbeAuthCredential {
		t.Fatalf("expected auth_mode credential, got %+v", result)
	}
	if result.Detail == "" {
		t.Fatal("expected the WWW-Authenticate header to be surfaced in detail")
	}

	// Re-probing with the correct credential must succeed, confirming the
	// "test before save" flow Smart-Add relies on.
	confirmed, err := ProbeMCPServer(context.Background(), server.URL, "Authorization", "Bearer good-token")
	if err != nil {
		t.Fatalf("probe with credential: %v", err)
	}
	if confirmed.AuthMode != MCPProbeAuthNone {
		t.Fatalf("expected auth_mode none once the correct credential is supplied, got %+v", confirmed)
	}
}

func TestProbeMCPServerDetectsCredentialRequiredOn403(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer server.Close()

	result, err := ProbeMCPServer(context.Background(), server.URL, "", "")
	if err != nil {
		t.Fatalf("probe: %v", err)
	}
	if result.AuthMode != MCPProbeAuthCredential {
		t.Fatalf("expected auth_mode credential on 403, got %+v", result)
	}
}

func TestProbeMCPServerReportsUnknownOnAmbiguousStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	result, err := ProbeMCPServer(context.Background(), server.URL, "", "")
	if err != nil {
		t.Fatalf("probe: %v", err)
	}
	if result.AuthMode != MCPProbeAuthUnknown {
		t.Fatalf("expected auth_mode unknown for a 500, got %+v", result)
	}
}

func TestProbeMCPServerReportsUnknownOnTransportFailure(t *testing.T) {
	result, err := ProbeMCPServer(context.Background(), "http://this-host-does-not-exist.invalid", "", "")
	if err != nil {
		t.Fatalf("probe: %v", err)
	}
	if result.AuthMode != MCPProbeAuthUnknown {
		t.Fatalf("expected auth_mode unknown for an unreachable host, got %+v", result)
	}
	if result.Detail == "" {
		t.Fatal("expected a detail message explaining the transport failure")
	}
}
