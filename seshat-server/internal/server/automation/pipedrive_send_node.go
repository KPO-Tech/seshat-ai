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

// PipedriveCreateDealNode is the "pipedrive_create_deal" node type: creates
// a deal in the job owner's connected Pipedrive account. Deliberately not
// part of the generic pkg/dataflow SDK - same reasoning as GmailPollNode,
// it needs a seshat-ai connector account.
//
// No seshat-core/pipedrive package exists yet, so this hand-rolls the one
// request it needs directly - the first representative Pipedrive action,
// not exhaustive API coverage. Pipedrive's REST API host is per-account
// (api_domain, captured at connect time into ConnectorAccount.Config - see
// connectors.pipedriveKind's doc comment), so this node needs both a token
// (ConnectorTokenResolver) and that config (AccountConfigResolver), unlike
// every send node before it in this batch. Reads job context (owner_id,
// organization_id) from its own input, same constraint as GmailSendNode -
// see its doc comment.
type PipedriveCreateDealNode struct {
	tokens  ConnectorTokenResolver
	configs AccountConfigResolver
	// httpClient is injectable for tests, same pattern as GmailPollNode's
	// newGmailClient field. No baseURL field here - unlike every other node
	// in this initiative, the API host comes from the connected account's
	// own config (api_domain), not a fixed provider host.
	httpClient *http.Client
}

func NewPipedriveCreateDealNode(tokens ConnectorTokenResolver, configs AccountConfigResolver) *PipedriveCreateDealNode {
	return &PipedriveCreateDealNode{tokens: tokens, configs: configs, httpClient: http.DefaultClient}
}

func (n *PipedriveCreateDealNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "pipedrive_create_deal", Name: "Pipedrive: Create Deal", Category: "Productivity",
		Description: "Creates a deal in the job owner's connected Pipedrive account, emitting one item with the created deal's id (field \"deal_id\"). " +
			"Requires a connected Pipedrive account (connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: title (string, required). value (number, optional). currency (string, optional) - a 3-letter ISO currency code, e.g. \"USD\", required if value is set."}
}

func (n *PipedriveCreateDealNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "title", "") == "" {
		return errors.New("title is required")
	}
	return nil
}

func (n *PipedriveCreateDealNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("pipedrive_create_deal: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("pipedrive_create_deal: owner_id/organization_id are required in input")
	}

	token, ok, err := n.tokens.AccessTokenForUser(ctx, organizationID, "pipedrive", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve pipedrive access token: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("pipedrive_create_deal: job owner has no connected Pipedrive account")
	}
	rawConfig, ok, err := n.configs.AccountConfigForUser(ctx, organizationID, "pipedrive", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve pipedrive account config: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("pipedrive_create_deal: job owner's connected Pipedrive account has no api_domain on record - reconnect it")
	}
	var config struct {
		APIDomain string `json:"api_domain"`
	}
	if err := json.Unmarshal([]byte(rawConfig), &config); err != nil || config.APIDomain == "" {
		return dataflow.Output{}, errors.New("pipedrive_create_deal: job owner's connected Pipedrive account has no api_domain on record - reconnect it")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	title := dataflow.StringParam(params, "title", "")
	value := dataflow.StringParam(params, "value", "")
	currency := dataflow.StringParam(params, "currency", "")

	reqBody := map[string]any{"title": title}
	if value != "" {
		reqBody["value"] = value
	}
	if currency != "" {
		reqBody["currency"] = currency
	}
	encoded, err := json.Marshal(reqBody)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("encode pipedrive request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, config.APIDomain+"/v1/deals", bytes.NewReader(encoded))
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build pipedrive request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("pipedrive create deal: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("pipedrive create deal: status %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Data struct {
			ID int `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return dataflow.Output{}, fmt.Errorf("decode pipedrive response: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"deal_id": result.Data.ID}}), nil
}
