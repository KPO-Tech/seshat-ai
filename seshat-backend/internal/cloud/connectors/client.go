package cloudconnectors

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// Client is a thin, stateless HTTP client for seshat-server's connector
// OAuth app registry endpoints - same convention as cloudsettings.Client/
// cloudmcp.Client: no fixed token, each call takes the caller's own session
// token explicitly. Backs Admin Console's own Connectors tab only - hits
// seshat-server's real connectors.Service.ListOAuthApps/RegisterOAuthApp
// directly, the exact same ones seshat-console's ConnectorsPage.tsx OAuth
// Apps modal already writes through, so a change from either place is
// immediately visible in the other.
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

func (c *Client) ListOAuthApps(ctx context.Context, token, organizationID string) ([]OAuthApp, error) {
	q := url.Values{"organization_id": {organizationID}}
	var payload struct {
		OAuthApps []OAuthApp `json:"oauth_apps"`
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/connectors/oauth-apps?"+q.Encode(), token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.OAuthApps, nil
}

type RegisterOAuthAppParams struct {
	OrganizationID string
	Kind           string
	ClientID       string
	// ClientSecret empty on an update to an already-registered app means
	// "keep the existing one" - matches connectors.RegisterOAuthAppParams'
	// own convention.
	ClientSecret string
	// Subdomain is required for kind "zendesk" only, rejected for every
	// other kind - see connectors.zendeskKind's doc comment.
	Subdomain string
}

// RegisterOAuthApp is an upsert: PUT /api/v1/connectors/oauth-apps/{kind}
// creates the app on first call, updates it in place on later calls.
func (c *Client) RegisterOAuthApp(ctx context.Context, token string, params RegisterOAuthAppParams) (*OAuthApp, error) {
	var app OAuthApp
	body := map[string]any{
		"organization_id": params.OrganizationID,
		"client_id":       params.ClientID,
		"client_secret":   params.ClientSecret,
		"subdomain":       params.Subdomain,
	}
	requestURL := c.serverURL + "/api/v1/connectors/oauth-apps/" + url.PathEscape(params.Kind)
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPut, requestURL, token, body, &app); err != nil {
		return nil, err
	}
	return &app, nil
}
