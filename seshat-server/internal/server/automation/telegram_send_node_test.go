package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// newFakeTelegramServer serves just enough of the Telegram Bot API for
// telegram_send_message's sendMessage call to succeed - the bot token is
// part of the URL path itself (Telegram's own convention), asserted here.
func newFakeTelegramServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /bottoken-fake/sendMessage", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"result": map[string]any{"message_id": 42}})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestTelegramSendMessageNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewTelegramSendMessageNode(&stubStaticSecretResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestTelegramSendMessageNodeExecuteRequiresConnectedAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewTelegramSendMessageNode(&stubStaticSecretResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"chatId": "123", "text": "hi"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Telegram bot")
	}
}

func TestTelegramSendMessageNodeExecutePropagatesSecretResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewTelegramSendMessageNode(&stubStaticSecretResolver{err: errors.New("boom")})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"chatId": "123", "text": "hi"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the secret resolver's error to propagate")
	}
}

func TestTelegramSendMessageNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	secrets := &stubStaticSecretResolver{secretsByUser: map[string]string{"user-1": "token-fake"}}
	n := NewTelegramSendMessageNode(secrets)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when chatId/text are missing")
	}
}

func TestTelegramSendMessageNodeExecuteSendsAndReturnsMessageID(t *testing.T) {
	env := newTestEnv(t)
	server := newFakeTelegramServer(t)
	secrets := &stubStaticSecretResolver{secretsByUser: map[string]string{"user-1": "token-fake"}}
	n := NewTelegramSendMessageNode(secrets)
	n.baseURL = server.URL

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"chatId": "123", "text": "hi"}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["message_id"] != 42 {
		t.Fatalf("unexpected output: %+v", items)
	}
	if len(secrets.calls) != 1 || secrets.calls[0] != env.orgID+":telegram:user-1" {
		t.Fatalf("expected StaticSecretForUser to be called once for org/telegram/user-1, got %v", secrets.calls)
	}
}
