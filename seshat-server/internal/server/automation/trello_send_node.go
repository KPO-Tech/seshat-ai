package automation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// TrelloCreateCardNode is the "trello_create_card" node type: creates a
// card on a list in the job owner's connected Trello account.
// Deliberately not part of the generic pkg/dataflow SDK - same reasoning
// as GmailPollNode, it needs a seshat-ai connector account. Uses the
// static-credential resolver (StaticSecretResolver), not
// ConnectorTokenResolver - Trello authenticates with an API key + token
// pair, no OAuth2 flow, no refresh.
//
// Trello is the one static kind in this batch whose auth genuinely needs
// two values (an API key and a user token, both required as query
// params, verified against Trello's REST API docs before writing this) -
// StaticSecretResolver/the connected-account schema only stores one
// secret string, so the connect form asks for "API Key:Token" and this
// node splits on the first colon rather than the backend schema growing a
// second field for one kind out of eight. No shared package trello package
// exists yet, so this hand-rolls the one request it needs directly. Reads
// job context (owner_id, organization_id) from its own input, same
// constraint as GmailSendNode - see its doc comment.
type TrelloCreateCardNode struct {
	secrets StaticSecretResolver
	// httpClient/baseURL are injectable for tests, same pattern as
	// GmailPollNode's newGmailClient field.
	httpClient *http.Client
	baseURL    string
}

func NewTrelloCreateCardNode(secrets StaticSecretResolver) *TrelloCreateCardNode {
	return &TrelloCreateCardNode{secrets: secrets, httpClient: http.DefaultClient, baseURL: "https://api.trello.com"}
}

func (n *TrelloCreateCardNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "trello_create_card", Name: "Trello: Create Card", Category: "Productivity",
		Description: "Creates a card on a list in the job owner's connected Trello account, emitting one item with the created card's id (field \"card_id\"). " +
			"Requires a connected Trello account - connect one in your organization's Connections settings using \"API Key:Token\" (colon-separated, both from https://trello.com/power-ups/admin) as the secret, since Trello's API needs both values - and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: listId (string, required) - the id of the list the card is created on. name (string, required). description (string, optional)."}
}

func (n *TrelloCreateCardNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "listId", "") == "" {
		return errors.New("listId is required")
	}
	if dataflow.StringParam(params, "name", "") == "" {
		return errors.New("name is required")
	}
	return nil
}

func (n *TrelloCreateCardNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("trello_create_card: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("trello_create_card: owner_id/organization_id are required in input")
	}

	secret, ok, err := n.secrets.StaticSecretForUser(ctx, organizationID, "trello", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve trello secret: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("trello_create_card: job owner has no connected Trello account")
	}
	apiKey, apiToken, ok := strings.Cut(secret, ":")
	if !ok || apiKey == "" || apiToken == "" {
		return dataflow.Output{}, errors.New("trello_create_card: connected Trello secret must be in \"API Key:Token\" form")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	listID := dataflow.StringParam(params, "listId", "")
	name := dataflow.StringParam(params, "name", "")
	description := dataflow.StringParam(params, "description", "")

	query := url.Values{"key": {apiKey}, "token": {apiToken}, "idList": {listID}, "name": {name}}
	if description != "" {
		query.Set("desc", description)
	}

	requestURL := n.baseURL + "/1/cards?" + query.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, nil)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build trello request: %w", err)
	}

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("trello create card: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("trello create card: status %d: %s", resp.StatusCode, string(respBody))
	}

	var card struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(respBody, &card); err != nil {
		return dataflow.Output{}, fmt.Errorf("decode trello response: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"card_id": card.ID}}), nil
}
