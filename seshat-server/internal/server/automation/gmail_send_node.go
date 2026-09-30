package automation

import (
	"context"
	"errors"
	"fmt"

	"golang.org/x/oauth2"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
	coregmail "github.com/KPO-Tech/seshat/pkg/gmail"
)

// stringSliceParam reads a []string out of a JSON-decoded parameters map,
// where a JSON array unmarshal into map[string]any always lands as
// []any of individual string elements — non-string entries are skipped
// rather than erroring, same lenient posture as dataflow.StringParam's
// fallback-on-wrong-type behavior.
func stringSliceParam(params map[string]any, name string) []string {
	raw, _ := params[name].([]any)
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		if s, ok := v.(string); ok && s != "" {
			out = append(out, s)
		}
	}
	return out
}

// GmailSendNode is the "gmail_send_email" node type: sends an email through
// the job owner's connected Gmail account. Deliberately not part of the
// generic pkg/dataflow SDK — same reasoning as GmailPollNode, it needs a
// seshat-ai connector account.
//
// Reads job context (job_id, owner_id, organization_id) from its own input,
// same as GmailPollNode — meaning this node needs that identity to still be
// present in the item it receives. Place it directly after the graph's
// start, or after a node/merge that preserves those fields; a node that
// builds a brand new item (e.g. http_request) does not carry them forward.
type GmailSendNode struct {
	tokens ConnectorTokenResolver
	// newGmailClient defaults to wrapping coregmail.New; tests override it,
	// same injection pattern as GmailPollNode.
	newGmailClient func(ctx context.Context, ts oauth2.TokenSource) (*coregmail.Client, error)
}

func NewGmailSendNode(tokens ConnectorTokenResolver) *GmailSendNode {
	return &GmailSendNode{tokens: tokens, newGmailClient: func(ctx context.Context, ts oauth2.TokenSource) (*coregmail.Client, error) {
		return coregmail.New(ctx, ts)
	}}
}

func (n *GmailSendNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "gmail_send_email", Name: "Gmail: Send Email", Category: "Messaging",
		Description: "Sends an email through the job owner's connected Gmail account, emitting one item with the sent message's id (field \"message_id\"). " +
			"Requires a connected Gmail account (connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: to (array of string, required). subject (string, required). body (string, required)."}
}

func (n *GmailSendNode) ValidateParameters(params map[string]any) error {
	if len(stringSliceParam(params, "to")) == 0 {
		return errors.New("to (non-empty array of recipient addresses) is required")
	}
	if dataflow.StringParam(params, "subject", "") == "" {
		return errors.New("subject is required")
	}
	if dataflow.StringParam(params, "body", "") == "" {
		return errors.New("body is required")
	}
	return nil
}

func (n *GmailSendNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("gmail_send_email: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("gmail_send_email: owner_id/organization_id are required in input")
	}

	token, ok, err := n.tokens.AccessTokenForUser(ctx, organizationID, "gmail", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve gmail access token: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("gmail_send_email: job owner has no connected Gmail account")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	to := stringSliceParam(params, "to")
	subject := dataflow.StringParam(params, "subject", "")
	body := dataflow.StringParam(params, "body", "")

	ts := oauth2.StaticTokenSource(&oauth2.Token{AccessToken: token})
	client, err := n.newGmailClient(ctx, ts)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build gmail client: %w", err)
	}

	messageID, err := client.Send(ctx, to, subject, body)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("send gmail: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"message_id": messageID}}), nil
}
