package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// newFakeJiraServer serves just enough of Atlassian's accessible-resources
// endpoint and the Jira REST API v3 issue-create endpoint for
// jira_create_issue to succeed - both live under the same host in
// production (api.atlassian.com), mirrored here as one fake server.
func newFakeJiraServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /oauth/token/accessible-resources", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, []map[string]any{{"id": "cloud-1"}})
	})
	mux.HandleFunc("POST /ex/jira/cloud-1/rest/api/3/issue", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"key": "PROJ-1"})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestJiraCreateIssueNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewJiraCreateIssueNode(&stubTokenResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestJiraCreateIssueNodeExecuteRequiresConnectedAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewJiraCreateIssueNode(&stubTokenResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"projectKey": "PROJ", "issueTypeName": "Task", "summary": "hi"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Jira account")
	}
}

func TestJiraCreateIssueNodeExecutePropagatesTokenResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewJiraCreateIssueNode(&stubTokenResolver{err: errors.New("boom")})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"projectKey": "PROJ", "issueTypeName": "Task", "summary": "hi"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the token resolver's error to propagate")
	}
}

func TestJiraCreateIssueNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewJiraCreateIssueNode(tokens)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when projectKey/issueTypeName/summary are missing")
	}
}

func TestJiraCreateIssueNodeExecuteCreatesAndReturnsIssueKey(t *testing.T) {
	env := newTestEnv(t)
	server := newFakeJiraServer(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewJiraCreateIssueNode(tokens)
	n.baseURL = server.URL

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"projectKey": "PROJ", "issueTypeName": "Task", "summary": "hi", "description": "body"}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["issue_key"] != "PROJ-1" {
		t.Fatalf("unexpected output: %+v", items)
	}
	if len(tokens.calls) != 1 || tokens.calls[0] != env.orgID+":jira:user-1" {
		t.Fatalf("expected AccessTokenForUser to be called once for org/jira/user-1, got %v", tokens.calls)
	}
}
