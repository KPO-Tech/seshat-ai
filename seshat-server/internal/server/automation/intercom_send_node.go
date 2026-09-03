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

// IntercomCreateContactNode is the "intercom_create_contact" node type:
// creates a contact in the job owner's connected Intercom workspace.
// Deliberately not part of the generic pkg/dataflow SDK - same reasoning
// as GmailPollNode, it needs a seshat-ai connector account.
//
// No seshat-core/intercom package exists yet, so this hand-rolls the one
// request it needs directly - the first representative Intercom action,
// not exhaustive API coverage. role defaults to "user" (an identified
// contact tied to a real end user), the more broadly useful default over
// "lead" for a generic "create contact" action. Reads job context
// (owner_id, organization_id) from its own input, same constraint as
// GmailSendNode - see its doc comment. US API host only - see
// connectors.intercomKind's doc comment for the EU/AU limitation this
// node inherits.
type IntercomCreateContactNode struct {
	tokens ConnectorTokenResolver
	// httpClient/baseURL are injectable for tests, same pattern as
	// GmailPollNode's newGmailClient field.
	httpClient *http.Client
	baseURL    string
}

func NewIntercomCreateContactNode(tokens ConnectorTokenResolver) *IntercomCreateContactNode {
	return &IntercomCreateContactNode{tokens: tokens, httpClient: http.DefaultClient, baseURL: "https://api.intercom.io"}
}

func (n *IntercomCreateContactNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "intercom_create_contact", Name: "Intercom: Create Contact", Category: "Productivity",
		Description: "Creates a contact in the job owner's connected Intercom workspace, emitting one item with the created contact's id (field \"contact_id\"). US-hosted Intercom workspaces only. " +
			"Requires a connected Intercom account (connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: email (string, required). name (string, optional)."}
}

func (n *IntercomCreateContactNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "email", "") == "" {
		return errors.New("email is required")
	}
	return nil
}

func (n *IntercomCreateContactNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("intercom_create_contact: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("intercom_create_contact: owner_id/organization_id are required in input")
	}

	token, ok, err := n.tokens.AccessTokenForUser(ctx, organizationID, "intercom", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve intercom access token: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("intercom_create_contact: job owner has no connected Intercom account")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	email := dataflow.StringParam(params, "email", "")
	name := dataflow.StringParam(params, "name", "")

	reqBody := map[string]any{"role": "user", "email": email}
	if name != "" {
		reqBody["name"] = name
	}
	encoded, err := json.Marshal(reqBody)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("encode intercom request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.baseURL+"/contacts", bytes.NewReader(encoded))
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build intercom request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("intercom create contact: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("intercom create contact: status %d: %s", resp.StatusCode, string(respBody))
	}

	var contact struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(respBody, &contact); err != nil {
		return dataflow.Output{}, fmt.Errorf("decode intercom response: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"contact_id": contact.ID}}), nil
}
