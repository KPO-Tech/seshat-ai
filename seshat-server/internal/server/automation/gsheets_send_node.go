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

// GSheetsAppendRowNode is the "gsheets_append_row" node type: appends one
// row to a sheet in the job owner's connected Google Sheets account.
// Deliberately not part of the generic pkg/dataflow SDK - same reasoning as
// GmailPollNode, it needs a seshat-ai connector account.
//
// No seshat-core/gsheets package exists yet, so this hand-rolls the one
// request it needs directly (the Sheets API v4 values:append endpoint) -
// the first representative Sheets action, not exhaustive API coverage.
// Every cell is sent as a string (values param is a flat array, not a typed
// array) - USER_ENTERED input keeps Sheets' own type inference (numbers,
// dates, formulas still work as if typed by hand), same tradeoff Stripe's
// form fields make by staying string-typed rather than modeling every
// possible column type. Reads job context (owner_id, organization_id) from
// its own input, same constraint as GmailSendNode - see its doc comment.
type GSheetsAppendRowNode struct {
	tokens ConnectorTokenResolver
	// httpClient/baseURL are injectable for tests, same pattern as
	// GmailPollNode's newGmailClient field.
	httpClient *http.Client
	baseURL    string
}

func NewGSheetsAppendRowNode(tokens ConnectorTokenResolver) *GSheetsAppendRowNode {
	return &GSheetsAppendRowNode{tokens: tokens, httpClient: http.DefaultClient, baseURL: "https://sheets.googleapis.com"}
}

func (n *GSheetsAppendRowNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "gsheets_append_row", Name: "Google Sheets: Append Row", Category: "Productivity",
		Description: "Appends one row to a sheet in the job owner's connected Google Sheets account, emitting one item with the range the row landed in (field \"updated_range\"). " +
			"Requires a connected Google Sheets account (connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: spreadsheetId (string, required). sheetRange (string, required) - e.g. \"Sheet1\" or \"Sheet1!A:D\", the row is appended after the last row with data in this range. values (array of string, required) - one cell per array entry, sent as Sheets USER_ENTERED input so numbers/dates/formulas are still interpreted as if typed by hand."}
}

func (n *GSheetsAppendRowNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "spreadsheetId", "") == "" {
		return errors.New("spreadsheetId is required")
	}
	if dataflow.StringParam(params, "sheetRange", "") == "" {
		return errors.New("sheetRange is required")
	}
	if len(stringSliceParam(params, "values")) == 0 {
		return errors.New("values (non-empty array of cell strings) is required")
	}
	return nil
}

func (n *GSheetsAppendRowNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("gsheets_append_row: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("gsheets_append_row: owner_id/organization_id are required in input")
	}

	token, ok, err := n.tokens.AccessTokenForUser(ctx, organizationID, "gsheets", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve gsheets access token: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("gsheets_append_row: job owner has no connected Google Sheets account")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	spreadsheetID := dataflow.StringParam(params, "spreadsheetId", "")
	sheetRange := dataflow.StringParam(params, "sheetRange", "")
	values := stringSliceParam(params, "values")

	row := make([]any, len(values))
	for i, v := range values {
		row[i] = v
	}
	body := map[string]any{"values": [][]any{row}}
	encoded, err := json.Marshal(body)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("encode gsheets request: %w", err)
	}

	requestURL := fmt.Sprintf("%s/v4/spreadsheets/%s/values/%s:append?valueInputOption=USER_ENTERED",
		n.baseURL, url.PathEscape(spreadsheetID), url.PathEscape(sheetRange))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(encoded))
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build gsheets request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("gsheets append row: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("gsheets append row: status %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Updates struct {
			UpdatedRange string `json:"updatedRange"`
		} `json:"updates"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return dataflow.Output{}, fmt.Errorf("decode gsheets response: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"updated_range": result.Updates.UpdatedRange}}), nil
}
