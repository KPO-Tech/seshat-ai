package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// newFakePostmarkServer serves just enough of the Postmark API for
// postmark_send_email's /email call to succeed, asserting the server
// token header name Postmark actually uses (not a Bearer token).
func newFakePostmarkServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /email", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Postmark-Server-Token") != "server-token-fake" {
			http.Error(w, "missing/wrong X-Postmark-Server-Token", http.StatusUnauthorized)
			return
		}
		writeJSON(w, map[string]any{"MessageID": "msg-1"})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestPostmarkSendEmailNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewPostmarkSendEmailNode(&stubStaticSecretResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestPostmarkSendEmailNodeExecuteRequiresConnectedAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewPostmarkSendEmailNode(&stubStaticSecretResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"from": "a@example.com", "to": "b@example.com", "subject": "hi", "body": "hello"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Postmark account")
	}
}

func TestPostmarkSendEmailNodeExecutePropagatesSecretResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewPostmarkSendEmailNode(&stubStaticSecretResolver{err: errors.New("boom")})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"from": "a@example.com", "to": "b@example.com", "subject": "hi", "body": "hello"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the secret resolver's error to propagate")
	}
}

func TestPostmarkSendEmailNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	secrets := &stubStaticSecretResolver{secretsByUser: map[string]string{"user-1": "server-token-fake"}}
	n := NewPostmarkSendEmailNode(secrets)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when from/to/subject/body are missing")
	}
}

func TestPostmarkSendEmailNodeExecuteSendsAndReturnsMessageID(t *testing.T) {
	env := newTestEnv(t)
	server := newFakePostmarkServer(t)
	secrets := &stubStaticSecretResolver{secretsByUser: map[string]string{"user-1": "server-token-fake"}}
	n := NewPostmarkSendEmailNode(secrets)
	n.baseURL = server.URL

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"from": "a@example.com", "to": "b@example.com", "subject": "hi", "body": "hello"}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["message_id"] != "msg-1" {
		t.Fatalf("unexpected output: %+v", items)
	}
	if len(secrets.calls) != 1 || secrets.calls[0] != env.orgID+":postmark:user-1" {
		t.Fatalf("expected StaticSecretForUser to be called once for org/postmark/user-1, got %v", secrets.calls)
	}
}
