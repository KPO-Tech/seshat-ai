package inbox_test

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inbox"
)

// fakeConnector is a scripted Connector - each test controls exactly what
// Sync returns and asserts on what Send was called with, without touching
// any real external API.
type fakeConnector struct {
	channel string

	syncMessages []inbox.NormalizedMessage
	syncCursor   string
	syncErr      error
	syncCalls    int

	sendExternalMessageID string
	sendErr               error
	lastSendThreadID      string
	lastSendContactID     string
	lastSendBody          string
	sendCalls             int
}

func (f *fakeConnector) Channel() string { return f.channel }

func (f *fakeConnector) Sync(_ context.Context, _ *inbox.ChannelAccount, _ inbox.ConnectorSecret) ([]inbox.NormalizedMessage, string, error) {
	f.syncCalls++
	if f.syncErr != nil {
		return nil, "", f.syncErr
	}
	return f.syncMessages, f.syncCursor, nil
}

func (f *fakeConnector) Send(_ context.Context, _ *inbox.ChannelAccount, _ inbox.ConnectorSecret, externalThreadID, contactExternalID, body string) (string, error) {
	f.sendCalls++
	f.lastSendThreadID = externalThreadID
	f.lastSendContactID = contactExternalID
	f.lastSendBody = body
	if f.sendErr != nil {
		return "", f.sendErr
	}
	if f.sendExternalMessageID != "" {
		return f.sendExternalMessageID, nil
	}
	return "sent-" + externalThreadID, nil
}

func openTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	require.NoError(t, err, "open test db")
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

func connectTestAccount(t *testing.T, svc *inbox.Service, principal *backendauth.Principal, channel string) *inbox.ChannelAccount {
	t.Helper()
	account, err := svc.ConnectAccount(context.Background(), principal, inbox.ConnectAccountParams{
		Channel:           channel,
		DisplayName:       "Test Account",
		ExternalAccountID: "test@example.com",
		AccessToken:       "access-token",
		RefreshToken:      "refresh-token",
		ExpiresAt:         time.Now().Add(time.Hour),
	})
	require.NoError(t, err)
	return account
}

func TestService_ConnectAccountAndList(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")

	account := connectTestAccount(t, svc, principal, inbox.ChannelGmail)
	require.Equal(t, inbox.AccountStatusConnected, account.Status)
	require.True(t, account.HasRefreshToken)

	accounts, err := svc.ListAccounts(context.Background(), principal)
	require.NoError(t, err)
	require.Len(t, accounts, 1)
	require.Equal(t, account.ID, accounts[0].ID)
}

func TestService_SyncAccountPersistsNormalizedMessages(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelWhatsApp)

	connector := &fakeConnector{
		channel:    inbox.ChannelWhatsApp,
		syncCursor: "cursor-after-1",
		syncMessages: []inbox.NormalizedMessage{
			{
				ExternalThreadID:   "wa-thread-1",
				ExternalMessageID:  "wa-msg-1",
				Direction:          inbox.MessageDirectionInbound,
				ContactExternalID:  "+15551234",
				ContactDisplayName: "Restaurant Regular",
				BodyText:           "Table for 4 tonight?",
				SentAt:             time.Now(),
			},
		},
	}
	svc.RegisterConnector(connector)

	n, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)
	require.Equal(t, 1, n)
	require.Equal(t, 1, connector.syncCalls)

	threads, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{})
	require.NoError(t, err)
	require.Len(t, threads, 1)
	require.Equal(t, "Restaurant Regular", threads[0].Contact.DisplayName)
	require.Equal(t, inbox.ChannelWhatsApp, threads[0].Channel)

	thread, messages, err := svc.GetThread(context.Background(), principal, threads[0].ID)
	require.NoError(t, err)
	require.Equal(t, inbox.ThreadStatusOpen, thread.Status)
	require.Len(t, messages, 1)
	require.Equal(t, "Table for 4 tonight?", messages[0].BodyText)

	accounts, err := svc.ListAccounts(context.Background(), principal)
	require.NoError(t, err)
	require.Equal(t, "", accounts[0].LastError)
}

func TestService_SyncAccountIsIdempotentAcrossRuns(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelGmail)

	msg := inbox.NormalizedMessage{
		ExternalThreadID:   "gmail-thread-1",
		ExternalMessageID:  "gmail-msg-1",
		Direction:          inbox.MessageDirectionInbound,
		ContactExternalID:  "client@example.com",
		ContactDisplayName: "Client",
		ThreadSubject:      "Reservation",
		BodyText:           "Can I book a table?",
		SentAt:             time.Now(),
	}
	connector := &fakeConnector{channel: inbox.ChannelGmail, syncMessages: []inbox.NormalizedMessage{msg}}
	svc.RegisterConnector(connector)

	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)
	// Simulate a cursor reset / re-delivery: the connector returns the exact
	// same message again on a second sync.
	_, err = svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)

	threads, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{})
	require.NoError(t, err)
	require.Len(t, threads, 1, "expected exactly one thread despite two syncs")

	_, messages, err := svc.GetThread(context.Background(), principal, threads[0].ID)
	require.NoError(t, err)
	require.Len(t, messages, 1, "expected exactly one message despite re-syncing the same external ID")
}

func TestService_SendReplyCallsConnectorAndMarksThreadHandled(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelWhatsApp)

	connector := &fakeConnector{
		channel: inbox.ChannelWhatsApp,
		syncMessages: []inbox.NormalizedMessage{{
			ExternalThreadID:   "wa-thread-1",
			ExternalMessageID:  "wa-msg-1",
			Direction:          inbox.MessageDirectionInbound,
			ContactExternalID:  "+15551234",
			ContactDisplayName: "Restaurant Regular",
			BodyText:           "Table for 4 tonight?",
			SentAt:             time.Now(),
		}},
	}
	svc.RegisterConnector(connector)
	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)

	threads, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{})
	require.NoError(t, err)
	require.Len(t, threads, 1)
	threadID := threads[0].ID

	sent, err := svc.SendReply(context.Background(), principal, inbox.SendReplyParams{
		ThreadID: threadID,
		Body:     "Yes, see you at 8pm!",
	})
	require.NoError(t, err)
	require.Equal(t, inbox.MessageDirectionOutbound, sent.Direction)
	require.False(t, sent.IsDraft)

	require.Equal(t, 1, connector.sendCalls)
	require.Equal(t, "wa-thread-1", connector.lastSendThreadID)
	require.Equal(t, "+15551234", connector.lastSendContactID)
	require.Equal(t, "Yes, see you at 8pm!", connector.lastSendBody)

	thread, messages, err := svc.GetThread(context.Background(), principal, threadID)
	require.NoError(t, err)
	require.Equal(t, inbox.ThreadStatusHandled, thread.Status)
	require.Len(t, messages, 2)
}

func TestService_SaveDraftDoesNotCallConnector(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelGmail)

	connector := &fakeConnector{
		channel: inbox.ChannelGmail,
		syncMessages: []inbox.NormalizedMessage{{
			ExternalThreadID:  "gmail-thread-1",
			ExternalMessageID: "gmail-msg-1",
			Direction:         inbox.MessageDirectionInbound,
			ContactExternalID: "client@example.com",
			ThreadSubject:     "Reservation",
			BodyText:          "Can I book a table?",
			SentAt:            time.Now(),
		}},
	}
	svc.RegisterConnector(connector)
	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)

	threads, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{})
	require.NoError(t, err)

	draft, err := svc.SaveDraft(context.Background(), principal, inbox.SendReplyParams{
		ThreadID: threads[0].ID,
		Body:     "Draft: yes, we have space.",
	})
	require.NoError(t, err)
	require.True(t, draft.IsDraft)
	require.Equal(t, 0, connector.sendCalls, "SaveDraft must never call the connector")

	thread, _, err := svc.GetThread(context.Background(), principal, threads[0].ID)
	require.NoError(t, err)
	require.Equal(t, inbox.ThreadStatusOpen, thread.Status, "a draft alone should not change thread status")
}

func TestService_OwnershipIsEnforcedAcrossUsers(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	owner := testPrincipal("user-1")
	stranger := testPrincipal("user-2")
	account := connectTestAccount(t, svc, owner, inbox.ChannelGmail)

	_, err := svc.SyncAccount(context.Background(), stranger, account.ID)
	require.Error(t, err)
	require.Equal(t, bkerr.ErrorKindForbidden, bkerr.KindOf(err))

	_, err = svc.ListThreads(context.Background(), stranger, inbox.ListThreadsParams{})
	require.NoError(t, err) // stranger simply sees an empty list, not an error

	err = svc.DisconnectAccount(context.Background(), stranger, account.ID)
	require.Error(t, err)
	require.Equal(t, bkerr.ErrorKindForbidden, bkerr.KindOf(err))
}

func TestService_SyncAccountWithNoRegisteredConnectorFailsClearly(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelOutlook)

	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.Error(t, err)
	require.Equal(t, bkerr.ErrorKindUnavailable, bkerr.KindOf(err))
}

func TestService_SyncAccountConnectorErrorIsRecordedOnAccount(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelGmail)

	connector := &fakeConnector{channel: inbox.ChannelGmail, syncErr: fmt.Errorf("token expired")}
	svc.RegisterConnector(connector)

	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.Error(t, err)
	require.Equal(t, bkerr.ErrorKindBadGateway, bkerr.KindOf(err))

	accounts, err := svc.ListAccounts(context.Background(), principal)
	require.NoError(t, err)
	require.Contains(t, accounts[0].LastError, "token expired")
}
