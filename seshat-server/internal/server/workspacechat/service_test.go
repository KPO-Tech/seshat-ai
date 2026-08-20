package workspacechat

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/KPO-Tech/seshat/pkg/sdk"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/apperr"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mcpregistry"
)

func noopEmit(Event) {}

func TestStreamChatRequiresAllParams(t *testing.T) {
	env := newTestEnv(t)

	base := StreamChatParams{
		SessionID:      "sess-1",
		OrganizationID: env.orgID,
		Provider:       "openai",
		Model:          "gpt-test",
		Message:        "hello",
	}

	cases := []struct {
		name   string
		mutate func(p StreamChatParams) StreamChatParams
	}{
		{"missing session id", func(p StreamChatParams) StreamChatParams { p.SessionID = ""; return p }},
		{"missing organization id", func(p StreamChatParams) StreamChatParams { p.OrganizationID = ""; return p }},
		{"missing provider", func(p StreamChatParams) StreamChatParams { p.Provider = ""; return p }},
		{"missing model", func(p StreamChatParams) StreamChatParams { p.Model = ""; return p }},
		{"missing message", func(p StreamChatParams) StreamChatParams { p.Message = ""; return p }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := env.chat.StreamChat(context.Background(), env.adminPrincipal, tc.mutate(base), noopEmit)
			if !errors.Is(err, apperr.InvalidInput("")) {
				t.Fatalf("expected invalid-input error, got %v", err)
			}
		})
	}
}

// TestResolveMCPServersConvertsResolvedConfigs proves the field mapping
// from mcpregistry.ResolvedMCPServerConfig to sdk.MCPServerConfig - the
// piece getOrCreateSession relies on to populate sdk.ClientConfig.MCPServers
// and to feed sdk.Client.ReloadMCPServers on every message. Tested directly
// rather than through the full getOrCreateSession/StreamChat path: this
// test suite's own newTestEnv doc comment already establishes that no
// provider is configured by default, so getOrCreateSession never reaches
// sdk.NewClient in any existing test - resolveMCPServers has no such
// dependency (it only calls mcpRegistry.ResolveServerConfigs), so it's
// testable in isolation without faking the LLM provider boundary too.
func TestResolveMCPServersConvertsResolvedConfigs(t *testing.T) {
	// mcpregistry encrypts Headers under the organization's DEK - see
	// sdb.EncryptSecret, which needs a master key configured.
	t.Setenv("SESHAT_SERVER_ENCRYPTION_KEY", "g/t9EsDxTTJSTu6Q+Kne06PBHoGmhH3yAJaEuHmFl9A=")
	env := newTestEnv(t)

	// No servers configured yet - must return an empty/nil slice, not error
	// or panic.
	if servers := env.chat.resolveMCPServers(context.Background(), env.adminPrincipal, env.orgID); len(servers) != 0 {
		t.Fatalf("expected no servers before any are configured, got %+v", servers)
	}

	if _, err := env.mcpRegistry.CreateServerConfig(context.Background(), env.adminPrincipal, mcpregistry.CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "jira", ServerType: "http", URL: "https://mcp.example.com/jira",
		Headers: map[string]string{"Authorization": "Bearer static-token"}, TimeoutSecs: 45,
	}); err != nil {
		t.Fatalf("create server config: %v", err)
	}

	servers := env.chat.resolveMCPServers(context.Background(), env.adminPrincipal, env.orgID)
	if len(servers) != 1 {
		t.Fatalf("expected exactly one resolved server, got %+v", servers)
	}
	got := servers[0]
	if got.Name != "jira" || got.URL != "https://mcp.example.com/jira" {
		t.Fatalf("unexpected name/url: %+v", got)
	}
	if got.Transport != sdk.MCPTransportType("http") {
		t.Fatalf("expected transport mapped from server_type, got %v", got.Transport)
	}
	if got.Headers["Authorization"] != "Bearer static-token" {
		t.Fatalf("expected headers to carry through, got %+v", got.Headers)
	}
	if got.Timeout != 45*time.Second {
		t.Fatalf("expected timeout_secs converted to a time.Duration, got %v", got.Timeout)
	}
}

func TestStreamChatRequiresAuthentication(t *testing.T) {
	env := newTestEnv(t)
	err := env.chat.StreamChat(context.Background(), nil, StreamChatParams{
		SessionID: "sess-1", OrganizationID: env.orgID, Provider: "openai", Model: "gpt-test", Message: "hi",
	}, noopEmit)
	if !errors.Is(err, apperr.Unauthorized("")) {
		t.Fatalf("expected unauthorized error, got %v", err)
	}
}

func TestStreamChatRejectsNonMember(t *testing.T) {
	env := newTestEnv(t)
	outsider := env.addOutsider(t)

	err := env.chat.StreamChat(context.Background(), outsider, StreamChatParams{
		SessionID: "sess-1", OrganizationID: env.orgID, Provider: "openai", Model: "gpt-test", Message: "hi",
	}, noopEmit)
	if !errors.Is(err, apperr.Forbidden("")) {
		t.Fatalf("expected forbidden error for a non-member, got %v", err)
	}
}

// TestStreamChatFailsCleanlyWithNoProviderConfigured exercises the real
// getOrCreateSession path up to (but not through) an actual LLM call: no
// provider credentials exist for this org, so automation.ResolveProviderSetting
// fails before any sdk.Client is ever created — see automation's own
// TestResolveProviderSettingNotFound for that failure mode in isolation.
func TestStreamChatFailsCleanlyWithNoProviderConfigured(t *testing.T) {
	env := newTestEnv(t)

	err := env.chat.StreamChat(context.Background(), env.adminPrincipal, StreamChatParams{
		SessionID: "sess-1", OrganizationID: env.orgID, Provider: "openai", Model: "gpt-test", Message: "hi",
	}, noopEmit)
	if err == nil {
		t.Fatal("expected an error when no provider credentials are configured")
	}
	if errors.Is(err, apperr.InvalidInput("")) || errors.Is(err, apperr.Forbidden("")) || errors.Is(err, apperr.Unauthorized("")) {
		t.Fatalf("expected a provider-resolution failure, not a validation/permission error: %v", err)
	}
}

func TestPersistTurnAndGetSessionRoundTrip(t *testing.T) {
	env := newTestEnv(t)
	params := StreamChatParams{SessionID: "sess-1", OrganizationID: env.orgID, Message: "What's the plan?"}
	events := []Event{{Type: EventTextDelta, Delta: "Here's the plan."}}

	env.chat.persistTurn(context.Background(), env.adminPrincipal, params, "Here's the plan.", events)

	history, err := env.chat.GetSession(context.Background(), env.adminPrincipal, "sess-1")
	if err != nil {
		t.Fatalf("get session: %v", err)
	}
	if history.Title != "What's the plan?" {
		t.Fatalf("unexpected title: %q", history.Title)
	}
	if len(history.Messages) != 2 {
		t.Fatalf("expected 2 messages (user + assistant), got %d", len(history.Messages))
	}
	if history.Messages[0].Role != "user" || history.Messages[0].Content != "What's the plan?" {
		t.Fatalf("unexpected user message: %+v", history.Messages[0])
	}
	if history.Messages[1].Role != "assistant" || history.Messages[1].Content != "Here's the plan." {
		t.Fatalf("unexpected assistant message: %+v", history.Messages[1])
	}
	if len(history.Messages[1].Events) != 1 || history.Messages[1].Events[0].Delta != "Here's the plan." {
		t.Fatalf("expected the assistant message's events to round-trip, got %+v", history.Messages[1].Events)
	}

	// A second turn on the same session appends rather than replacing.
	env.chat.persistTurn(context.Background(), env.adminPrincipal, StreamChatParams{SessionID: "sess-1", Message: "Thanks"}, "You're welcome.", nil)
	history, err = env.chat.GetSession(context.Background(), env.adminPrincipal, "sess-1")
	if err != nil {
		t.Fatalf("get session after second turn: %v", err)
	}
	if len(history.Messages) != 4 {
		t.Fatalf("expected 4 messages after a second turn, got %d", len(history.Messages))
	}
}

func TestGetSessionScopedToOwner(t *testing.T) {
	env := newTestEnv(t)
	other := env.addOutsider(t)

	env.chat.persistTurn(context.Background(), env.adminPrincipal, StreamChatParams{SessionID: "sess-1", Message: "hi"}, "hello", nil)

	if _, err := env.chat.GetSession(context.Background(), other, "sess-1"); !errors.Is(err, apperr.NotFound("")) {
		t.Fatalf("expected not-found for a session owned by a different user, got %v", err)
	}
	if _, err := env.chat.GetSession(context.Background(), env.adminPrincipal, "sess-1"); err != nil {
		t.Fatalf("expected the owner to load their own session: %v", err)
	}
}

func TestGetSessionRequiresSessionID(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.chat.GetSession(context.Background(), env.adminPrincipal, ""); !errors.Is(err, apperr.InvalidInput("")) {
		t.Fatalf("expected invalid-input for an empty session id, got %v", err)
	}
	if _, err := env.chat.GetSession(context.Background(), nil, "sess-1"); !errors.Is(err, apperr.Unauthorized("")) {
		t.Fatalf("expected unauthorized for a nil principal, got %v", err)
	}
}

func TestGetSessionExpiresPastRetentionWindow(t *testing.T) {
	env := newTestEnv(t)
	env.chat.persistTurn(context.Background(), env.adminPrincipal, StreamChatParams{SessionID: "sess-1", Message: "hi"}, "hello", nil)

	stale := time.Now().UTC().Add(-sessionRetention - time.Hour)
	if err := env.db.Gorm().Model(&sdb.WorkspaceChatSession{}).Where("id = ?", "sess-1").Update("updated_at", stale).Error; err != nil {
		t.Fatalf("backdate session: %v", err)
	}

	if _, err := env.chat.GetSession(context.Background(), env.adminPrincipal, "sess-1"); !errors.Is(err, apperr.NotFound("")) {
		t.Fatalf("expected a session past the retention window to read as not-found, got %v", err)
	}
}

func TestPurgeExpiredSessionsDeletesOnlyStaleOnes(t *testing.T) {
	env := newTestEnv(t)
	env.chat.persistTurn(context.Background(), env.adminPrincipal, StreamChatParams{SessionID: "fresh", Message: "hi"}, "hello", nil)
	env.chat.persistTurn(context.Background(), env.adminPrincipal, StreamChatParams{SessionID: "stale", Message: "hi"}, "hello", nil)

	stale := time.Now().UTC().Add(-sessionRetention - time.Hour)
	if err := env.db.Gorm().Model(&sdb.WorkspaceChatSession{}).Where("id = ?", "stale").Update("updated_at", stale).Error; err != nil {
		t.Fatalf("backdate stale session: %v", err)
	}

	env.chat.purgeExpiredSessions(context.Background())

	var sessions []sdb.WorkspaceChatSession
	if err := env.db.Gorm().Find(&sessions).Error; err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if len(sessions) != 1 || sessions[0].ID != "fresh" {
		t.Fatalf("expected only the fresh session to survive purge, got %+v", sessions)
	}

	var orphanMessages []sdb.WorkspaceChatMessageRecord
	if err := env.db.Gorm().Where("session_id = ?", "stale").Find(&orphanMessages).Error; err != nil {
		t.Fatalf("list stale messages: %v", err)
	}
	if len(orphanMessages) != 0 {
		t.Fatalf("expected the stale session's messages to be purged too, got %d", len(orphanMessages))
	}
}

func TestCleanupStartStop(t *testing.T) {
	env := newTestEnv(t)
	env.chat.persistTurn(context.Background(), env.adminPrincipal, StreamChatParams{SessionID: "stale", Message: "hi"}, "hello", nil)
	stale := time.Now().UTC().Add(-sessionRetention - time.Hour)
	if err := env.db.Gorm().Model(&sdb.WorkspaceChatSession{}).Where("id = ?", "stale").Update("updated_at", stale).Error; err != nil {
		t.Fatalf("backdate stale session: %v", err)
	}

	cleanup := NewCleanup(env.chat, time.Hour)
	cleanup.Start()
	cleanup.Stop() // blocks until the loop goroutine exits

	var sessions []sdb.WorkspaceChatSession
	if err := env.db.Gorm().Find(&sessions).Error; err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if len(sessions) != 0 {
		t.Fatalf("expected Start's immediate sweep to purge the stale session before Stop returns, got %+v", sessions)
	}
}

func TestTruncate(t *testing.T) {
	if got := truncate("hello", 10); got != "hello" {
		t.Fatalf("expected short strings unchanged, got %q", got)
	}
	if got := truncate("hello world", 5); got != "hello…" {
		t.Fatalf("expected truncation with ellipsis, got %q", got)
	}
}

func TestToToolProgressEvent(t *testing.T) {
	progress := sdk.ToolProgress{
		ToolName:  "web_search",
		ToolUseID: "tu_1",
		Stage:     "completed",
		Message:   "searched",
		Metadata: map[string]any{
			"tool_input": map[string]any{"query": "seshat os"},
			"content":    "a very long result body that should be truncated for the summary field",
		},
	}
	event := toToolProgressEvent(progress)
	if event.Name != "web_search" || event.ToolUseID != "tu_1" || event.Stage != "completed" {
		t.Fatalf("unexpected base fields: %+v", event)
	}
	if event.Query != "seshat os" {
		t.Fatalf("expected query extracted from tool_input metadata, got %q", event.Query)
	}
	if event.Summary != "a very long result body that should be truncated for the summary field" {
		t.Fatalf("expected content metadata to become the summary, got %q", event.Summary)
	}
}

func TestParseWebSearchData(t *testing.T) {
	type result struct {
		Title, URL, Description, Source string
	}
	data := struct {
		Query   string
		Results []result
	}{
		Query: "seshat os",
		Results: []result{
			{Title: "Seshat", URL: "https://example.com", Description: "desc", Source: "web"},
		},
	}

	trace, ok := parseWebSearchData(data)
	if !ok {
		t.Fatal("expected parseWebSearchData to accept a well-formed payload")
	}
	if trace.Query != "seshat os" || trace.Count != 1 || trace.Results[0].Title != "Seshat" {
		t.Fatalf("unexpected trace: %+v", trace)
	}

	if _, ok := parseWebSearchData(nil); ok {
		t.Fatal("expected parseWebSearchData to reject nil data")
	}
	empty := struct {
		Query   string
		Results []result
	}{}
	if _, ok := parseWebSearchData(empty); ok {
		t.Fatal("expected parseWebSearchData to reject an empty query with no results")
	}
}
