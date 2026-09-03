package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	coremsgraph "github.com/EngineerProjects/seshat-ai/seshat-core/msgraph"
	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

func TestTeamsSendNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewTeamsSendNode(&stubTokenResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestTeamsSendNodeExecuteRequiresConnectedAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewTeamsSendNode(&stubTokenResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"chatId": "chat-1", "body": "hello"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Teams account")
	}
}

func TestTeamsSendNodeExecutePropagatesTokenResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewTeamsSendNode(&stubTokenResolver{err: errors.New("boom")})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"chatId": "chat-1", "body": "hello"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the token resolver's error to propagate")
	}
}

func TestTeamsSendNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewTeamsSendNode(tokens)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when chatId/body are missing")
	}
}

func TestTeamsSendNodeExecuteSendsMessage(t *testing.T) {
	env := newTestEnv(t)
	var gotPath string
	graph := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.WriteHeader(http.StatusCreated)
	}))
	t.Cleanup(graph.Close)
	restore := coremsgraph.SetBaseURLForTesting(graph.URL)
	t.Cleanup(restore)

	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewTeamsSendNode(tokens)

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"chatId": "chat-1", "body": "hello"}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["sent"] != true {
		t.Fatalf("unexpected output: %+v", items)
	}
	if gotPath != "/chats/chat-1/messages" {
		t.Fatalf("expected POST to /chats/chat-1/messages, got %q", gotPath)
	}
	if len(tokens.calls) != 1 || tokens.calls[0] != env.orgID+":teams:user-1" {
		t.Fatalf("expected AccessTokenForUser to be called once for org/teams/user-1, got %v", tokens.calls)
	}
}
