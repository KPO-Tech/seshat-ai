package automation

import (
	"context"
	"errors"
	"fmt"

	"golang.org/x/oauth2"

	coremsgraph "github.com/EngineerProjects/seshat-ai/seshat-core/msgraph"
	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// OutlookSendNode is the "outlook_send_email" node type: sends an email
// through the job owner's connected Outlook account. Deliberately not part
// of the generic pkg/dataflow SDK — same reasoning as GmailPollNode, it
// needs a seshat-ai connector account.
//
// Reads job context (job_id, owner_id, organization_id) from its own input,
// same constraint as GmailSendNode - see its doc comment.
type OutlookSendNode struct {
	tokens ConnectorTokenResolver
	// newGraphClient defaults to building an oauth2-authenticated http.Client
	// and wrapping coremsgraph.New with it (mirrors
	// internal/server/msgraphmcp/server.go's buildGraphClient exactly); tests
	// override it, same injection pattern as GmailPollNode/GmailSendNode.
	newGraphClient func(ctx context.Context, ts oauth2.TokenSource) *coremsgraph.Client
}

func NewOutlookSendNode(tokens ConnectorTokenResolver) *OutlookSendNode {
	return &OutlookSendNode{tokens: tokens, newGraphClient: func(ctx context.Context, ts oauth2.TokenSource) *coremsgraph.Client {
		return coremsgraph.New(oauth2.NewClient(ctx, ts))
	}}
}

func (n *OutlookSendNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "outlook_send_email", Name: "Outlook: Send Email", Category: "Messaging",
		Description: "Sends an email through the job owner's connected Outlook account, emitting one item on success (field \"sent\": true). " +
			"Requires a connected Outlook account (connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: to (array of string, required). subject (string, required). body (string, required)."}
}

func (n *OutlookSendNode) ValidateParameters(params map[string]any) error {
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

func (n *OutlookSendNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("outlook_send_email: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("outlook_send_email: owner_id/organization_id are required in input")
	}

	token, ok, err := n.tokens.AccessTokenForUser(ctx, organizationID, "outlook", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve outlook access token: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("outlook_send_email: job owner has no connected Outlook account")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	to := stringSliceParam(params, "to")
	subject := dataflow.StringParam(params, "subject", "")
	body := dataflow.StringParam(params, "body", "")

	client := n.newGraphClient(ctx, oauth2.StaticTokenSource(&oauth2.Token{AccessToken: token}))
	if err := client.SendMail(ctx, to, subject, body); err != nil {
		return dataflow.Output{}, fmt.Errorf("send outlook mail: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"sent": true}}), nil
}
