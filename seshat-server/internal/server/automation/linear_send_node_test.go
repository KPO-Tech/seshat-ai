package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// newFakeLinearServer serves just enough of Linear's GraphQL API for
// linear_create_issue's issueCreate mutation to succeed.
func newFakeLinearServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /graphql", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"data": map[string]any{
				"issueCreate": map[string]any{
					"success": true,
					"issue":   map[string]any{"identifier": "ENG-123"},
				},
			},
		})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestLinearCreateIssueNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewLinearCreateIssueNode(&stubTokenResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestLinearCreateIssueNodeExecuteRequiresConnectedAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewLinearCreateIssueNode(&stubTokenResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"teamId": "team-1", "title": "hi"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Linear account")
	}
}

func TestLinearCreateIssueNodeExecutePropagatesTokenResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewLinearCreateIssueNode(&stubTokenResolver{err: errors.New("boom")})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"teamId": "team-1", "title": "hi"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the token resolver's error to propagate")
	}
}

func TestLinearCreateIssueNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewLinearCreateIssueNode(tokens)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when teamId/title are missing")
	}
}

func TestLinearCreateIssueNodeExecuteCreatesAndReturnsIssueIdentifier(t *testing.T) {
	env := newTestEnv(t)
	server := newFakeLinearServer(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewLinearCreateIssueNode(tokens)
	n.baseURL = server.URL

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"teamId": "team-1", "title": "hi", "description": "body"}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["issue_identifier"] != "ENG-123" {
		t.Fatalf("unexpected output: %+v", items)
	}
	if len(tokens.calls) != 1 || tokens.calls[0] != env.orgID+":linear:user-1" {
		t.Fatalf("expected AccessTokenForUser to be called once for org/linear/user-1, got %v", tokens.calls)
	}
}
