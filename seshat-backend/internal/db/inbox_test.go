package db

import (
	"context"
	"testing"
	"time"
)

func TestChannelAccountStore_CreateConnectAndGetSecret(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "inbox-connect@example.com")

	store, err := NewChannelAccountStore(database)
	if err != nil {
		t.Fatalf("NewChannelAccountStore: %v", err)
	}

	account, err := store.Create(ctx, CreateChannelAccountParams{
		UserID:  user.ID,
		Channel: ChannelGmail,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if account.Status != ChannelAccountStatusPending {
		t.Fatalf("expected pending status, got %q", account.Status)
	}

	connected, err := store.UpdateConnected(ctx, UpdateChannelAccountConnectedParams{
		ID:                account.ID,
		DisplayName:       "friend@restaurant.com",
		ExternalAccountID: "friend@restaurant.com",
		AccessToken:       "access-secret",
		RefreshToken:      "refresh-secret",
		Scope:             "gmail.readonly gmail.send",
		ExpiresAt:         time.Now().Add(time.Hour),
	})
	if err != nil {
		t.Fatalf("UpdateConnected: %v", err)
	}
	if connected.Status != ChannelAccountStatusConnected {
		t.Fatalf("expected connected status, got %q", connected.Status)
	}
	if !connected.HasRefreshToken {
		t.Fatal("expected HasRefreshToken to be true")
	}

	secret, err := store.GetSecret(ctx, account.ID)
	if err != nil {
		t.Fatalf("GetSecret: %v", err)
	}
	if secret.AccessToken != "access-secret" || secret.RefreshToken != "refresh-secret" {
		t.Fatalf("expected round-tripped decrypted secrets, got %+v", secret)
	}

	accounts, err := store.ListByUserID(ctx, user.ID)
	if err != nil {
		t.Fatalf("ListByUserID: %v", err)
	}
	if len(accounts) != 1 || accounts[0].ID != account.ID {
		t.Fatalf("expected 1 account for user, got %+v", accounts)
	}
}

func TestChannelAccountStore_UpdateSyncStateAndStatus(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "inbox-sync@example.com")

	store, err := NewChannelAccountStore(database)
	if err != nil {
		t.Fatalf("NewChannelAccountStore: %v", err)
	}
	account, err := store.Create(ctx, CreateChannelAccountParams{UserID: user.ID, Channel: ChannelWhatsApp})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := store.UpdateSyncState(ctx, UpdateChannelAccountSyncParams{
		ID:           account.ID,
		SyncCursor:   "cursor-123",
		LastSyncedAt: time.Now(),
	}); err != nil {
		t.Fatalf("UpdateSyncState: %v", err)
	}
	refreshed, err := store.GetByID(ctx, account.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if refreshed.SyncCursor != "cursor-123" {
		t.Fatalf("expected sync cursor to persist, got %q", refreshed.SyncCursor)
	}

	if err := store.UpdateStatus(ctx, account.ID, ChannelAccountStatusError, "session expired"); err != nil {
		t.Fatalf("UpdateStatus: %v", err)
	}
	refreshed, err = store.GetByID(ctx, account.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if refreshed.Status != ChannelAccountStatusError || refreshed.LastError != "session expired" {
		t.Fatalf("expected error status with message, got %+v", refreshed)
	}
}

func TestInboxContactStore_UpsertIsIdempotentAndRefreshesName(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()
	store, err := NewInboxContactStore(database)
	if err != nil {
		t.Fatalf("NewInboxContactStore: %v", err)
	}

	c1, err := store.Upsert(ctx, UpsertContactParams{
		ChannelAccountID: "chacc_1",
		ExternalID:       "+15551234",
		DisplayName:      "Restaurant Owner",
	})
	if err != nil {
		t.Fatalf("Upsert: %v", err)
	}

	c2, err := store.Upsert(ctx, UpsertContactParams{
		ChannelAccountID: "chacc_1",
		ExternalID:       "+15551234",
		DisplayName:      "Restaurant Owner (Updated)",
	})
	if err != nil {
		t.Fatalf("Upsert (second): %v", err)
	}
	if c1.ID != c2.ID {
		t.Fatalf("expected same contact ID on re-upsert, got %q vs %q", c1.ID, c2.ID)
	}
	if c2.DisplayName != "Restaurant Owner (Updated)" {
		t.Fatalf("expected refreshed display name, got %q", c2.DisplayName)
	}
}

func TestInboxThreadStore_UpsertCreatesThenReopensOnNewMessage(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()
	store, err := NewInboxThreadStore(database)
	if err != nil {
		t.Fatalf("NewInboxThreadStore: %v", err)
	}

	t1, err := store.Upsert(ctx, UpsertThreadParams{
		ChannelAccountID: "chacc_1",
		ExternalThreadID: "ext-thread-1",
		Subject:          "Table for 4 tonight?",
		LastMessageAt:    time.Now(),
	})
	if err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if t1.Status != InboxThreadStatusOpen {
		t.Fatalf("expected new thread to start open, got %q", t1.Status)
	}

	if err := store.UpdateStatus(ctx, t1.ID, InboxThreadStatusHandled); err != nil {
		t.Fatalf("UpdateStatus: %v", err)
	}

	t2, err := store.Upsert(ctx, UpsertThreadParams{
		ChannelAccountID: "chacc_1",
		ExternalThreadID: "ext-thread-1",
		LastMessageAt:    time.Now().Add(time.Minute),
	})
	if err != nil {
		t.Fatalf("Upsert (reopen): %v", err)
	}
	if t2.ID != t1.ID {
		t.Fatalf("expected same thread ID, got %q vs %q", t1.ID, t2.ID)
	}
	if t2.Status != InboxThreadStatusOpen {
		t.Fatalf("expected a new message to reopen a handled thread, got %q", t2.Status)
	}
}

func TestInboxThreadStore_UpsertDoesNotReopenSnoozedThread(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()
	store, err := NewInboxThreadStore(database)
	if err != nil {
		t.Fatalf("NewInboxThreadStore: %v", err)
	}

	thread, err := store.Upsert(ctx, UpsertThreadParams{
		ChannelAccountID: "chacc_1",
		ExternalThreadID: "ext-thread-2",
		LastMessageAt:    time.Now(),
	})
	if err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if err := store.UpdateStatus(ctx, thread.ID, InboxThreadStatusSnoozed); err != nil {
		t.Fatalf("UpdateStatus: %v", err)
	}

	reUpserted, err := store.Upsert(ctx, UpsertThreadParams{
		ChannelAccountID: "chacc_1",
		ExternalThreadID: "ext-thread-2",
		LastMessageAt:    time.Now().Add(time.Minute),
	})
	if err != nil {
		t.Fatalf("Upsert (again): %v", err)
	}
	if reUpserted.Status != InboxThreadStatusSnoozed {
		t.Fatalf("expected snoozed status to be preserved, got %q", reUpserted.Status)
	}
}

func TestInboxMessageStore_CreateIsIdempotentByExternalID(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()
	threadStore, err := NewInboxThreadStore(database)
	if err != nil {
		t.Fatalf("NewInboxThreadStore: %v", err)
	}
	messageStore, err := NewInboxMessageStore(database)
	if err != nil {
		t.Fatalf("NewInboxMessageStore: %v", err)
	}

	thread, err := threadStore.Upsert(ctx, UpsertThreadParams{
		ChannelAccountID: "chacc_1",
		ExternalThreadID: "ext-thread-3",
		LastMessageAt:    time.Now(),
	})
	if err != nil {
		t.Fatalf("Upsert thread: %v", err)
	}

	m1, err := messageStore.Create(ctx, CreateMessageParams{
		ThreadID:          thread.ID,
		ChannelAccountID:  "chacc_1",
		ExternalMessageID: "ext-msg-1",
		Direction:         InboxMessageDirectionInbound,
		BodyText:          "Is there space for 4 tonight?",
		SentAt:            time.Now(),
	})
	if err != nil {
		t.Fatalf("Create message: %v", err)
	}

	m2, err := messageStore.Create(ctx, CreateMessageParams{
		ThreadID:          thread.ID,
		ChannelAccountID:  "chacc_1",
		ExternalMessageID: "ext-msg-1",
		Direction:         InboxMessageDirectionInbound,
		BodyText:          "Is there space for 4 tonight?",
		SentAt:            time.Now(),
	})
	if err != nil {
		t.Fatalf("Create message (re-sync): %v", err)
	}
	if m1.ID != m2.ID {
		t.Fatalf("expected the same message ID on re-sync, got %q vs %q", m1.ID, m2.ID)
	}

	messages, err := messageStore.ListByThreadID(ctx, thread.ID)
	if err != nil {
		t.Fatalf("ListByThreadID: %v", err)
	}
	if len(messages) != 1 {
		t.Fatalf("expected exactly 1 message despite re-sync, got %d", len(messages))
	}
}

func TestInboxThreadStore_ListByUserIDJoinsChannelAccounts(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "inbox-list@example.com")

	accountStore, err := NewChannelAccountStore(database)
	if err != nil {
		t.Fatalf("NewChannelAccountStore: %v", err)
	}
	account, err := accountStore.Create(ctx, CreateChannelAccountParams{UserID: user.ID, Channel: ChannelGmail})
	if err != nil {
		t.Fatalf("Create account: %v", err)
	}

	threadStore, err := NewInboxThreadStore(database)
	if err != nil {
		t.Fatalf("NewInboxThreadStore: %v", err)
	}
	if _, err := threadStore.Upsert(ctx, UpsertThreadParams{
		ChannelAccountID: account.ID,
		ExternalThreadID: "ext-thread-4",
		Subject:          "Reservation request",
		LastMessageAt:    time.Now(),
	}); err != nil {
		t.Fatalf("Upsert thread: %v", err)
	}

	threads, err := threadStore.ListByUserID(ctx, user.ID, "", 10)
	if err != nil {
		t.Fatalf("ListByUserID: %v", err)
	}
	if len(threads) != 1 || threads[0].Subject != "Reservation request" {
		t.Fatalf("expected 1 thread for user via channel account join, got %+v", threads)
	}

	openThreads, err := threadStore.ListByUserID(ctx, user.ID, InboxThreadStatusOpen, 10)
	if err != nil {
		t.Fatalf("ListByUserID (status filter): %v", err)
	}
	if len(openThreads) != 1 {
		t.Fatalf("expected 1 open thread, got %d", len(openThreads))
	}
	handledThreads, err := threadStore.ListByUserID(ctx, user.ID, InboxThreadStatusHandled, 10)
	if err != nil {
		t.Fatalf("ListByUserID (handled filter): %v", err)
	}
	if len(handledThreads) != 0 {
		t.Fatalf("expected 0 handled threads, got %d", len(handledThreads))
	}
}
