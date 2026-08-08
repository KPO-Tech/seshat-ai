package inboxtool_test

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inbox"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inboxtool"
	"github.com/KPO-Tech/seshat/pkg/tools"
)

// fakeConnector lets tests seed a thread/message without a real Gmail or
// WhatsApp connection - mirrors internal/inbox/service_test.go's own fake.
type fakeConnector struct {
	channel      string
	syncMessages []inbox.NormalizedMessage
	sendCalls    int
}

func (f *fakeConnector) Channel() string { return f.channel }
func (f *fakeConnector) Sync(_ context.Context, _ *inbox.ChannelAccount, _ inbox.ConnectorSecret) ([]inbox.NormalizedMessage, string, error) {
	return f.syncMessages, "cursor-1", nil
}
func (f *fakeConnector) Send(_ context.Context, _ *inbox.ChannelAccount, _ inbox.ConnectorSecret, _, _, _ string) (string, error) {
	f.sendCalls++
	return "sent-1", nil
}

func openTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	require.NoError(t, err)
	t.Cleanup(func() { _ = database.Close() })
	return database
}

func newTestService(t *testing.T, database *db.DB) *inbox.Service {
	t.Helper()
	accounts, err := db.NewChannelAccountStore(database)
	require.NoError(t, err)
	contacts, err := db.NewInboxContactStore(database)
	require.NoError(t, err)
	threads, err := db.NewInboxThreadStore(database)
	require.NoError(t, err)
	messages, err := db.NewInboxMessageStore(database)
	require.NoError(t, err)
	return inbox.NewService(accounts, contacts, threads, messages)
}

func testPrincipal(userID string) *backendauth.Principal {
	return &backendauth.Principal{User: backendauth.User{ID: userID}, Roles: []string{"member"}}
}

// seedThread connects a WhatsApp account and syncs one inbound message
// through it, returning the resulting thread ID - the common setup every
// tool test in this file needs.
func seedThread(t *testing.T, svc *inbox.Service, principal *backendauth.Principal) string {
	t.Helper()
	ctx := context.Background()
	account, err := svc.ConnectAccount(ctx, principal, inbox.ConnectAccountParams{
		Channel:           inbox.ChannelWhatsApp,
		DisplayName:       "Restaurant WhatsApp",
		ExternalAccountID: "15559998888@s.whatsapp.net",
	})
	require.NoError(t, err)

	connector := &fakeConnector{
		channel: inbox.ChannelWhatsApp,
		syncMessages: []inbox.NormalizedMessage{{
			ExternalThreadID:   "15551234567@s.whatsapp.net",
			ExternalMessageID:  "wa-msg-1",
			Direction:          inbox.MessageDirectionInbound,
			ContactExternalID:  "15551234567@s.whatsapp.net",
			ContactDisplayName: "Restaurant Regular",
			BodyText:           "Table for 4 tonight?",
			SentAt:             time.Now(),
		}},
	}
	svc.RegisterConnector(connector)
	_, err = svc.SyncAccount(ctx, principal, account.ID)
	require.NoError(t, err)

	threads, _, err := svc.ListThreads(ctx, principal, inbox.ListThreadsParams{})
	require.NoError(t, err)
	require.Len(t, threads, 1)
	return threads[0].ID
}

func ctxWithPrincipal(principal *backendauth.Principal) context.Context {
	return backendauth.WithContext(context.Background(), principal)
}

func TestListThreadsTool_ReturnsSeededThread(t *testing.T) {
	svc := newTestService(t, openTestDB(t))
	principal := testPrincipal("user-1")
	seedThread(t, svc, principal)

	tool := inboxtool.NewListThreadsTool(svc)
	result, err := tool.Call(ctxWithPrincipal(principal), tools.CallInput{Parsed: map[string]any{}}, nil)
	require.NoError(t, err)
	require.Nil(t, result.Error)
	threads, ok := result.Data.([]inbox.Thread)
	require.True(t, ok)
	require.Len(t, threads, 1)
	require.Equal(t, "Restaurant Regular", threads[0].Contact.DisplayName)
}

func TestListThreadsTool_NoPrincipalReturnsError(t *testing.T) {
	svc := newTestService(t, openTestDB(t))
	tool := inboxtool.NewListThreadsTool(svc)
	result, err := tool.Call(context.Background(), tools.CallInput{Parsed: map[string]any{}}, nil)
	require.NoError(t, err)
	require.NotNil(t, result.Error)
}

func TestGetThreadTool_ReturnsMessageHistory(t *testing.T) {
	svc := newTestService(t, openTestDB(t))
	principal := testPrincipal("user-1")
	threadID := seedThread(t, svc, principal)

	tool := inboxtool.NewGetThreadTool(svc)
	result, err := tool.Call(ctxWithPrincipal(principal), tools.CallInput{
		Parsed: map[string]any{"thread_id": threadID},
	}, nil)
	require.NoError(t, err)
	require.Nil(t, result.Error)
	require.Contains(t, result.Content, "Table for 4 tonight?")
}

func TestListThreadsTool_OffsetAndTruncationNote(t *testing.T) {
	svc := newTestService(t, openTestDB(t))
	principal := testPrincipal("user-1")
	ctx := context.Background()
	account, err := svc.ConnectAccount(ctx, principal, inbox.ConnectAccountParams{
		Channel:           inbox.ChannelWhatsApp,
		DisplayName:       "Restaurant WhatsApp",
		ExternalAccountID: "15559998888@s.whatsapp.net",
	})
	require.NoError(t, err)
	connector := &fakeConnector{channel: inbox.ChannelWhatsApp}
	base := time.Now()
	for i := 0; i < 2; i++ {
		connector.syncMessages = append(connector.syncMessages, inbox.NormalizedMessage{
			ExternalThreadID:   fmt.Sprintf("wa-thread-tool-page-%d", i),
			ExternalMessageID:  fmt.Sprintf("wa-msg-tool-page-%d", i),
			Direction:          inbox.MessageDirectionInbound,
			ContactExternalID:  fmt.Sprintf("+1555%04d", i),
			ContactDisplayName: fmt.Sprintf("Contact %d", i),
			BodyText:           "hi",
			SentAt:             base.Add(time.Duration(i) * time.Minute),
		})
	}
	svc.RegisterConnector(connector)
	_, err = svc.SyncAccount(ctx, principal, account.ID)
	require.NoError(t, err)

	tool := inboxtool.NewListThreadsTool(svc)
	page1, err := tool.Call(ctxWithPrincipal(principal), tools.CallInput{
		Parsed: map[string]any{"limit": float64(1), "offset": float64(0)},
	}, nil)
	require.NoError(t, err)
	require.Nil(t, page1.Error)
	require.Contains(t, page1.Content, "more threads available")
	require.Contains(t, page1.Content, "offset=1")

	page2, err := tool.Call(ctxWithPrincipal(principal), tools.CallInput{
		Parsed: map[string]any{"limit": float64(1), "offset": float64(1)},
	}, nil)
	require.NoError(t, err)
	require.Nil(t, page2.Error)
	require.NotContains(t, page2.Content, "more threads available", "must not claim more exist once exhausted")
}

func TestGetThreadTool_MessageOffsetTruncationNote(t *testing.T) {
	svc := newTestService(t, openTestDB(t))
	principal := testPrincipal("user-1")
	ctx := context.Background()
	account, err := svc.ConnectAccount(ctx, principal, inbox.ConnectAccountParams{
		Channel:           inbox.ChannelWhatsApp,
		DisplayName:       "Restaurant WhatsApp",
		ExternalAccountID: "15559998888@s.whatsapp.net",
	})
	require.NoError(t, err)

	// 51 messages in one thread exceeds the fixed 50-message default page,
	// so the first page must flag that earlier history exists.
	connector := &fakeConnector{channel: inbox.ChannelWhatsApp}
	base := time.Now()
	for i := 0; i < 51; i++ {
		connector.syncMessages = append(connector.syncMessages, inbox.NormalizedMessage{
			ExternalThreadID:   "wa-thread-long",
			ExternalMessageID:  fmt.Sprintf("wa-msg-long-%d", i),
			Direction:          inbox.MessageDirectionInbound,
			ContactExternalID:  "15551234567@s.whatsapp.net",
			ContactDisplayName: "Restaurant Regular",
			BodyText:           fmt.Sprintf("message %d", i),
			SentAt:             base.Add(time.Duration(i) * time.Minute),
		})
	}
	svc.RegisterConnector(connector)
	_, err = svc.SyncAccount(ctx, principal, account.ID)
	require.NoError(t, err)

	threads, _, err := svc.ListThreads(ctx, principal, inbox.ListThreadsParams{})
	require.NoError(t, err)
	require.Len(t, threads, 1)

	tool := inboxtool.NewGetThreadTool(svc)
	page1, err := tool.Call(ctxWithPrincipal(principal), tools.CallInput{
		Parsed: map[string]any{"thread_id": threads[0].ID},
	}, nil)
	require.NoError(t, err)
	require.Nil(t, page1.Error)
	require.Contains(t, page1.Content, "earlier messages not shown")
	require.Contains(t, page1.Content, "message_offset=50")

	page2, err := tool.Call(ctxWithPrincipal(principal), tools.CallInput{
		Parsed: map[string]any{"thread_id": threads[0].ID, "message_offset": float64(50)},
	}, nil)
	require.NoError(t, err)
	require.Nil(t, page2.Error)
	require.NotContains(t, page2.Content, "earlier messages not shown", "must not claim more history once exhausted")
}

func TestGetThreadTool_MissingThreadIDReturnsError(t *testing.T) {
	svc := newTestService(t, openTestDB(t))
	principal := testPrincipal("user-1")
	tool := inboxtool.NewGetThreadTool(svc)
	result, err := tool.Call(ctxWithPrincipal(principal), tools.CallInput{Parsed: map[string]any{}}, nil)
	require.NoError(t, err)
	require.NotNil(t, result.Error)
}

func TestUpdateThreadStatusTool_ChangesStatus(t *testing.T) {
	svc := newTestService(t, openTestDB(t))
	principal := testPrincipal("user-1")
	threadID := seedThread(t, svc, principal)

	tool := inboxtool.NewUpdateThreadStatusTool(svc)
	result, err := tool.Call(ctxWithPrincipal(principal), tools.CallInput{
		Parsed: map[string]any{"thread_id": threadID, "status": inbox.ThreadStatusSnoozed},
	}, nil)
	require.NoError(t, err)
	require.Nil(t, result.Error)

	thread, _, _, err := svc.GetThread(context.Background(), principal, threadID, 0)
	require.NoError(t, err)
	require.Equal(t, inbox.ThreadStatusSnoozed, thread.Status)
}

func TestDraftReplyTool_SavesDraftWithoutSending(t *testing.T) {
	svc := newTestService(t, openTestDB(t))
	principal := testPrincipal("user-1")
	threadID := seedThread(t, svc, principal)

	tool := inboxtool.NewDraftReplyTool(svc)
	result, err := tool.Call(ctxWithPrincipal(principal), tools.CallInput{
		Parsed: map[string]any{"thread_id": threadID, "body": "Yes, see you at 8pm!"},
	}, nil)
	require.NoError(t, err)
	require.Nil(t, result.Error)

	msg, ok := result.Data.(inbox.Message)
	require.True(t, ok)
	require.True(t, msg.IsDraft)

	thread, messages, _, err := svc.GetThread(context.Background(), principal, threadID, 0)
	require.NoError(t, err)
	require.Equal(t, inbox.ThreadStatusOpen, thread.Status, "a draft alone should not mark the thread handled")
	require.Len(t, messages, 2)
}

func TestSendReplyTool_RequiresPermissionInDefinition(t *testing.T) {
	svc := newTestService(t, openTestDB(t))
	tool := inboxtool.NewSendReplyTool(svc)
	if !tool.Definition().RequiresPermission {
		t.Fatal("expected inbox_send_reply to require permission - it delivers a real, irreversible message")
	}
}

func TestSendReplyTool_SendsAndMarksThreadHandled(t *testing.T) {
	svc := newTestService(t, openTestDB(t))
	principal := testPrincipal("user-1")
	threadID := seedThread(t, svc, principal)

	tool := inboxtool.NewSendReplyTool(svc)
	result, err := tool.Call(ctxWithPrincipal(principal), tools.CallInput{
		Parsed: map[string]any{"thread_id": threadID, "body": "Yes, see you at 8pm!"},
	}, nil)
	require.NoError(t, err)
	require.Nil(t, result.Error)

	thread, messages, _, err := svc.GetThread(context.Background(), principal, threadID, 0)
	require.NoError(t, err)
	require.Equal(t, inbox.ThreadStatusHandled, thread.Status)
	require.Len(t, messages, 2)
}

func TestListAccountsTool_ReturnsConnectedAccount(t *testing.T) {
	svc := newTestService(t, openTestDB(t))
	principal := testPrincipal("user-1")
	seedThread(t, svc, principal)

	tool := inboxtool.NewListAccountsTool(svc)
	result, err := tool.Call(ctxWithPrincipal(principal), tools.CallInput{}, nil)
	require.NoError(t, err)
	require.Nil(t, result.Error)
	accounts, ok := result.Data.([]inbox.ChannelAccount)
	require.True(t, ok)
	require.Len(t, accounts, 1)
	require.Equal(t, inbox.ChannelWhatsApp, accounts[0].Channel)
}

func TestSearchContactsTool_FindsSeededContact(t *testing.T) {
	svc := newTestService(t, openTestDB(t))
	principal := testPrincipal("user-1")
	seedThread(t, svc, principal)

	accounts, err := svc.ListAccounts(context.Background(), principal)
	require.NoError(t, err)
	require.Len(t, accounts, 1)

	tool := inboxtool.NewSearchContactsTool(svc)
	result, err := tool.Call(ctxWithPrincipal(principal), tools.CallInput{
		Parsed: map[string]any{"channel_account_id": accounts[0].ID, "query": "Regular"},
	}, nil)
	require.NoError(t, err)
	require.Nil(t, result.Error)
	contacts, ok := result.Data.([]inbox.Contact)
	require.True(t, ok)
	require.Len(t, contacts, 1)
	require.Equal(t, "Restaurant Regular", contacts[0].DisplayName)
}

func TestSearchContactsTool_OwnershipIsEnforced(t *testing.T) {
	svc := newTestService(t, openTestDB(t))
	owner := testPrincipal("user-1")
	stranger := testPrincipal("user-2")
	seedThread(t, svc, owner)

	accounts, err := svc.ListAccounts(context.Background(), owner)
	require.NoError(t, err)

	tool := inboxtool.NewSearchContactsTool(svc)
	result, err := tool.Call(ctxWithPrincipal(stranger), tools.CallInput{
		Parsed: map[string]any{"channel_account_id": accounts[0].ID, "query": "Regular"},
	}, nil)
	require.NoError(t, err)
	require.NotNil(t, result.Error, "a stranger must not be able to search another user's contacts")
}

var (
	_ tools.Tool = (*inboxtool.ListThreadsTool)(nil)
	_ tools.Tool = (*inboxtool.GetThreadTool)(nil)
	_ tools.Tool = (*inboxtool.UpdateThreadStatusTool)(nil)
	_ tools.Tool = (*inboxtool.DraftReplyTool)(nil)
	_ tools.Tool = (*inboxtool.SendReplyTool)(nil)
	_ tools.Tool = (*inboxtool.ListAccountsTool)(nil)
	_ tools.Tool = (*inboxtool.SearchContactsTool)(nil)
)
