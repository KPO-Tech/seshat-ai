package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// newFakeTrelloServer serves just enough of the Trello API for
// trello_create_card's POST /1/cards call to succeed, asserting key/token
// arrive as query params (Trello's own convention, not a header).
func newFakeTrelloServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /1/cards", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if q.Get("key") != "api-key-fake" || q.Get("token") != "api-token-fake" {
			http.Error(w, "missing/wrong key or token query param", http.StatusUnauthorized)
			return
		}
		writeJSON(w, map[string]any{"id": "card-1"})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestTrelloCreateCardNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewTrelloCreateCardNode(&stubStaticSecretResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestTrelloCreateCardNodeExecuteRequiresConnectedAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewTrelloCreateCardNode(&stubStaticSecretResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"listId": "list-1", "name": "hi"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Trello account")
	}
}

func TestTrelloCreateCardNodeExecutePropagatesSecretResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewTrelloCreateCardNode(&stubStaticSecretResolver{err: errors.New("boom")})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"listId": "list-1", "name": "hi"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the secret resolver's error to propagate")
	}
}

func TestTrelloCreateCardNodeExecuteRejectsMalformedSecret(t *testing.T) {
	env := newTestEnv(t)
	secrets := &stubStaticSecretResolver{secretsByUser: map[string]string{"user-1": "not-a-key-token-pair"}}
	n := NewTrelloCreateCardNode(secrets)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"listId": "list-1", "name": "hi"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the connected secret isn't in \"API Key:Token\" form")
	}
}

func TestTrelloCreateCardNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	secrets := &stubStaticSecretResolver{secretsByUser: map[string]string{"user-1": "api-key-fake:api-token-fake"}}
	n := NewTrelloCreateCardNode(secrets)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when listId/name are missing")
	}
}

func TestTrelloCreateCardNodeExecuteCreatesAndReturnsCardID(t *testing.T) {
	env := newTestEnv(t)
	server := newFakeTrelloServer(t)
	secrets := &stubStaticSecretResolver{secretsByUser: map[string]string{"user-1": "api-key-fake:api-token-fake"}}
	n := NewTrelloCreateCardNode(secrets)
	n.baseURL = server.URL

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"listId": "list-1", "name": "hi", "description": "body"}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["card_id"] != "card-1" {
		t.Fatalf("unexpected output: %+v", items)
	}
	if len(secrets.calls) != 1 || secrets.calls[0] != env.orgID+":trello:user-1" {
		t.Fatalf("expected StaticSecretForUser to be called once for org/trello/user-1, got %v", secrets.calls)
	}
}
