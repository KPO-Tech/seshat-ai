package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// newFakeSendGridServer serves just enough of the SendGrid API for
// sendgrid_send_email's mail/send call to succeed - a 202 with an empty
// body, matching SendGrid's real response shape.
func newFakeSendGridServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v3/mail/send", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestSendGridSendEmailNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewSendGridSendEmailNode(&stubStaticSecretResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestSendGridSendEmailNodeExecuteRequiresConnectedAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewSendGridSendEmailNode(&stubStaticSecretResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"from": "a@example.com", "to": "b@example.com", "subject": "hi", "body": "hello"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected SendGrid account")
	}
}

func TestSendGridSendEmailNodeExecutePropagatesSecretResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewSendGridSendEmailNode(&stubStaticSecretResolver{err: errors.New("boom")})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"from": "a@example.com", "to": "b@example.com", "subject": "hi", "body": "hello"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the secret resolver's error to propagate")
	}
}

func TestSendGridSendEmailNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	secrets := &stubStaticSecretResolver{secretsByUser: map[string]string{"user-1": "SG.fake"}}
	n := NewSendGridSendEmailNode(secrets)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when from/to/subject/body are missing")
	}
}

func TestSendGridSendEmailNodeExecuteSends(t *testing.T) {
	env := newTestEnv(t)
	server := newFakeSendGridServer(t)
	secrets := &stubStaticSecretResolver{secretsByUser: map[string]string{"user-1": "SG.fake"}}
	n := NewSendGridSendEmailNode(secrets)
	n.baseURL = server.URL

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"from": "a@example.com", "to": "b@example.com", "subject": "hi", "body": "hello"}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["sent"] != true {
		t.Fatalf("unexpected output: %+v", items)
	}
	if len(secrets.calls) != 1 || secrets.calls[0] != env.orgID+":sendgrid:user-1" {
		t.Fatalf("expected StaticSecretForUser to be called once for org/sendgrid/user-1, got %v", secrets.calls)
	}
}
