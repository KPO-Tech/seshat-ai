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

// AsanaCreateTaskNode is the "asana_create_task" node type: creates a task
// in a project in the job owner's connected Asana account. Deliberately
// not part of the generic pkg/dataflow SDK - same reasoning as
// GmailPollNode, it needs a seshat-ai connector account.
//
// No shared asana package exists yet, so this hand-rolls the one
// request it needs directly - the first representative Asana action, not
// exhaustive API coverage. Reads job context (owner_id, organization_id)
// from its own input, same constraint as GmailSendNode - see its doc
// comment.
type AsanaCreateTaskNode struct {
	tokens ConnectorTokenResolver
	// httpClient/baseURL are injectable for tests, same pattern as
	// GmailPollNode's newGmailClient field.
	httpClient *http.Client
	baseURL    string
}

func NewAsanaCreateTaskNode(tokens ConnectorTokenResolver) *AsanaCreateTaskNode {
	return &AsanaCreateTaskNode{tokens: tokens, httpClient: http.DefaultClient, baseURL: "https://app.asana.com"}
}

func (n *AsanaCreateTaskNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "asana_create_task", Name: "Asana: Create Task", Category: "Productivity",
		Description: "Creates a task in a project in the job owner's connected Asana account, emitting one item with the created task's id (field \"task_gid\"). " +
			"Requires a connected Asana account (connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: projectGid (string, required) - the id of the project the task is created in. name (string, required). notes (string, optional)."}
}

func (n *AsanaCreateTaskNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "projectGid", "") == "" {
		return errors.New("projectGid is required")
	}
	if dataflow.StringParam(params, "name", "") == "" {
		return errors.New("name is required")
	}
	return nil
}

func (n *AsanaCreateTaskNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("asana_create_task: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("asana_create_task: owner_id/organization_id are required in input")
	}

	token, ok, err := n.tokens.AccessTokenForUser(ctx, organizationID, "asana", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve asana access token: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("asana_create_task: job owner has no connected Asana account")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	projectGid := dataflow.StringParam(params, "projectGid", "")
	name := dataflow.StringParam(params, "name", "")
	notes := dataflow.StringParam(params, "notes", "")

	fields := map[string]any{"name": name, "projects": []any{projectGid}}
	if notes != "" {
		fields["notes"] = notes
	}
	reqBody := map[string]any{"data": fields}
	encoded, err := json.Marshal(reqBody)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("encode asana request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.baseURL+"/api/1.0/tasks", bytes.NewReader(encoded))
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build asana request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("asana create task: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("asana create task: status %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Data struct {
			Gid string `json:"gid"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return dataflow.Output{}, fmt.Errorf("decode asana response: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"task_gid": result.Data.Gid}}), nil
}
