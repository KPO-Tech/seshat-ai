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

// PostmarkSendEmailNode is the "postmark_send_email" node type: sends an
// email through the job owner's connected Postmark account. Deliberately
// not part of the generic pkg/dataflow SDK - same reasoning as
// GmailPollNode, it needs a seshat-ai connector account. Uses the static-
// credential resolver (StaticSecretResolver), not ConnectorTokenResolver -
// Postmark authenticates with a single server token, no OAuth2 flow, no
// refresh.
//
// Verified against Postmark's docs before writing this, not assumed: the
// auth header is "X-Postmark-Server-Token" (not a Bearer Authorization
// header like SendGrid). No seshat-core/postmark package exists yet, so
// this hand-rolls the one request it needs directly. Reads job context
// (owner_id, organization_id) from its own input, same constraint as
// GmailSendNode - see its doc comment.
type PostmarkSendEmailNode struct {
	secrets StaticSecretResolver
	// httpClient/baseURL are injectable for tests, same pattern as
	// GmailPollNode's newGmailClient field.
	httpClient *http.Client
	baseURL    string
}

func NewPostmarkSendEmailNode(secrets StaticSecretResolver) *PostmarkSendEmailNode {
	return &PostmarkSendEmailNode{secrets: secrets, httpClient: http.DefaultClient, baseURL: "https://api.postmarkapp.com"}
}

func (n *PostmarkSendEmailNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "postmark_send_email", Name: "Postmark: Send Email", Category: "Messaging",
		Description: "Sends an email through the job owner's connected Postmark account, emitting one item with the sent message's id (field \"message_id\"). " +
			"Requires a connected Postmark account (a server token, connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: from (string, required) - must be a Postmark-verified sender signature. to (string, required). subject (string, required). body (string, required) - plain text."}
}

func (n *PostmarkSendEmailNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "from", "") == "" {
		return errors.New("from is required")
	}
	if dataflow.StringParam(params, "to", "") == "" {
		return errors.New("to is required")
	}
	if dataflow.StringParam(params, "subject", "") == "" {
		return errors.New("subject is required")
	}
	if dataflow.StringParam(params, "body", "") == "" {
		return errors.New("body is required")
	}
	return nil
}

func (n *PostmarkSendEmailNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("postmark_send_email: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("postmark_send_email: owner_id/organization_id are required in input")
	}

	secret, ok, err := n.secrets.StaticSecretForUser(ctx, organizationID, "postmark", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve postmark secret: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("postmark_send_email: job owner has no connected Postmark account")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	from := dataflow.StringParam(params, "from", "")
	to := dataflow.StringParam(params, "to", "")
	subject := dataflow.StringParam(params, "subject", "")
	body := dataflow.StringParam(params, "body", "")

	reqBody := map[string]any{"From": from, "To": to, "Subject": subject, "TextBody": body}
	encoded, err := json.Marshal(reqBody)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("encode postmark request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.baseURL+"/email", bytes.NewReader(encoded))
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build postmark request: %w", err)
	}
	req.Header.Set("X-Postmark-Server-Token", secret)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("postmark send email: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("postmark send email: status %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		MessageID string `json:"MessageID"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return dataflow.Output{}, fmt.Errorf("decode postmark response: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"message_id": result.MessageID}}), nil
}
