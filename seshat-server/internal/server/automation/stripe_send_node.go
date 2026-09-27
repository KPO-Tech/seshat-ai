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

// StripeCreateCustomerNode is the "stripe_create_customer" node type:
// creates a customer in the job owner's connected Stripe account.
// Deliberately not part of the generic pkg/dataflow SDK - needs a
// seshat-ai connector account. Uses the new static-credential resolver
// (StaticSecretResolver), not ConnectorTokenResolver - Stripe authenticates
// with a single secret key, no OAuth2 flow, no refresh.
//
// No shared stripe package exists yet, so this hand-rolls the one
// request it needs directly - the first representative Stripe action, not
// exhaustive API coverage. Stripe's API is form-encoded
// (application/x-www-form-urlencoded), NOT JSON - do not "fix" this to a
// JSON body later, it would break against Stripe's real API. Reads job
// context (owner_id, organization_id) from its own input, same constraint
// as GmailSendNode - see its doc comment.
type StripeCreateCustomerNode struct {
	secrets StaticSecretResolver
	// httpClient/baseURL are injectable for tests, same pattern as
	// GmailPollNode's newGmailClient field.
	httpClient *http.Client
	baseURL    string
}

func NewStripeCreateCustomerNode(secrets StaticSecretResolver) *StripeCreateCustomerNode {
	return &StripeCreateCustomerNode{secrets: secrets, httpClient: http.DefaultClient, baseURL: "https://api.stripe.com"}
}

func (n *StripeCreateCustomerNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "stripe_create_customer", Name: "Stripe: Create Customer", Category: "Finance",
		Description: "Creates a customer in the job owner's connected Stripe account, emitting one item with the created customer's id (field \"customer_id\"). " +
			"Requires a connected Stripe account (a secret key, connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: email (string, required). name (string, optional)."}
}

func (n *StripeCreateCustomerNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "email", "") == "" {
		return errors.New("email is required")
	}
	return nil
}

func (n *StripeCreateCustomerNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("stripe_create_customer: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("stripe_create_customer: owner_id/organization_id are required in input")
	}

	secret, ok, err := n.secrets.StaticSecretForUser(ctx, organizationID, "stripe", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve stripe secret: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("stripe_create_customer: job owner has no connected Stripe account")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	email := dataflow.StringParam(params, "email", "")
	name := dataflow.StringParam(params, "name", "")

	form := url.Values{"email": {email}}
	if name != "" {
		form.Set("name", name)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.baseURL+"/v1/customers", strings.NewReader(form.Encode()))
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build stripe request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+secret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("stripe create customer: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("stripe create customer: status %d: %s", resp.StatusCode, string(respBody))
	}

	var customer struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(respBody, &customer); err != nil {
		return dataflow.Output{}, fmt.Errorf("decode stripe response: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"customer_id": customer.ID}}), nil
}
