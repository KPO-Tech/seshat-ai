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

// MailgunSendEmailNode is the "mailgun_send_email" node type: sends an
// email through the job owner's connected Mailgun account. Deliberately
// not part of the generic pkg/dataflow SDK - same reasoning as
// GmailPollNode, it needs a seshat-ai connector account. Uses the static-
// credential resolver (StaticSecretResolver), not ConnectorTokenResolver -
// Mailgun authenticates with a single API key, no OAuth2 flow, no refresh.
//
// Two quirks verified against Mailgun's docs before writing this, not
// assumed: (1) authentication is HTTP Basic with the literal username
// "api" and the API key as password - not a Bearer token like SendGrid/
// Postmark. (2) the domain a message sends from is part of the request
// path, not the credential - domain isn't secret (it's the org's own
// verified sending domain, same visibility as a "from" address), so it's a
// node parameter, not folded into the connected account's one secret
// field. No shared mailgun package exists yet, so this hand-rolls the
// one request it needs directly. Reads job context (owner_id,
// organization_id) from its own input, same constraint as GmailSendNode -
// see its doc comment.
type MailgunSendEmailNode struct {
	secrets StaticSecretResolver
	// httpClient/baseURL are injectable for tests, same pattern as
	// GmailPollNode's newGmailClient field.
	httpClient *http.Client
	baseURL    string
}

func NewMailgunSendEmailNode(secrets StaticSecretResolver) *MailgunSendEmailNode {
	return &MailgunSendEmailNode{secrets: secrets, httpClient: http.DefaultClient, baseURL: "https://api.mailgun.net"}
}

func (n *MailgunSendEmailNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "mailgun_send_email", Name: "Mailgun: Send Email", Category: "Messaging",
		Description: "Sends an email through the job owner's connected Mailgun account, emitting one item with the sent message's id (field \"message_id\"). " +
			"Requires a connected Mailgun account (an API key, connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: domain (string, required) - the verified sending domain, e.g. \"mg.example.com\". from (string, required). to (string, required). subject (string, required). body (string, required) - plain text."}
}

func (n *MailgunSendEmailNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "domain", "") == "" {
		return errors.New("domain is required")
	}
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

func (n *MailgunSendEmailNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("mailgun_send_email: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("mailgun_send_email: owner_id/organization_id are required in input")
	}

	secret, ok, err := n.secrets.StaticSecretForUser(ctx, organizationID, "mailgun", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve mailgun secret: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("mailgun_send_email: job owner has no connected Mailgun account")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	domain := dataflow.StringParam(params, "domain", "")
	from := dataflow.StringParam(params, "from", "")
	to := dataflow.StringParam(params, "to", "")
	subject := dataflow.StringParam(params, "subject", "")
	body := dataflow.StringParam(params, "body", "")

	form := url.Values{"from": {from}, "to": {to}, "subject": {subject}, "text": {body}}

	requestURL := fmt.Sprintf("%s/v3/%s/messages", n.baseURL, url.PathEscape(domain))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, strings.NewReader(form.Encode()))
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build mailgun request: %w", err)
	}
	req.SetBasicAuth("api", secret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("mailgun send email: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("mailgun send email: status %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return dataflow.Output{}, fmt.Errorf("decode mailgun response: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"message_id": result.ID}}), nil
}
