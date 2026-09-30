package automation

import (
	"context"
	"errors"
	"fmt"

	"golang.org/x/oauth2"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
	coremsgraph "github.com/KPO-Tech/seshat/pkg/msgraph"
)

// TeamsSendNode is the "teams_send_message" node type: sends a message into
// an existing Teams chat the job owner is a member of, through their
// connected Teams account. Deliberately not part of the generic pkg/dataflow
// SDK — same reasoning as GmailPollNode, it needs a seshat-ai connector
// account.
//
// Reads job context (job_id, owner_id, organization_id) from its own input,
// same constraint as GmailSendNode - see its doc comment.
type TeamsSendNode struct {
	tokens ConnectorTokenResolver
	// newGraphClient defaults the same way OutlookSendNode's does; tests
	// override it.
	newGraphClient func(ctx context.Context, ts oauth2.TokenSource) *coremsgraph.Client
}

func NewTeamsSendNode(tokens ConnectorTokenResolver) *TeamsSendNode {
	return &TeamsSendNode{tokens: tokens, newGraphClient: func(ctx context.Context, ts oauth2.TokenSource) *coremsgraph.Client {
		return coremsgraph.New(oauth2.NewClient(ctx, ts))
	}}
}

func (n *TeamsSendNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "teams_send_message", Name: "Teams: Send Message", Category: "Messaging",
		Description: "Sends a message into an existing Teams chat the job owner is a member of, through their connected Teams account, emitting one item on success (field \"sent\": true). " +
			"Requires a connected Teams account (connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: chatId (string, required) — the target chat's id, e.g. from a prior \"list chats\" step. body (string, required)."}
}

func (n *TeamsSendNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "chatId", "") == "" {
		return errors.New("chatId is required")
	}
	if dataflow.StringParam(params, "body", "") == "" {
		return errors.New("body is required")
	}
	return nil
}

func (n *TeamsSendNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("teams_send_message: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("teams_send_message: owner_id/organization_id are required in input")
	}

	token, ok, err := n.tokens.AccessTokenForUser(ctx, organizationID, "teams", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve teams access token: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("teams_send_message: job owner has no connected Teams account")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	chatID := dataflow.StringParam(params, "chatId", "")
	body := dataflow.StringParam(params, "body", "")

	client := n.newGraphClient(ctx, oauth2.StaticTokenSource(&oauth2.Token{AccessToken: token}))
	if err := client.SendChatMessage(ctx, chatID, body); err != nil {
		return dataflow.Output{}, fmt.Errorf("send teams message: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"sent": true}}), nil
}
