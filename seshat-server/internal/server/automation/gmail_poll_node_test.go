package automation

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"golang.org/x/oauth2"
	"google.golang.org/api/option"

	coregmail "github.com/EngineerProjects/seshat-ai/seshat-core/gmail"
	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// stubTokenResolver mirrors mcpregistry's stubConnectorTokenResolver — a
// minimal ConnectorTokenResolver double keyed by userID.
type stubTokenResolver struct {
	tokensByUser map[string]string
	err          error
	calls        []string
}

func (r *stubTokenResolver) AccessTokenForUser(ctx context.Context, organizationID, kind, userID string) (string, bool, error) {
	r.calls = append(r.calls, organizationID+":"+kind+":"+userID)
	if r.err != nil {
		return "", false, r.err
	}
	token, ok := r.tokensByUser[userID]
	if !ok || token == "" {
		return "", false, nil
	}
	return token, true, nil
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

// newFakeGmailServer serves just enough of the Gmail API for a bootstrap
// Sync (empty cursor) to return one message - same endpoints exercised by
// seshat-core/gmail's own TestSyncBootstrapWhenCursorEmpty.
func newFakeGmailServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /gmail/v1/users/me/profile", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"historyId": "555"})
	})
	mux.HandleFunc("GET /gmail/v1/users/me/messages", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"messages": []map[string]string{{"id": "m1"}}})
	})
	mux.HandleFunc("GET /gmail/v1/users/me/messages/m1", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"id": "m1", "threadId": "t1", "internalDate": "1700000000000", "snippet": "hi",
			"payload": map[string]any{"mimeType": "text/plain", "headers": []map[string]string{
				{"name": "From", "value": "jane@example.com"},
				{"name": "To", "value": "me@example.com"},
				{"name": "Subject", "value": "Hello"},
			}},
		})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestGmailPollNodeExecuteRequiresJobContext(t *testing.T) {
	env := newTestEnv(t)
	n := NewGmailPollNode(env.db, &stubTokenResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestGmailPollNodeExecuteRequiresConnectedGmailAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewGmailPollNode(env.db, &stubTokenResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, nil)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Gmail account")
	}
}

func TestGmailPollNodeExecutePropagatesTokenResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewGmailPollNode(env.db, &stubTokenResolver{err: errors.New("boom")})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, nil)
	if err == nil {
		t.Fatal("expected the token resolver's error to propagate")
	}
}

func TestGmailPollNodeExecuteEmitsMessagesAndPersistsCursor(t *testing.T) {
	env := newTestEnv(t)
	server := newFakeGmailServer(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewGmailPollNode(env.db, tokens)
	n.newGmailClient = func(ctx context.Context, ts oauth2.TokenSource) (*coregmail.Client, error) {
		return coregmail.New(ctx, ts, option.WithEndpoint(server.URL))
	}

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, nil)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 {
		t.Fatalf("expected one item, got %d: %+v", len(items), items)
	}
	if items[0]["id"] != "m1" || items[0]["subject"] != "Hello" {
		t.Fatalf("unexpected item: %+v", items[0])
	}
	if len(tokens.calls) != 1 || tokens.calls[0] != env.orgID+":gmail:user-1" {
		t.Fatalf("expected AccessTokenForUser to be called once for org/gmail/user-1, got %v", tokens.calls)
	}

	cursor, err := n.loadCursor(context.Background(), "job-1")
	if err != nil {
		t.Fatalf("loadCursor: %v", err)
	}
	if cursor != "555" {
		t.Fatalf("expected the persisted cursor to be the bootstrap historyId 555, got %q", cursor)
	}
}

func TestGmailPollNodeLoadCursorReturnsEmptyOnFirstRun(t *testing.T) {
	env := newTestEnv(t)
	n := NewGmailPollNode(env.db, &stubTokenResolver{})
	cursor, err := n.loadCursor(context.Background(), "unseen-job")
	if err != nil {
		t.Fatalf("loadCursor: %v", err)
	}
	if cursor != "" {
		t.Fatalf("expected an empty cursor for a job with no prior run, got %q", cursor)
	}
}

func TestGmailPollNodeSaveCursorUpsertsOnConflict(t *testing.T) {
	env := newTestEnv(t)
	n := NewGmailPollNode(env.db, &stubTokenResolver{})
	if err := n.saveCursor(context.Background(), "job-1", "cursor-a"); err != nil {
		t.Fatalf("saveCursor: %v", err)
	}
	if err := n.saveCursor(context.Background(), "job-1", "cursor-b"); err != nil {
		t.Fatalf("saveCursor (overwrite): %v", err)
	}
	cursor, err := n.loadCursor(context.Background(), "job-1")
	if err != nil {
		t.Fatalf("loadCursor: %v", err)
	}
	if cursor != "cursor-b" {
		t.Fatalf("expected the second saveCursor call to overwrite the first, got %q", cursor)
	}
}
