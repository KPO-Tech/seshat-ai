package automation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// TelegramSendMessageNode is the "telegram_send_message" node type: sends a
// message through the job owner's connected Telegram bot. Deliberately not
// part of the generic pkg/dataflow SDK - same reasoning as GmailPollNode,
// it needs a seshat-ai connector account. Uses the static-credential
// resolver (StaticSecretResolver), not ConnectorTokenResolver - Telegram
// bots authenticate with a single bot token, no OAuth2 flow, no refresh.
//
// The bot token is part of the request URL itself, not a header - verified
// against Telegram's Bot API docs before writing this. No shared package
// telegram package exists yet, so this hand-rolls the one request it needs
// directly. Reads job context (owner_id, organization_id) from its own
// input, same constraint as GmailSendNode - see its doc comment.
type TelegramSendMessageNode struct {
	secrets StaticSecretResolver
	// httpClient/baseURL are injectable for tests, same pattern as
	// GmailPollNode's newGmailClient field.
	httpClient *http.Client
	baseURL    string
}

func NewTelegramSendMessageNode(secrets StaticSecretResolver) *TelegramSendMessageNode {
	return &TelegramSendMessageNode{secrets: secrets, httpClient: http.DefaultClient, baseURL: "https://api.telegram.org"}
}

func (n *TelegramSendMessageNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "telegram_send_message", Name: "Telegram: Send Message", Category: "Messaging",
		Description: "Sends a message through the job owner's connected Telegram bot, emitting one item with the sent message's id (field \"message_id\"). " +
			"Requires a connected Telegram bot (a bot token from @BotFather, connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: chatId (string, required) - the target chat's numeric id or @username, the bot must already be a member/have been messaged first. text (string, required)."}
}

func (n *TelegramSendMessageNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "chatId", "") == "" {
		return errors.New("chatId is required")
	}
	if dataflow.StringParam(params, "text", "") == "" {
		return errors.New("text is required")
	}
	return nil
}

func (n *TelegramSendMessageNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("telegram_send_message: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("telegram_send_message: owner_id/organization_id are required in input")
	}

	secret, ok, err := n.secrets.StaticSecretForUser(ctx, organizationID, "telegram", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve telegram secret: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("telegram_send_message: job owner has no connected Telegram bot")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	chatID := dataflow.StringParam(params, "chatId", "")
	text := dataflow.StringParam(params, "text", "")

	reqBody := map[string]any{"chat_id": chatID, "text": text}
	encoded, err := json.Marshal(reqBody)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("encode telegram request: %w", err)
	}

	requestURL := fmt.Sprintf("%s/bot%s/sendMessage", n.baseURL, secret)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(encoded))
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build telegram request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("telegram send message: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("telegram send message: status %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Result struct {
			MessageID int `json:"message_id"`
		} `json:"result"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return dataflow.Output{}, fmt.Errorf("decode telegram response: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"message_id": result.Result.MessageID}}), nil
}
