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

// LinearCreateIssueNode is the "linear_create_issue" node type: creates an
// issue on a team in the job owner's connected Linear account.
// Deliberately not part of the generic pkg/dataflow SDK - same reasoning
// as GmailPollNode, it needs a seshat-ai connector account.
//
// Linear's API is GraphQL-only (no REST surface) - no seshat-core/linear
// package exists yet, so this hand-rolls the one mutation it needs
// directly via a plain HTTP POST, the same "no generated SDK vendored"
// call fetchLinearIdentity (oauth.go) already makes for the identity
// lookup. Reads job context (owner_id, organization_id) from its own
// input, same constraint as GmailSendNode - see its doc comment.
type LinearCreateIssueNode struct {
	tokens ConnectorTokenResolver
	// httpClient/baseURL are injectable for tests, same pattern as
	// GmailPollNode's newGmailClient field.
	httpClient *http.Client
	baseURL    string
}

func NewLinearCreateIssueNode(tokens ConnectorTokenResolver) *LinearCreateIssueNode {
	return &LinearCreateIssueNode{tokens: tokens, httpClient: http.DefaultClient, baseURL: "https://api.linear.app"}
}

func (n *LinearCreateIssueNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "linear_create_issue", Name: "Linear: Create Issue", Category: "Productivity",
		Description: "Creates an issue on a team in the job owner's connected Linear account, emitting one item with the created issue's identifier (field \"issue_identifier\", e.g. \"ENG-123\"). " +
			"Requires a connected Linear account (connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: teamId (string, required) - the id of the team the issue is created on. title (string, required). description (string, optional)."}
}

func (n *LinearCreateIssueNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "teamId", "") == "" {
		return errors.New("teamId is required")
	}
	if dataflow.StringParam(params, "title", "") == "" {
		return errors.New("title is required")
	}
	return nil
}

func (n *LinearCreateIssueNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("linear_create_issue: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("linear_create_issue: owner_id/organization_id are required in input")
	}

	token, ok, err := n.tokens.AccessTokenForUser(ctx, organizationID, "linear", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve linear access token: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("linear_create_issue: job owner has no connected Linear account")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	teamID := dataflow.StringParam(params, "teamId", "")
	title := dataflow.StringParam(params, "title", "")
	description := dataflow.StringParam(params, "description", "")

	issueInput := map[string]any{"teamId": teamID, "title": title}
	if description != "" {
		issueInput["description"] = description
	}
	reqBody := map[string]any{
		"query": "mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { identifier } } }",
		"variables": map[string]any{
			"input": issueInput,
		},
	}
	encoded, err := json.Marshal(reqBody)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("encode linear request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.baseURL+"/graphql", bytes.NewReader(encoded))
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build linear request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("linear create issue: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("linear create issue: status %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Data struct {
			IssueCreate struct {
				Success bool `json:"success"`
				Issue   struct {
					Identifier string `json:"identifier"`
				} `json:"issue"`
			} `json:"issueCreate"`
		} `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return dataflow.Output{}, fmt.Errorf("decode linear response: %w", err)
	}
	if len(result.Errors) > 0 {
		return dataflow.Output{}, fmt.Errorf("linear create issue: %s", result.Errors[0].Message)
	}
	if !result.Data.IssueCreate.Success {
		return dataflow.Output{}, errors.New("linear create issue: issueCreate returned success=false")
	}
	return dataflow.Main([]dataflow.Item{{"issue_identifier": result.Data.IssueCreate.Issue.Identifier}}), nil
}
