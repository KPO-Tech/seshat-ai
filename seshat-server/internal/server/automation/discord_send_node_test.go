package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// newFakeDiscordServer serves just enough of the Discord API for
// discord_send_message's channel message call to succeed, asserting the
// "Bot <token>" Authorization format Discord actually uses.
func newFakeDiscordServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /channels/chan-1/messages", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bot bot-token-fake" {
			http.Error(w, "missing/wrong Bot Authorization header", http.StatusUnauthorized)
			return
		}
		writeJSON(w, map[string]any{"id": "msg-1"})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestDiscordSendMessageNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewDiscordSendMessageNode(&stubStaticSecretResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestDiscordSendMessageNodeExecuteRequiresConnectedAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewDiscordSendMessageNode(&stubStaticSecretResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"channelId": "chan-1", "content": "hi"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Discord bot")
	}
}

func TestDiscordSendMessageNodeExecutePropagatesSecretResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewDiscordSendMessageNode(&stubStaticSecretResolver{err: errors.New("boom")})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"channelId": "chan-1", "content": "hi"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the secret resolver's error to propagate")
	}
}

func TestDiscordSendMessageNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	secrets := &stubStaticSecretResolver{secretsByUser: map[string]string{"user-1": "bot-token-fake"}}
	n := NewDiscordSendMessageNode(secrets)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when channelId/content are missing")
	}
}

func TestDiscordSendMessageNodeExecuteSendsAndReturnsMessageID(t *testing.T) {
	env := newTestEnv(t)
	server := newFakeDiscordServer(t)
	secrets := &stubStaticSecretResolver{secretsByUser: map[string]string{"user-1": "bot-token-fake"}}
	n := NewDiscordSendMessageNode(secrets)
	n.baseURL = server.URL

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"channelId": "chan-1", "content": "hi"}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["message_id"] != "msg-1" {
		t.Fatalf("unexpected output: %+v", items)
	}
	if len(secrets.calls) != 1 || secrets.calls[0] != env.orgID+":discord:user-1" {
		t.Fatalf("expected StaticSecretForUser to be called once for org/discord/user-1, got %v", secrets.calls)
	}
}
