package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"golang.org/x/oauth2"
	"google.golang.org/api/option"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
	coregmail "github.com/KPO-Tech/seshat/pkg/gmail"
)

// newFakeGmailSendServer serves just enough of the Gmail API for Send to
// succeed - same endpoint/response shape gmail/client_test.go's own Send
// test already exercises.
func newFakeGmailSendServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /gmail/v1/users/me/messages/send", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"id": "sent-1"})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestGmailSendNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewGmailSendNode(&stubTokenResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestGmailSendNodeExecuteRequiresConnectedGmailAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewGmailSendNode(&stubTokenResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"to": []any{"a@example.com"}, "subject": "hi", "body": "hello"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Gmail account")
	}
}

func TestGmailSendNodeExecutePropagatesTokenResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewGmailSendNode(&stubTokenResolver{err: errors.New("boom")})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"to": []any{"a@example.com"}, "subject": "hi", "body": "hello"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the token resolver's error to propagate")
	}
}

func TestGmailSendNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewGmailSendNode(tokens)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when to/subject/body are missing")
	}
}

func TestGmailSendNodeExecuteSendsAndReturnsMessageID(t *testing.T) {
	env := newTestEnv(t)
	server := newFakeGmailSendServer(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewGmailSendNode(tokens)
	n.newGmailClient = func(ctx context.Context, ts oauth2.TokenSource) (*coregmail.Client, error) {
		return coregmail.New(ctx, ts, option.WithEndpoint(server.URL))
	}

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"to": []any{"a@example.com", "b@example.com"}, "subject": "hi", "body": "hello"}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["message_id"] != "sent-1" {
		t.Fatalf("unexpected output: %+v", items)
	}
	if len(tokens.calls) != 1 || tokens.calls[0] != env.orgID+":gmail:user-1" {
		t.Fatalf("expected AccessTokenForUser to be called once for org/gmail/user-1, got %v", tokens.calls)
	}
}
