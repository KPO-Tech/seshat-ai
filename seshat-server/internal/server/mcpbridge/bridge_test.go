package mcpbridge

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type fakeClient struct{ token string }

type echoTokenOutput struct {
	Token string `json:"token"`
}

func registerEchoTokenTool(server *mcp.Server, client *fakeClient) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "echo_token",
		Description: "echoes the bridged bearer token",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, echoTokenOutput, error) {
		return nil, echoTokenOutput{Token: client.token}, nil
	})
}

// TestNewHandler_RegistersToolsWhenBuildClientSucceeds proves the happy
// path: the bridged Bearer token reaches buildClient, and the tool it
// registers is actually callable end to end over real MCP Streamable HTTP
// JSON-RPC.
func TestNewHandler_RegistersToolsWhenBuildClientSucceeds(t *testing.T) {
	var gotToken string
	handler := NewHandler("test-provider", func(ctx context.Context, token string) (*fakeClient, error) {
		gotToken = token
		return &fakeClient{token: token}, nil
	}, registerEchoTokenTool)

	server := httptest.NewServer(handler)
	defer server.Close()

	sessionID := initSession(t, server.URL, "Bearer test-token")
	callTool(t, server.URL, sessionID, "Bearer test-token", "echo_token")

	if gotToken != "test-token" {
		t.Fatalf("expected buildClient to receive the stripped bearer token, got %q", gotToken)
	}
}

// TestNewHandler_FallsBackToNoToolsWhenBuildClientFails proves the
// documented degrade-not-fail behavior: a buildClient error still lets the
// MCP handshake succeed, just with no tools registered - registerTools
// must never be called in that case.
func TestNewHandler_FallsBackToNoToolsWhenBuildClientFails(t *testing.T) {
	handler := NewHandler("test-provider", func(ctx context.Context, token string) (*fakeClient, error) {
		return nil, errors.New("invalid token")
	}, func(server *mcp.Server, client *fakeClient) {
		t.Fatal("registerTools must not be called when buildClient fails")
	})

	server := httptest.NewServer(handler)
	defer server.Close()

	sessionID := initSession(t, server.URL, "Bearer bad-token")
	result := callToolRaw(t, server.URL, sessionID, "Bearer bad-token", "echo_token")
	if _, hasError := result["error"]; !hasError {
		t.Fatalf("expected calling a never-registered tool to fail, got %+v", result)
	}
}

func initSession(t *testing.T, url, authHeader string) string {
	t.Helper()
	resp, _ := send(t, url, "", authHeader, map[string]any{
		"jsonrpc": "2.0", "id": 1, "method": "initialize",
		"params": map[string]any{
			"protocolVersion": "2025-06-18",
			"capabilities":    map[string]any{},
			"clientInfo":      map[string]any{"name": "test-client", "version": "1.0.0"},
		},
	})
	sessionID := resp.Header.Get("Mcp-Session-Id")
	if sessionID == "" {
		t.Fatal("expected an Mcp-Session-Id header from initialize")
	}
	_, _ = send(t, url, sessionID, authHeader, map[string]any{"jsonrpc": "2.0", "method": "notifications/initialized"})
	return sessionID
}

func callTool(t *testing.T, url, sessionID, authHeader, name string) map[string]any {
	t.Helper()
	result := callToolRaw(t, url, sessionID, authHeader, name)
	if _, hasError := result["error"]; hasError {
		t.Fatalf("expected tools/call %q to succeed, got %+v", name, result)
	}
	return result
}

func callToolRaw(t *testing.T, url, sessionID, authHeader, name string) map[string]any {
	t.Helper()
	_, out := send(t, url, sessionID, authHeader, map[string]any{
		"jsonrpc": "2.0", "id": 2, "method": "tools/call",
		"params": map[string]any{"name": name, "arguments": map[string]any{}},
	})
	return out
}

func send(t *testing.T, url, sessionID, authHeader string, payload map[string]any) (*http.Response, map[string]any) {
	t.Helper()
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("Authorization", authHeader)
	if sessionID != "" {
		req.Header.Set("Mcp-Session-Id", sessionID)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	rawBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	return resp, parseMCPResponseBody(rawBody)
}

// parseMCPResponseBody handles both the plain-JSON and the
// text/event-stream ("event: message\ndata: {...}\n\n") response shapes
// the Streamable HTTP transport can return - a notification (no body at
// all, e.g. after "notifications/initialized") decodes to an empty map.
func parseMCPResponseBody(body []byte) map[string]any {
	out := map[string]any{}
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 {
		return out
	}
	if trimmed[0] == '{' {
		_ = json.Unmarshal(trimmed, &out)
		return out
	}
	for _, line := range bytes.Split(trimmed, []byte("\n")) {
		if data, ok := bytes.CutPrefix(line, []byte("data: ")); ok {
			_ = json.Unmarshal(data, &out)
			return out
		}
	}
	return out
}
