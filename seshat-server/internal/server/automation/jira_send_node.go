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

// JiraCreateIssueNode is the "jira_create_issue" node type: creates an
// issue in a project on the job owner's connected Jira site. Deliberately
// not part of the generic pkg/dataflow SDK - same reasoning as
// GmailPollNode, it needs a seshat-ai connector account.
//
// No shared jira package exists yet, so this hand-rolls the two
// requests it needs directly - the first representative Jira action, not
// exhaustive API coverage. Jira Cloud has no fixed API base URL (same
// structural quirk as Confluence, another Atlassian product - see
// connectors/confluence.go's doc comment): every call is scoped under a
// per-account cloud ID, resolved fresh per call via Atlassian's
// accessible-resources endpoint rather than cached - this node duplicates
// that one small lookup instead of exporting a shared package's unexported
// resolveConfluenceCloudID, keeping this batch (like Notion/Stripe/Sheets/
// Calendar) free of any shared package SDK change. Reads job context
// (owner_id, organization_id) from its own input, same constraint as
// GmailSendNode - see its doc comment.
type JiraCreateIssueNode struct {
	tokens ConnectorTokenResolver
	// httpClient/baseURL are injectable for tests, same pattern as
	// GmailPollNode's newGmailClient field. Both the accessible-resources
	// lookup and the issue-create call live under this same host in
	// production (api.atlassian.com), so one base URL covers both.
	httpClient *http.Client
	baseURL    string
}

func NewJiraCreateIssueNode(tokens ConnectorTokenResolver) *JiraCreateIssueNode {
	return &JiraCreateIssueNode{tokens: tokens, httpClient: http.DefaultClient, baseURL: "https://api.atlassian.com"}
}

func (n *JiraCreateIssueNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "jira_create_issue", Name: "Jira: Create Issue", Category: "Productivity",
		Description: "Creates an issue in a project on the job owner's connected Jira site, emitting one item with the created issue's key (field \"issue_key\", e.g. \"PROJ-123\"). " +
			"Requires a connected Jira account (connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: projectKey (string, required) - e.g. \"PROJ\". issueTypeName (string, required) - e.g. \"Task\", \"Bug\", \"Story\", must match a type configured on the project. summary (string, required). description (string, optional)."}
}

func (n *JiraCreateIssueNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "projectKey", "") == "" {
		return errors.New("projectKey is required")
	}
	if dataflow.StringParam(params, "issueTypeName", "") == "" {
		return errors.New("issueTypeName is required")
	}
	if dataflow.StringParam(params, "summary", "") == "" {
		return errors.New("summary is required")
	}
	return nil
}

// jiraAccessibleResource is one entry of GET /oauth/token/accessible-resources
// - the same shape (and endpoint) confluence_atlassian.go's
// confluenceAccessibleResource models, duplicated here rather than
// exported/reused across the shared-core boundary for this batch (see this
// node's doc comment).
type jiraAccessibleResource struct {
	ID string `json:"id"`
}

func (n *JiraCreateIssueNode) resolveCloudID(ctx context.Context, token string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, n.baseURL+"/oauth/token/accessible-resources", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := n.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("list accessible atlassian resources: status %d: %s", resp.StatusCode, string(body))
	}
	var resources []jiraAccessibleResource
	if err := json.Unmarshal(body, &resources); err != nil {
		return "", fmt.Errorf("decode accessible resources: %w", err)
	}
	if len(resources) == 0 {
		return "", errors.New("no accessible atlassian sites for this account")
	}
	return resources[0].ID, nil
}

func (n *JiraCreateIssueNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("jira_create_issue: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("jira_create_issue: owner_id/organization_id are required in input")
	}

	token, ok, err := n.tokens.AccessTokenForUser(ctx, organizationID, "jira", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve jira access token: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("jira_create_issue: job owner has no connected Jira account")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	projectKey := dataflow.StringParam(params, "projectKey", "")
	issueTypeName := dataflow.StringParam(params, "issueTypeName", "")
	summary := dataflow.StringParam(params, "summary", "")
	description := dataflow.StringParam(params, "description", "")

	cloudID, err := n.resolveCloudID(ctx, token)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve jira cloud id: %w", err)
	}

	fields := map[string]any{
		"project":   map[string]any{"key": projectKey},
		"issuetype": map[string]any{"name": issueTypeName},
		"summary":   summary,
	}
	if description != "" {
		// Jira's REST API v3 requires "description" in Atlassian Document
		// Format, not a plain string - a single paragraph is the minimal
		// valid document, verified against Atlassian's issue-create docs
		// before writing this.
		fields["description"] = map[string]any{
			"type":    "doc",
			"version": 1,
			"content": []any{
				map[string]any{
					"type": "paragraph",
					"content": []any{
						map[string]any{"type": "text", "text": description},
					},
				},
			},
		}
	}
	body := map[string]any{"fields": fields}
	encoded, err := json.Marshal(body)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("encode jira request: %w", err)
	}

	requestURL := fmt.Sprintf("%s/ex/jira/%s/rest/api/3/issue", n.baseURL, cloudID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(encoded))
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build jira request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("jira create issue: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("jira create issue: status %d: %s", resp.StatusCode, string(respBody))
	}

	var issue struct {
		Key string `json:"key"`
	}
	if err := json.Unmarshal(respBody, &issue); err != nil {
		return dataflow.Output{}, fmt.Errorf("decode jira response: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"issue_key": issue.Key}}), nil
}
