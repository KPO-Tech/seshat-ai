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

// HubSpotCreateContactNode is the "hubspot_create_contact" node type:
// creates a CRM contact in the job owner's connected HubSpot account.
// Deliberately not part of the generic pkg/dataflow SDK - same reasoning
// as GmailPollNode, it needs a seshat-ai connector account.
//
// No seshat-core/hubspot package exists yet, so this hand-rolls the one
// request it needs directly - the first representative HubSpot action,
// not exhaustive API coverage. Reads job context (owner_id,
// organization_id) from its own input, same constraint as GmailSendNode -
// see its doc comment.
type HubSpotCreateContactNode struct {
	tokens ConnectorTokenResolver
	// httpClient/baseURL are injectable for tests, same pattern as
	// GmailPollNode's newGmailClient field.
	httpClient *http.Client
	baseURL    string
}

func NewHubSpotCreateContactNode(tokens ConnectorTokenResolver) *HubSpotCreateContactNode {
	return &HubSpotCreateContactNode{tokens: tokens, httpClient: http.DefaultClient, baseURL: "https://api.hubapi.com"}
}

func (n *HubSpotCreateContactNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "hubspot_create_contact", Name: "HubSpot: Create Contact", Category: "Productivity",
		Description: "Creates a CRM contact in the job owner's connected HubSpot account, emitting one item with the created contact's id (field \"contact_id\"). " +
			"Requires a connected HubSpot account (connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: email (string, required). firstName (string, optional). lastName (string, optional)."}
}

func (n *HubSpotCreateContactNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "email", "") == "" {
		return errors.New("email is required")
	}
	return nil
}

func (n *HubSpotCreateContactNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("hubspot_create_contact: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("hubspot_create_contact: owner_id/organization_id are required in input")
	}

	token, ok, err := n.tokens.AccessTokenForUser(ctx, organizationID, "hubspot", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve hubspot access token: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("hubspot_create_contact: job owner has no connected HubSpot account")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	email := dataflow.StringParam(params, "email", "")
	firstName := dataflow.StringParam(params, "firstName", "")
	lastName := dataflow.StringParam(params, "lastName", "")

	properties := map[string]any{"email": email}
	if firstName != "" {
		properties["firstname"] = firstName
	}
	if lastName != "" {
		properties["lastname"] = lastName
	}
	reqBody := map[string]any{"properties": properties}
	encoded, err := json.Marshal(reqBody)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("encode hubspot request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.baseURL+"/crm/v3/objects/contacts", bytes.NewReader(encoded))
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build hubspot request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("hubspot create contact: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("hubspot create contact: status %d: %s", resp.StatusCode, string(respBody))
	}

	var contact struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(respBody, &contact); err != nil {
		return dataflow.Output{}, fmt.Errorf("decode hubspot response: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"contact_id": contact.ID}}), nil
}
