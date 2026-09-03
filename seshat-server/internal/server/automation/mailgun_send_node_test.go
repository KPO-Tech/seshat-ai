package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// newFakeMailgunServer serves just enough of the Mailgun API for
// mailgun_send_email's messages call to succeed, asserting the Basic auth
// username is "api" (Mailgun's own convention, not a Bearer token) and the
// content type is form-encoded.
func newFakeMailgunServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v3/mg.example.com/messages", func(w http.ResponseWriter, r *http.Request) {
		if user, _, ok := r.BasicAuth(); !ok || user != "api" {
			http.Error(w, "expected basic auth with username \"api\"", http.StatusUnauthorized)
			return
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/x-www-form-urlencoded" {
			http.Error(w, "expected form-encoded body, got "+ct, http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]any{"id": "msg-1"})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestMailgunSendEmailNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewMailgunSendEmailNode(&stubStaticSecretResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestMailgunSendEmailNodeExecuteRequiresConnectedAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewMailgunSendEmailNode(&stubStaticSecretResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"domain": "mg.example.com", "from": "a@example.com", "to": "b@example.com", "subject": "hi", "body": "hello"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Mailgun account")
	}
}

func TestMailgunSendEmailNodeExecutePropagatesSecretResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewMailgunSendEmailNode(&stubStaticSecretResolver{err: errors.New("boom")})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"domain": "mg.example.com", "from": "a@example.com", "to": "b@example.com", "subject": "hi", "body": "hello"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the secret resolver's error to propagate")
	}
}

func TestMailgunSendEmailNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	secrets := &stubStaticSecretResolver{secretsByUser: map[string]string{"user-1": "key-fake"}}
	n := NewMailgunSendEmailNode(secrets)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when domain/from/to/subject/body are missing")
	}
}

func TestMailgunSendEmailNodeExecuteSendsAndReturnsMessageID(t *testing.T) {
	env := newTestEnv(t)
	server := newFakeMailgunServer(t)
	secrets := &stubStaticSecretResolver{secretsByUser: map[string]string{"user-1": "key-fake"}}
	n := NewMailgunSendEmailNode(secrets)
	n.baseURL = server.URL

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"domain": "mg.example.com", "from": "a@example.com", "to": "b@example.com", "subject": "hi", "body": "hello"}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["message_id"] != "msg-1" {
		t.Fatalf("unexpected output: %+v", items)
	}
	if len(secrets.calls) != 1 || secrets.calls[0] != env.orgID+":mailgun:user-1" {
		t.Fatalf("expected StaticSecretForUser to be called once for org/mailgun/user-1, got %v", secrets.calls)
	}
}
