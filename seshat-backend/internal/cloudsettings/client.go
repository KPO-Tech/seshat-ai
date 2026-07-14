package cloudsettings

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloudhttp"
)

// Client is a thin, stateless HTTP client for seshat-server's provider-settings
// endpoints — same convention as cloudidentity.Client: no fixed token, each
// call takes the caller's own session token explicitly.
type Client struct {
	serverURL  string
	httpClient *http.Client
}

func NewClient(serverURL string) *Client {
	return &Client{
		serverURL:  strings.TrimRight(strings.TrimSpace(serverURL), "/"),
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// ResolveProviderSetting calls GET /api/v1/provider-settings/resolve — the
// only endpoint in this domain that returns a decrypted, usable API key.
func (c *Client) ResolveProviderSetting(ctx context.Context, token, organizationID, provider string) (*ResolvedProviderSetting, error) {
	q := url.Values{"organization_id": {organizationID}, "provider": {provider}}
	var result ResolvedProviderSetting
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/provider-settings/resolve?"+q.Encode(), token, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}
