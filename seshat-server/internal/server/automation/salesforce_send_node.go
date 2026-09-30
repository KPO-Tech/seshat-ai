package automation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// salesforceAPIVersion pins the REST API version this node targets - a
// fixed literal rather than "latest", so behavior doesn't silently shift
// under a running workflow when Salesforce ships a new version.
const salesforceAPIVersion = "v59.0"

// SalesforceCreateRecordNode is the "salesforce_create_record" node type:
// creates a record of any object type in the job owner's connected
// Salesforce org. Deliberately not part of the generic pkg/dataflow SDK -
// same reasoning as GmailPollNode, it needs a seshat-ai connector account.
//
// No shared salesforce package exists yet, so this hand-rolls the one
// request it needs directly - the first representative Salesforce action,
// not exhaustive API coverage. Generic over sobjectType (Contact, Lead,
// Account, or any custom object) rather than one hardcoded object, since
// Salesforce orgs vary far more in which objects matter than any other
// service in this initiative - same "caller shapes the payload" tradeoff
// AirtableCreateRecordNode's fields param already makes. Salesforce's REST
// API host is per-org (instance_url, captured at connect time into
// ConnectorAccount.Config - see connectors.salesforceKind's doc comment),
// so this node needs both a token (ConnectorTokenResolver) and that config
// (AccountConfigResolver), same shape as PipedriveCreateDealNode. Reads
// job context (owner_id, organization_id) from its own input, same
// constraint as GmailSendNode - see its doc comment.
type SalesforceCreateRecordNode struct {
	tokens  ConnectorTokenResolver
	configs AccountConfigResolver
	// httpClient is injectable for tests, same pattern as GmailPollNode's
	// newGmailClient field. No baseURL field here - same reasoning as
	// PipedriveCreateDealNode.
	httpClient *http.Client
}

func NewSalesforceCreateRecordNode(tokens ConnectorTokenResolver, configs AccountConfigResolver) *SalesforceCreateRecordNode {
	return &SalesforceCreateRecordNode{tokens: tokens, configs: configs, httpClient: http.DefaultClient}
}

func (n *SalesforceCreateRecordNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "salesforce_create_record", Name: "Salesforce: Create Record", Category: "Productivity",
		Description: "Creates a record of any object type in the job owner's connected Salesforce org, emitting one item with the created record's id (field \"record_id\"). " +
			"Requires a connected Salesforce account (connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: sobjectType (string, required) - e.g. \"Contact\", \"Lead\", \"Account\", or a custom object's API name. fields (json object, required) - one key per field's API name, e.g. {\"LastName\": \"Lovelace\", \"Email\": \"ada@example.com\"}."}
}

func (n *SalesforceCreateRecordNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "sobjectType", "") == "" {
		return errors.New("sobjectType is required")
	}
	if _, ok := params["fields"].(map[string]any); !ok {
		return errors.New("fields (a json object) is required")
	}
	return nil
}

func (n *SalesforceCreateRecordNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("salesforce_create_record: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("salesforce_create_record: owner_id/organization_id are required in input")
	}

	token, ok, err := n.tokens.AccessTokenForUser(ctx, organizationID, "salesforce", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve salesforce access token: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("salesforce_create_record: job owner has no connected Salesforce account")
	}
	rawConfig, ok, err := n.configs.AccountConfigForUser(ctx, organizationID, "salesforce", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve salesforce account config: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("salesforce_create_record: job owner's connected Salesforce account has no instance_url on record - reconnect it")
	}
	var config struct {
		InstanceURL string `json:"instance_url"`
	}
	if err := json.Unmarshal([]byte(rawConfig), &config); err != nil || config.InstanceURL == "" {
		return dataflow.Output{}, errors.New("salesforce_create_record: job owner's connected Salesforce account has no instance_url on record - reconnect it")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	sobjectType := dataflow.StringParam(params, "sobjectType", "")
	fields, _ := params["fields"].(map[string]any)

	encoded, err := json.Marshal(fields)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("encode salesforce request: %w", err)
	}

	requestURL := fmt.Sprintf("%s/services/data/%s/sobjects/%s", config.InstanceURL, salesforceAPIVersion, url.PathEscape(sobjectType))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(encoded))
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build salesforce request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("salesforce create record: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("salesforce create record: status %d: %s", resp.StatusCode, string(respBody))
	}

	var record struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(respBody, &record); err != nil {
		return dataflow.Output{}, fmt.Errorf("decode salesforce response: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"record_id": record.ID}}), nil
}
