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

// AirtableCreateRecordNode is the "airtable_create_record" node type:
// creates a record in a table in the job owner's connected Airtable
// account. Deliberately not part of the generic pkg/dataflow SDK - same
// reasoning as GmailPollNode, it needs a seshat-ai connector account. Uses
// the static-credential resolver (StaticSecretResolver), not
// ConnectorTokenResolver - Airtable authenticates with a single Personal
// Access Token, no OAuth2 flow, no refresh.
//
// No shared airtable package exists yet, so this hand-rolls the one
// request it needs directly - the first representative Airtable action,
// not exhaustive API coverage. fields is passed straight through as a
// JSON object (each field name/value already whatever type Airtable's
// column expects), not modeled field-by-field - same "caller's own
// responsibility to shape the payload" tradeoff notion.go's set node
// already makes for arbitrary-shaped data. Reads job context (owner_id,
// organization_id) from its own input, same constraint as GmailSendNode -
// see its doc comment.
type AirtableCreateRecordNode struct {
	secrets StaticSecretResolver
	// httpClient/baseURL are injectable for tests, same pattern as
	// GmailPollNode's newGmailClient field.
	httpClient *http.Client
	baseURL    string
}

func NewAirtableCreateRecordNode(secrets StaticSecretResolver) *AirtableCreateRecordNode {
	return &AirtableCreateRecordNode{secrets: secrets, httpClient: http.DefaultClient, baseURL: "https://api.airtable.com"}
}

func (n *AirtableCreateRecordNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "airtable_create_record", Name: "Airtable: Create Record", Category: "Productivity",
		Description: "Creates a record in a table in the job owner's connected Airtable account, emitting one item with the created record's id (field \"record_id\"). " +
			"Requires a connected Airtable account (a Personal Access Token, connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: baseId (string, required) - e.g. \"appXXXXXXXXXXXXXX\". tableIdOrName (string, required). fields (json object, required) - one key per column, e.g. {\"Name\": \"Ada\", \"Status\": \"Active\"}."}
}

func (n *AirtableCreateRecordNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "baseId", "") == "" {
		return errors.New("baseId is required")
	}
	if dataflow.StringParam(params, "tableIdOrName", "") == "" {
		return errors.New("tableIdOrName is required")
	}
	if _, ok := params["fields"].(map[string]any); !ok {
		return errors.New("fields (a json object) is required")
	}
	return nil
}

func (n *AirtableCreateRecordNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("airtable_create_record: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("airtable_create_record: owner_id/organization_id are required in input")
	}

	secret, ok, err := n.secrets.StaticSecretForUser(ctx, organizationID, "airtable", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve airtable secret: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("airtable_create_record: job owner has no connected Airtable account")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	baseID := dataflow.StringParam(params, "baseId", "")
	tableIDOrName := dataflow.StringParam(params, "tableIdOrName", "")
	fields, _ := params["fields"].(map[string]any)

	reqBody := map[string]any{"fields": fields}
	encoded, err := json.Marshal(reqBody)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("encode airtable request: %w", err)
	}

	requestURL := fmt.Sprintf("%s/v0/%s/%s", n.baseURL, url.PathEscape(baseID), url.PathEscape(tableIDOrName))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(encoded))
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build airtable request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+secret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("airtable create record: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("airtable create record: status %d: %s", resp.StatusCode, string(respBody))
	}

	var record struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(respBody, &record); err != nil {
		return dataflow.Output{}, fmt.Errorf("decode airtable response: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"record_id": record.ID}}), nil
}
