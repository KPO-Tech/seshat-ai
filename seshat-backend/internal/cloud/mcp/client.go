package cloudmcp

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// Client is a thin, stateless HTTP client for seshat-server's MCP registry
// endpoint — same convention as cloudwebsearch.Client/cloudskillregistry.Client:
// no fixed token, each call takes the caller's own session token explicitly.
type Client struct {
	serverURL  string
	httpClient *http.Client
}

func NewClient(serverURL string) *Client {
	return &Client{
		serverURL:  strings.TrimRight(strings.TrimSpace(serverURL), "/"),
		httpClient: &http.Client{Timeout: 5 * time.Second},
	}
}

// ResolveServerConfigs returns every MCP server config the organization has
// shared, with env/headers decrypted. Callers should treat any error as
// "nothing to add" and fall back to the local catalog alone — this is an
// enrichment, never a hard dependency.
func (c *Client) ResolveServerConfigs(ctx context.Context, token, organizationID string) ([]ServerConfig, error) {
	q := url.Values{"organization_id": {organizationID}}
	var result resolveResponse
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/mcp-server-configs/resolve?"+q.Encode(), token, nil, &result); err != nil {
		return nil, err
	}
	return result.MCPServerConfigs, nil
}
