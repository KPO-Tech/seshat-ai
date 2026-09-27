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

// ZendeskCreateTicketNode is the "zendesk_create_ticket" node type: creates
// a support ticket in the job owner's connected Zendesk account.
// Deliberately not part of the generic pkg/dataflow SDK - same reasoning
// as GmailPollNode, it needs a seshat-ai connector account.
//
// No shared zendesk package exists yet, so this hand-rolls the one
// request it needs directly - the first representative Zendesk action, not
// exhaustive API coverage. Zendesk's API host is per-account (a subdomain
// registered once at the org level - see connectors.zendeskKind's doc
// comment), so this node needs both a token (ConnectorTokenResolver) and
// that subdomain (OAuthAppSubdomainResolver, an org-level lookup, not
// per-employee like every other resolver this batch uses). Reads job
// context (owner_id, organization_id) from its own input, same constraint
// as GmailSendNode - see its doc comment.
type ZendeskCreateTicketNode struct {
	tokens     ConnectorTokenResolver
	subdomains OAuthAppSubdomainResolver
	// httpClient is injectable for tests, same pattern as GmailPollNode's
	// newGmailClient field. No baseURL field here - same reasoning as
	// PipedriveCreateDealNode.
	httpClient *http.Client
}

func NewZendeskCreateTicketNode(tokens ConnectorTokenResolver, subdomains OAuthAppSubdomainResolver) *ZendeskCreateTicketNode {
	return &ZendeskCreateTicketNode{tokens: tokens, subdomains: subdomains, httpClient: http.DefaultClient}
}

func (n *ZendeskCreateTicketNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "zendesk_create_ticket", Name: "Zendesk: Create Ticket", Category: "Productivity",
		Description: "Creates a support ticket in the job owner's connected Zendesk account, emitting one item with the created ticket's id (field \"ticket_id\"). " +
			"Requires a connected Zendesk account (connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: subject (string, required). comment (string, required) - the ticket's initial description/body. requesterEmail (string, optional) - the end user this ticket is filed on behalf of; omitted, the ticket is filed as the connected account's own agent."}
}

func (n *ZendeskCreateTicketNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "subject", "") == "" {
		return errors.New("subject is required")
	}
	if dataflow.StringParam(params, "comment", "") == "" {
		return errors.New("comment is required")
	}
	return nil
}

func (n *ZendeskCreateTicketNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("zendesk_create_ticket: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("zendesk_create_ticket: owner_id/organization_id are required in input")
	}

	token, ok, err := n.tokens.AccessTokenForUser(ctx, organizationID, "zendesk", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve zendesk access token: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("zendesk_create_ticket: job owner has no connected Zendesk account")
	}
	subdomain, err := n.subdomains.OAuthAppSubdomain(ctx, organizationID, "zendesk")
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve zendesk subdomain: %w", err)
	}
	if subdomain == "" {
		return dataflow.Output{}, errors.New("zendesk_create_ticket: no zendesk oauth app (with a subdomain) is registered for this organization")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	subject := dataflow.StringParam(params, "subject", "")
	comment := dataflow.StringParam(params, "comment", "")
	requesterEmail := dataflow.StringParam(params, "requesterEmail", "")

	ticket := map[string]any{
		"subject": subject,
		"comment": map[string]any{"body": comment},
	}
	if requesterEmail != "" {
		ticket["requester"] = map[string]any{"email": requesterEmail}
	}
	reqBody := map[string]any{"ticket": ticket}
	encoded, err := json.Marshal(reqBody)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("encode zendesk request: %w", err)
	}

	requestURL := fmt.Sprintf("https://%s.zendesk.com/api/v2/tickets.json", subdomain)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(encoded))
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build zendesk request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("zendesk create ticket: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("zendesk create ticket: status %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Ticket struct {
			ID int `json:"id"`
		} `json:"ticket"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return dataflow.Output{}, fmt.Errorf("decode zendesk response: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"ticket_id": result.Ticket.ID}}), nil
}
