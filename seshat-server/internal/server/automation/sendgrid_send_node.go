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

// SendGridSendEmailNode is the "sendgrid_send_email" node type: sends an
// email through the job owner's connected SendGrid account. Deliberately
// not part of the generic pkg/dataflow SDK - same reasoning as
// GmailPollNode, it needs a seshat-ai connector account. Uses the static-
// credential resolver (StaticSecretResolver), not ConnectorTokenResolver -
// SendGrid authenticates with a single API key, no OAuth2 flow, no
// refresh.
//
// No shared sendgrid package exists yet, so this hand-rolls the one
// request it needs directly - the first representative SendGrid action,
// not exhaustive API coverage. Reads job context (owner_id,
// organization_id) from its own input, same constraint as GmailSendNode -
// see its doc comment.
type SendGridSendEmailNode struct {
	secrets StaticSecretResolver
	// httpClient/baseURL are injectable for tests, same pattern as
	// GmailPollNode's newGmailClient field.
	httpClient *http.Client
	baseURL    string
}

func NewSendGridSendEmailNode(secrets StaticSecretResolver) *SendGridSendEmailNode {
	return &SendGridSendEmailNode{secrets: secrets, httpClient: http.DefaultClient, baseURL: "https://api.sendgrid.com"}
}

func (n *SendGridSendEmailNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "sendgrid_send_email", Name: "SendGrid: Send Email", Category: "Messaging",
		Description: "Sends an email through the job owner's connected SendGrid account. Emits no fields on success beyond the input passthrough - SendGrid's send endpoint returns no message id in its body, only a 202 status. " +
			"Requires a connected SendGrid account (an API key, connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: from (string, required) - sender email address. to (string, required) - recipient email address. subject (string, required). body (string, required) - plain text."}
}

func (n *SendGridSendEmailNode) ValidateParameters(params map[string]any) error {
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

func (n *SendGridSendEmailNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("sendgrid_send_email: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("sendgrid_send_email: owner_id/organization_id are required in input")
	}

	secret, ok, err := n.secrets.StaticSecretForUser(ctx, organizationID, "sendgrid", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve sendgrid secret: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("sendgrid_send_email: job owner has no connected SendGrid account")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	from := dataflow.StringParam(params, "from", "")
	to := dataflow.StringParam(params, "to", "")
	subject := dataflow.StringParam(params, "subject", "")
	body := dataflow.StringParam(params, "body", "")

	reqBody := map[string]any{
		"personalizations": []any{map[string]any{"to": []any{map[string]any{"email": to}}}},
		"from":             map[string]any{"email": from},
		"subject":          subject,
		"content":          []any{map[string]any{"type": "text/plain", "value": body}},
	}
	encoded, err := json.Marshal(reqBody)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("encode sendgrid request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.baseURL+"/v3/mail/send", bytes.NewReader(encoded))
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build sendgrid request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+secret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("sendgrid send email: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("sendgrid send email: status %d: %s", resp.StatusCode, string(respBody))
	}

	return dataflow.Main([]dataflow.Item{{"sent": true}}), nil
}
