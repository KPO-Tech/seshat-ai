package gmailmcp

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"google.golang.org/api/option"
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

// TestHandlerCallsListMessagesToolAgainstBridgedToken proves the core
// plumbing this package exists for: a Bearer token on an incoming MCP
// request reaches the underlying Gmail API call unchanged - simulating
// what mcpregistry.injectConnectorToken does in production. Speaks raw MCP
// Streamable HTTP JSON-RPC (initialize, then tools/call) rather than
// depending on the SDK's own MCP client, mirroring msgraphmcp's test.
func TestHandlerCallsListMessagesToolAgainstBridgedToken(t *testing.T) {
	var gotAuthHeader string
	mux := http.NewServeMux()
	mux.HandleFunc("GET /gmail/v1/users/me/profile", func(w http.ResponseWriter, r *http.Request) {
		gotAuthHeader = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"historyId":"1"}`))
	})
	mux.HandleFunc("GET /gmail/v1/users/me/messages", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"messages":[]}`))
	})
	gmailServer := httptest.NewServer(mux)
	defer gmailServer.Close()

	original := extraClientOptions
	extraClientOptions = []option.ClientOption{option.WithEndpoint(gmailServer.URL)}
	defer func() { extraClientOptions = original }()

	mcpServer := httptest.NewServer(NewHandler())
	defer mcpServer.Close()

	client := &http.Client{}
	send := func(payload map[string]any, sessionID string) (*http.Response, map[string]any) {
		body, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPost, mcpServer.URL, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json, text/event-stream")
		req.Header.Set("Authorization", "Bearer fake-gmail-token")
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
		"params": map[string]any{"name": "list_gmail_messages", "arguments": map[string]any{}},
	}, sessionID)
	if _, hasError := callResult["error"]; hasError {
		t.Fatalf("expected tools/call to succeed, got %+v", callResult)
	}
	if _, hasResult := callResult["result"]; !hasResult {
		t.Fatalf("expected a result field in the parsed response, got %+v", callResult)
	}

	if gotAuthHeader != "Bearer fake-gmail-token" {
		t.Fatalf("expected the bridged Bearer token to reach the gmail server, got %q", gotAuthHeader)
	}
}

// TestHandlerRoutesNewToolsToTheirGmailEndpoints is a lighter-weight
// companion to the test above: that one proves the Bearer-bridge plumbing in
// full (init handshake, session header, SSE-framed response parsing) for one
// tool - this one reuses the same transport helper to prove a representative
// read tool (search) and a representative mutation tool (trash) added on top
// of the original 3 all reach the right Gmail endpoint through the same
// switch, without re-proving the transport plumbing itself for all 20+ tools.
func TestHandlerRoutesNewToolsToTheirGmailEndpoints(t *testing.T) {
	var gotSearchQuery string
	var trashedID string
	mux := http.NewServeMux()
	mux.HandleFunc("GET /gmail/v1/users/me/messages", func(w http.ResponseWriter, r *http.Request) {
		gotSearchQuery = r.URL.Query().Get("q")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"messages":[]}`))
	})
	mux.HandleFunc("POST /gmail/v1/users/me/messages/m1/trash", func(w http.ResponseWriter, r *http.Request) {
		trashedID = "m1"
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"m1"}`))
	})
	gmailServer := httptest.NewServer(mux)
	defer gmailServer.Close()

	original := extraClientOptions
	extraClientOptions = []option.ClientOption{option.WithEndpoint(gmailServer.URL)}
	defer func() { extraClientOptions = original }()

	mcpServer := httptest.NewServer(NewHandler())
	defer mcpServer.Close()

	client := &http.Client{}
	send := func(payload map[string]any, sessionID string) (*http.Response, map[string]any) {
		body, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPost, mcpServer.URL, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json, text/event-stream")
		req.Header.Set("Authorization", "Bearer fake-gmail-token")
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

	_, searchResult := send(map[string]any{
		"jsonrpc": "2.0", "id": 2, "method": "tools/call",
		"params": map[string]any{"name": "search_gmail_messages", "arguments": map[string]any{"query": "is:unread"}},
	}, sessionID)
	if _, hasError := searchResult["error"]; hasError {
		t.Fatalf("expected search_gmail_messages to succeed, got %+v", searchResult)
	}
	if gotSearchQuery != "is:unread" {
		t.Fatalf("expected the query to reach Gmail's q param, got %q", gotSearchQuery)
	}

	_, trashResult := send(map[string]any{
		"jsonrpc": "2.0", "id": 3, "method": "tools/call",
		"params": map[string]any{"name": "trash_gmail_message", "arguments": map[string]any{"message_id": "m1"}},
	}, sessionID)
	if _, hasError := trashResult["error"]; hasError {
		t.Fatalf("expected trash_gmail_message to succeed, got %+v", trashResult)
	}
	if trashedID != "m1" {
		t.Fatal("expected the trash endpoint to have been called with m1")
	}
}
