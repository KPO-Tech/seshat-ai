// Package mcpbridge is the shared self-hosted MCP server construction used
// by every "we host our own bridge to an external service instead of
// depending on a third-party MCP server" connector (msgraphmcp, gmailmcp,
// and future ones - Outlook/Teams/Gmail were the first three, one file
// each repeating the same MCP transport/session wiring almost verbatim
// before this package existed). Each concrete package still owns its own
// provider-client construction and tool registration; this package only
// owns the repeated part.
//
// Auth model: a MCPServerConfig row with connector_kind set gets a
// per-caller "Authorization: Bearer <token>" header injected by
// mcpregistry.injectConnectorToken before every call reaches a handler
// built here. That token is a real provider access token (resolved and
// refreshed by connectors.Service.AccessTokenForUser just before
// injection), not a seshat session token - handlers built here have no
// seshat-side auth of their own, mirroring the trust model of any
// third-party hosted MCP server (like Slack's), which also authenticates
// purely by the bearer token it's handed.
package mcpbridge

import (
	"context"
	"net/http"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const serverVersion = "1.0.0"

// NewHandler builds a self-hosted MCP server (Streamable HTTP transport)
// for one external provider. On every request, it extracts the bridged
// Bearer token and calls buildClient to construct a fresh, request-scoped
// client, then calls registerTools once to attach that provider's tools to
// a new *mcp.Server bound to that client.
//
// buildClient may return an error (e.g. a malformed/missing token, or a
// provider SDK that validates credentials at construction time) - in that
// case the returned server still completes the MCP initialize handshake
// with zero tools registered, so the connection succeeds and the real
// error surfaces on the first actual tool call instead of failing the
// transport outright.
func NewHandler[C any](name string, buildClient func(ctx context.Context, bearerToken string) (C, error), registerTools func(*mcp.Server, C)) http.Handler {
	return mcp.NewStreamableHTTPHandler(func(r *http.Request) *mcp.Server {
		server := mcp.NewServer(&mcp.Implementation{Name: name, Version: serverVersion}, nil)
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		client, err := buildClient(r.Context(), token)
		if err != nil {
			return server
		}
		registerTools(server, client)
		return server
	}, nil)
}
