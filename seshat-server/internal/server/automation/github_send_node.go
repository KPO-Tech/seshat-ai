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

// GitHubCreateIssueNode is the "github_create_issue" node type: creates an
// issue in a public repository the job owner's connected GitHub account
// can access. Deliberately not part of the generic pkg/dataflow SDK - same
// reasoning as GmailPollNode, it needs a seshat-ai connector account.
//
// No shared github package exists yet, so this hand-rolls the one
// request it needs directly - the first representative GitHub action, not
// exhaustive API coverage. GitHub requires a User-Agent header on every
// API request (verified against GitHub's REST API docs before writing
// this, not discovered by a failing request) - set unconditionally below.
// Reads job context (owner_id, organization_id) from its own input, same
// constraint as GmailSendNode - see its doc comment.
type GitHubCreateIssueNode struct {
	tokens ConnectorTokenResolver
	// httpClient/baseURL are injectable for tests, same pattern as
	// GmailPollNode's newGmailClient field.
	httpClient *http.Client
	baseURL    string
}

func NewGitHubCreateIssueNode(tokens ConnectorTokenResolver) *GitHubCreateIssueNode {
	return &GitHubCreateIssueNode{tokens: tokens, httpClient: http.DefaultClient, baseURL: "https://api.github.com"}
}

func (n *GitHubCreateIssueNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "github_create_issue", Name: "GitHub: Create Issue", Category: "Productivity",
		Description: "Creates an issue in a repository the job owner's connected GitHub account can access, emitting one item with the created issue's number (field \"issue_number\"). Connected at the \"public_repo\" scope - only works against public repositories. " +
			"Requires a connected GitHub account (connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: owner (string, required) - the repo owner (user or org). repo (string, required). title (string, required). body (string, optional)."}
}

func (n *GitHubCreateIssueNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "owner", "") == "" {
		return errors.New("owner is required")
	}
	if dataflow.StringParam(params, "repo", "") == "" {
		return errors.New("repo is required")
	}
	if dataflow.StringParam(params, "title", "") == "" {
		return errors.New("title is required")
	}
	return nil
}

func (n *GitHubCreateIssueNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("github_create_issue: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("github_create_issue: owner_id/organization_id are required in input")
	}

	token, ok, err := n.tokens.AccessTokenForUser(ctx, organizationID, "github", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve github access token: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("github_create_issue: job owner has no connected GitHub account")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	repoOwner := dataflow.StringParam(params, "owner", "")
	repo := dataflow.StringParam(params, "repo", "")
	title := dataflow.StringParam(params, "title", "")
	body := dataflow.StringParam(params, "body", "")

	reqBody := map[string]any{"title": title}
	if body != "" {
		reqBody["body"] = body
	}
	encoded, err := json.Marshal(reqBody)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("encode github request: %w", err)
	}

	requestURL := fmt.Sprintf("%s/repos/%s/%s/issues", n.baseURL, url.PathEscape(repoOwner), url.PathEscape(repo))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(encoded))
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build github request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "seshat-ai")
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("github create issue: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("github create issue: status %d: %s", resp.StatusCode, string(respBody))
	}

	var issue struct {
		Number int `json:"number"`
	}
	if err := json.Unmarshal(respBody, &issue); err != nil {
		return dataflow.Output{}, fmt.Errorf("decode github response: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"issue_number": issue.Number}}), nil
}
