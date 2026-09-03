package connectors

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"golang.org/x/oauth2"
)

// notionKind is agent_action-only - like slack/outlook/teams/gmail, it
// exists purely so an employee can connect their own Notion identity for a
// dataflow node (see automation.NotionCreatePageNode) to act as, not as an
// admin-run Discover/Sync source.
const notionKind connectorKind = "notion"

// notionScopes stays nil deliberately, not an oversight: Notion's OAuth
// doesn't take a request-time "scope" parameter the way Google/Microsoft/
// Slack do - what an integration can read/write is configured on the
// integration itself in Notion's own developer dashboard (its
// "capabilities"), confirmed against Notion's own OAuth docs. A nil/empty
// oauth2.Config.Scopes produces no "scope" query param at all (not a
// malformed empty one - verified in golang.org/x/oauth2's AuthCodeURL).
var notionScopes []string

// fetchNotionIdentity returns the connected workspace's bot user id as the
// stable ExternalAccountID - GET /v1/users/me is always available to any
// integration token with no extra capability required, unlike a human-
// readable name/email which Notion doesn't guarantee is present.
func fetchNotionIdentity(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
	client := cfg.Client(ctx, token)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.notion.com/v1/users/me", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Notion-Version", "2022-06-28")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("users/me returned %d", resp.StatusCode)
	}
	var info struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", err
	}
	if info.ID == "" {
		return "", fmt.Errorf("no id in users/me response")
	}
	return info.ID, nil
}
