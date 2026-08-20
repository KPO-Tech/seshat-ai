package connectors

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"golang.org/x/oauth2"
)

// slackKind is agent_action-only - Slack has no Discover/Sync, it never
// implements knowledgeConnector, and never gets NextSyncAt set (see
// CompleteConnectorOAuth), so it's never picked up by ReapDueAccounts. It
// exists purely so an employee can connect their own Slack identity and
// have mcpregistry bridge a per-caller Bearer token into Slack's official
// hosted MCP server (https://mcp.slack.com/mcp).
const slackKind connectorKind = "slack"

// slackScopes are the standard user-token scopes for reading channel/DM
// history and sending messages - no special "mcp:connect" scope exists,
// confirmed against Slack's own OAuth docs.
var slackScopes = []string{"channels:history", "groups:history", "mpim:history", "im:history", "chat:write"}

// fetchSlackTeamAndUserID returns "team_id:user_id" as the stable
// ExternalAccountID. auth.test is always available with no extra scope,
// unlike an email/display name (users.identity needs identity.basic/
// users:read.email, a legacy scope not otherwise needed here).
func fetchSlackTeamAndUserID(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
	client := cfg.Client(ctx, token)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://slack.com/api/auth.test", nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("auth.test returned %d", resp.StatusCode)
	}
	var info struct {
		OK     bool   `json:"ok"`
		Error  string `json:"error"`
		TeamID string `json:"team_id"`
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", err
	}
	if !info.OK {
		return "", fmt.Errorf("auth.test failed: %s", info.Error)
	}
	if info.TeamID == "" || info.UserID == "" {
		return "", fmt.Errorf("no team_id/user_id in auth.test response")
	}
	return info.TeamID + ":" + info.UserID, nil
}
