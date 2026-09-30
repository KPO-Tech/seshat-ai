package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
	coremsgraph "github.com/KPO-Tech/seshat/pkg/msgraph"
)

func TestOutlookSendNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewOutlookSendNode(&stubTokenResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestOutlookSendNodeExecuteRequiresConnectedAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewOutlookSendNode(&stubTokenResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"to": []any{"a@example.com"}, "subject": "hi", "body": "hello"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Outlook account")
	}
}

func TestOutlookSendNodeExecutePropagatesTokenResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewOutlookSendNode(&stubTokenResolver{err: errors.New("boom")})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"to": []any{"a@example.com"}, "subject": "hi", "body": "hello"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the token resolver's error to propagate")
	}
}

func TestOutlookSendNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewOutlookSendNode(tokens)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when to/subject/body are missing")
	}
}

func TestOutlookSendNodeExecuteSendsMail(t *testing.T) {
	env := newTestEnv(t)
	var gotPath string
	graph := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.WriteHeader(http.StatusAccepted)
	}))
	t.Cleanup(graph.Close)
	restore := coremsgraph.SetBaseURLForTesting(graph.URL)
	t.Cleanup(restore)

	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewOutlookSendNode(tokens)

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"to": []any{"a@example.com"}, "subject": "hi", "body": "hello"}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["sent"] != true {
		t.Fatalf("unexpected output: %+v", items)
	}
	if gotPath != "/me/sendMail" {
		t.Fatalf("expected POST to /me/sendMail, got %q", gotPath)
	}
	if len(tokens.calls) != 1 || tokens.calls[0] != env.orgID+":outlook:user-1" {
		t.Fatalf("expected AccessTokenForUser to be called once for org/outlook/user-1, got %v", tokens.calls)
	}
}
