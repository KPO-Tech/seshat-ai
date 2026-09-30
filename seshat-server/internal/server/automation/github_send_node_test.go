package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// newFakeGitHubServer serves just enough of the GitHub API for
// github_create_issue's issues call to succeed, asserting the required
// User-Agent header is actually sent.
func newFakeGitHubServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /repos/acme/widgets/issues", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("User-Agent") == "" {
			http.Error(w, "missing required User-Agent header", http.StatusForbidden)
			return
		}
		writeJSON(w, map[string]any{"number": 42})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestGitHubCreateIssueNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewGitHubCreateIssueNode(&stubTokenResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestGitHubCreateIssueNodeExecuteRequiresConnectedAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewGitHubCreateIssueNode(&stubTokenResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"owner": "acme", "repo": "widgets", "title": "hi"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected GitHub account")
	}
}

func TestGitHubCreateIssueNodeExecutePropagatesTokenResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewGitHubCreateIssueNode(&stubTokenResolver{err: errors.New("boom")})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"owner": "acme", "repo": "widgets", "title": "hi"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the token resolver's error to propagate")
	}
}

func TestGitHubCreateIssueNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewGitHubCreateIssueNode(tokens)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when owner/repo/title are missing")
	}
}

func TestGitHubCreateIssueNodeExecuteCreatesAndReturnsIssueNumber(t *testing.T) {
	env := newTestEnv(t)
	server := newFakeGitHubServer(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewGitHubCreateIssueNode(tokens)
	n.baseURL = server.URL

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"owner": "acme", "repo": "widgets", "title": "hi", "body": "body"}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["issue_number"] != 42 {
		t.Fatalf("unexpected output: %+v", items)
	}
	if len(tokens.calls) != 1 || tokens.calls[0] != env.orgID+":github:user-1" {
		t.Fatalf("expected AccessTokenForUser to be called once for org/github/user-1, got %v", tokens.calls)
	}
}
