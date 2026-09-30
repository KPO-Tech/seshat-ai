package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// newFakeIntercomServer serves just enough of the Intercom API for
// intercom_create_contact's contacts call to succeed.
func newFakeIntercomServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /contacts", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"id": "contact-1"})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestIntercomCreateContactNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewIntercomCreateContactNode(&stubTokenResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestIntercomCreateContactNodeExecuteRequiresConnectedAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewIntercomCreateContactNode(&stubTokenResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"email": "a@example.com"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Intercom account")
	}
}

func TestIntercomCreateContactNodeExecutePropagatesTokenResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewIntercomCreateContactNode(&stubTokenResolver{err: errors.New("boom")})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"email": "a@example.com"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the token resolver's error to propagate")
	}
}

func TestIntercomCreateContactNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewIntercomCreateContactNode(tokens)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when email is missing")
	}
}

func TestIntercomCreateContactNodeExecuteCreatesAndReturnsContactID(t *testing.T) {
	env := newTestEnv(t)
	server := newFakeIntercomServer(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewIntercomCreateContactNode(tokens)
	n.baseURL = server.URL

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"email": "a@example.com", "name": "Ada"}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["contact_id"] != "contact-1" {
		t.Fatalf("unexpected output: %+v", items)
	}
	if len(tokens.calls) != 1 || tokens.calls[0] != env.orgID+":intercom:user-1" {
		t.Fatalf("expected AccessTokenForUser to be called once for org/intercom/user-1, got %v", tokens.calls)
	}
}
