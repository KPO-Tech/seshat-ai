package msgraphmcp

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	coremsgraph "github.com/EngineerProjects/seshat-ai/seshat-core/msgraph"
)

// parseMCPResponseBody handles both the plain-JSON and the
// text/event-stream ("event: message\ndata: {...}\n\n") response shapes
// the Streamable HTTP transport can return - found while writing
// mcpbridge's own tests: a naive json.Unmarshal on an SSE-framed body
// silently decodes to an empty map with no error, which had been masking
// whether these tests were ever actually inspecting a real response.
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

// TestOutlookHandlerCallsListMessagesToolAgainstBridgedToken proves the
// core plumbing this package exists for: a Bearer token on an incoming MCP
// request reaches the underlying Graph call unchanged - simulating what
// mcpregistry.injectConnectorToken does in production. Speaks raw MCP
// Streamable HTTP JSON-RPC (initialize, then tools/call) rather than
// depending on the SDK's own MCP client, keeping this test focused on this
// package's own wiring, not the go-sdk's transport implementation.
func TestOutlookHandlerCallsListMessagesToolAgainstBridgedToken(t *testing.T) {
	var gotAuthHeader string
	graph := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuthHeader = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"value":[]}`))
	}))
	defer graph.Close()
	restore := coremsgraph.SetBaseURLForTesting(graph.URL)
	defer restore()

	mcpServer := httptest.NewServer(NewOutlookHandler())
	defer mcpServer.Close()

	client := &http.Client{}
	send := func(payload map[string]any, sessionID string) (*http.Response, map[string]any) {
		body, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPost, mcpServer.URL, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json, text/event-stream")
		req.Header.Set("Authorization", "Bearer fake-graph-token")
		if sessionID != "" {
			req.Header.Set("Mcp-Session-Id", sessionID)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		rawBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return resp, parseMCPResponseBody(rawBody)
	}

	initResp, _ := send(map[string]any{
		"jsonrpc": "2.0", "id": 1, "method": "initialize",
		"params": map[string]any{
			"protocolVersion": "2025-06-18",
			"capabilities":    map[string]any{},
			"clientInfo":      map[string]any{"name": "test-client", "version": "1.0.0"},
		},
	}, "")
	sessionID := initResp.Header.Get("Mcp-Session-Id")
	if sessionID == "" {
		t.Fatal("expected an Mcp-Session-Id header from initialize")
	}

	_, _ = send(map[string]any{"jsonrpc": "2.0", "method": "notifications/initialized"}, sessionID)

	_, callResult := send(map[string]any{
		"jsonrpc": "2.0", "id": 2, "method": "tools/call",
		"params": map[string]any{"name": "list_outlook_messages", "arguments": map[string]any{}},
	}, sessionID)
	if _, hasError := callResult["error"]; hasError {
		t.Fatalf("expected tools/call to succeed, got %+v", callResult)
	}
	if _, hasResult := callResult["result"]; !hasResult {
		t.Fatalf("expected a result field in the parsed response, got %+v", callResult)
	}

	if gotAuthHeader != "Bearer fake-graph-token" {
		t.Fatalf("expected the bridged Bearer token to reach the graph server, got %q", gotAuthHeader)
	}
}
