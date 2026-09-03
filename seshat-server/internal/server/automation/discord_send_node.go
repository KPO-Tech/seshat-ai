package automation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// DiscordSendMessageNode is the "discord_send_message" node type: sends a
// message through the job owner's connected Discord bot. Deliberately not
// part of the generic pkg/dataflow SDK - same reasoning as GmailPollNode,
// it needs a seshat-ai connector account. Uses the static-credential
// resolver (StaticSecretResolver), not ConnectorTokenResolver - a Discord
// bot authenticates with a single bot token, no OAuth2 flow, no refresh.
//
// A bot token (Authorization: "Bot <token>"), not a webhook URL, is the
// connected secret - a bot's token works across every channel it's been
// added to, matching this batch's "one connected account, reusable across
// the node's params" shape, unlike a webhook URL which is scoped to one
// channel. Verified against Discord's API docs before writing this: POST
// /api/v10/channels/{channel.id}/messages, Authorization: Bot <token>. No
// seshat-core/discord package exists yet, so this hand-rolls the one
// request it needs directly. Reads job context (owner_id,
// organization_id) from its own input, same constraint as GmailSendNode -
// see its doc comment.
type DiscordSendMessageNode struct {
	secrets StaticSecretResolver
	// httpClient/baseURL are injectable for tests, same pattern as
	// GmailPollNode's newGmailClient field.
	httpClient *http.Client
	baseURL    string
}

func NewDiscordSendMessageNode(secrets StaticSecretResolver) *DiscordSendMessageNode {
	return &DiscordSendMessageNode{secrets: secrets, httpClient: http.DefaultClient, baseURL: "https://discord.com/api/v10"}
}

func (n *DiscordSendMessageNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "discord_send_message", Name: "Discord: Send Message", Category: "Messaging",
		Description: "Sends a message through the job owner's connected Discord bot, emitting one item with the sent message's id (field \"message_id\"). " +
			"Requires a connected Discord bot (a bot token from the Discord Developer Portal, connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: channelId (string, required) - the target channel's id, the bot must already have Send Messages permission there. content (string, required)."}
}

func (n *DiscordSendMessageNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "channelId", "") == "" {
		return errors.New("channelId is required")
	}
	if dataflow.StringParam(params, "content", "") == "" {
		return errors.New("content is required")
	}
	return nil
}

func (n *DiscordSendMessageNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("discord_send_message: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("discord_send_message: owner_id/organization_id are required in input")
	}

	secret, ok, err := n.secrets.StaticSecretForUser(ctx, organizationID, "discord", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve discord secret: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("discord_send_message: job owner has no connected Discord bot")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	channelID := dataflow.StringParam(params, "channelId", "")
	content := dataflow.StringParam(params, "content", "")

	reqBody := map[string]any{"content": content}
	encoded, err := json.Marshal(reqBody)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("encode discord request: %w", err)
	}

	requestURL := fmt.Sprintf("%s/channels/%s/messages", n.baseURL, url.PathEscape(channelID))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(encoded))
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build discord request: %w", err)
	}
	req.Header.Set("Authorization", "Bot "+secret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("discord send message: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("discord send message: status %d: %s", resp.StatusCode, string(respBody))
	}

	var message struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(respBody, &message); err != nil {
		return dataflow.Output{}, fmt.Errorf("decode discord response: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"message_id": message.ID}}), nil
}
