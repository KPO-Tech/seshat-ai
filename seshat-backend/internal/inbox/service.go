// Package inbox implements the Inbox Agent's channel-agnostic core: a
// shared data model (channel accounts, threads, messages, contacts) plus a
// Connector interface each channel (Gmail, WhatsApp, ...) implements, so
// sync/send/triage logic lives in exactly one place regardless of how many
// channels exist.
package inbox

import (
	"context"
	"fmt"
	"strings"
	"time"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

type Service struct {
	accounts   *db.ChannelAccountStore
	contacts   *db.InboxContactStore
	threads    *db.InboxThreadStore
	messages   *db.InboxMessageStore
	connectors map[string]Connector
}

func NewService(
	accounts *db.ChannelAccountStore,
	contacts *db.InboxContactStore,
	threads *db.InboxThreadStore,
	messages *db.InboxMessageStore,
) *Service {
	return &Service{
		accounts:   accounts,
		contacts:   contacts,
		threads:    threads,
		messages:   messages,
		connectors: make(map[string]Connector),
	}
}

// RegisterConnector wires a channel implementation in. Call once per
// supported channel during startup (see config/bootstrap.go) - a channel
// with no registered connector can still be listed/browsed (its already-
// synced data doesn't disappear) but SyncAccount/SendReply on it fail
// clearly rather than silently no-op.
func (s *Service) RegisterConnector(c Connector) {
	if s == nil || c == nil {
		return
	}
	s.connectors[c.Channel()] = c
}

// ─── Channel accounts ───────────────────────────────────────────────────────

func (s *Service) ConnectAccount(ctx context.Context, principal *backendauth.Principal, params ConnectAccountParams) (*ChannelAccount, error) {
	if s == nil || s.accounts == nil {
		return nil, bkerr.Unavailable("inbox store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	channel := strings.TrimSpace(params.Channel)
	if channel == "" {
		return nil, bkerr.InvalidInput("channel is required", nil)
	}

	record, err := s.accounts.Create(ctx, db.CreateChannelAccountParams{
		UserID:            principal.User.ID,
		WorkspaceID:       params.WorkspaceID,
		Channel:           channel,
		DisplayName:       params.DisplayName,
		ExternalAccountID: params.ExternalAccountID,
	})
	if err != nil {
		return nil, bkerr.Internal("create channel account", err)
	}

	connected, err := s.accounts.UpdateConnected(ctx, db.UpdateChannelAccountConnectedParams{
		ID:                record.ID,
		DisplayName:       params.DisplayName,
		ExternalAccountID: params.ExternalAccountID,
		AccessToken:       params.AccessToken,
		RefreshToken:      params.RefreshToken,
		SessionState:      params.SessionState,
		Scope:             params.Scope,
		ExpiresAt:         params.ExpiresAt,
	})
	if err != nil {
		return nil, bkerr.Internal("connect channel account", err)
	}
	return accountFromDB(*connected), nil
}

func (s *Service) ListAccounts(ctx context.Context, principal *backendauth.Principal) ([]ChannelAccount, error) {
	if s == nil || s.accounts == nil {
		return nil, bkerr.Unavailable("inbox store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	records, err := s.accounts.ListByUserID(ctx, principal.User.ID)
	if err != nil {
		return nil, bkerr.Internal("list channel accounts", err)
	}
	out := make([]ChannelAccount, 0, len(records))
	for _, r := range records {
		out = append(out, *accountFromDB(r))
	}
	return out, nil
}

func (s *Service) DisconnectAccount(ctx context.Context, principal *backendauth.Principal, accountID string) error {
	account, err := s.getOwnedAccount(ctx, principal, accountID)
	if err != nil {
		return err
	}
	return s.accounts.UpdateStatus(ctx, account.ID, db.ChannelAccountStatusDisconnected, "")
}

// ListConnectedAccountsByChannel lists every connected account for a
// channel across all users - unscoped by design, for system-level startup
// work (e.g. reconnecting every already-paired WhatsApp device when the
// process starts), never for a user-facing endpoint.
func (s *Service) ListConnectedAccountsByChannel(ctx context.Context, channel string) ([]ChannelAccount, error) {
	if s == nil || s.accounts == nil {
		return nil, bkerr.Unavailable("inbox store not configured", nil)
	}
	records, err := s.accounts.ListByChannelAndStatus(ctx, channel, db.ChannelAccountStatusConnected)
	if err != nil {
		return nil, bkerr.Internal("list channel accounts", err)
	}
	out := make([]ChannelAccount, 0, len(records))
	for _, r := range records {
		out = append(out, *accountFromDB(r))
	}
	return out, nil
}

// MarkAccountError records a connector-level failure against an account
// outside the normal SyncAccount path (e.g. WhatsApp's Manager detecting a
// dropped/logged-out session from its own background event loop, not from
// a request-driven Sync call).
func (s *Service) MarkAccountError(ctx context.Context, accountID, status, lastError string) error {
	if s == nil || s.accounts == nil {
		return bkerr.Unavailable("inbox store not configured", nil)
	}
	return s.accounts.UpdateStatus(ctx, accountID, status, lastError)
}

// ─── Sync ────────────────────────────────────────────────────────────────────

// SyncAccount pulls new messages for one channel account through its
// registered Connector and persists them. Safe to call repeatedly/on a
// schedule (see internal/cloudautomation's job executor) - both the message
// store's Create and the thread store's Upsert are idempotent per external
// ID, so re-observing the same message twice is a no-op.
func (s *Service) SyncAccount(ctx context.Context, principal *backendauth.Principal, accountID string) (newMessages int, err error) {
	dbAccount, account, err := s.getOwnedAccountRecord(ctx, principal, accountID)
	if err != nil {
		return 0, err
	}
	connector, ok := s.connectors[account.Channel]
	if !ok {
		return 0, bkerr.Unavailable(fmt.Sprintf("no connector registered for channel %q", account.Channel), nil)
	}

	secret, err := s.accounts.GetSecret(ctx, account.ID)
	if err != nil {
		return 0, bkerr.Internal("load channel account secret", err)
	}

	normalized, nextCursor, syncErr := connector.Sync(ctx, account, ConnectorSecret{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		SessionState: secret.SessionState,
		ExpiresAt:    secret.ExpiresAt,
	})
	if syncErr != nil {
		_ = s.accounts.UpdateSyncState(ctx, db.UpdateChannelAccountSyncParams{
			ID:           account.ID,
			SyncCursor:   dbAccount.SyncCursor,
			LastSyncedAt: dbAccount.LastSyncedAt,
			LastError:    syncErr.Error(),
		})
		return 0, bkerr.BadGateway(fmt.Sprintf("sync failed for channel %q", account.Channel), syncErr)
	}

	for _, m := range normalized {
		if err := s.persistNormalizedMessage(ctx, account.ID, m); err != nil {
			return newMessages, bkerr.Internal("persist synced message", err)
		}
		newMessages++
	}

	if err := s.accounts.UpdateSyncState(ctx, db.UpdateChannelAccountSyncParams{
		ID:           account.ID,
		SyncCursor:   nextCursor,
		LastSyncedAt: time.Now(),
		LastError:    "",
	}); err != nil {
		return newMessages, bkerr.Internal("update sync state", err)
	}
	return newMessages, nil
}

// IngestMessage persists one already-normalized message directly, without
// going through SyncAccount/Connector.Sync - for push-based channels (e.g.
// WhatsApp via whatsmeow) whose connector keeps a live connection and
// receives messages as they happen instead of being polled. accountID must
// already be a valid, connected channel account; there is no principal
// here because the caller is the channel's own persistent event handler,
// not an HTTP request.
func (s *Service) IngestMessage(ctx context.Context, accountID string, m NormalizedMessage) error {
	if s == nil || s.accounts == nil {
		return bkerr.Unavailable("inbox store not configured", nil)
	}
	if err := s.persistNormalizedMessage(ctx, accountID, m); err != nil {
		return bkerr.Internal("ingest message", err)
	}
	return nil
}

func (s *Service) persistNormalizedMessage(ctx context.Context, accountID string, m NormalizedMessage) error {
	contact, err := s.contacts.Upsert(ctx, db.UpsertContactParams{
		ChannelAccountID: accountID,
		ExternalID:       m.ContactExternalID,
		DisplayName:      m.ContactDisplayName,
		AvatarURL:        m.ContactAvatarURL,
	})
	if err != nil {
		return fmt.Errorf("upsert contact: %w", err)
	}

	thread, err := s.threads.Upsert(ctx, db.UpsertThreadParams{
		ChannelAccountID: accountID,
		ExternalThreadID: m.ExternalThreadID,
		ContactID:        contact.ID,
		Subject:          m.ThreadSubject,
		LastMessageAt:    m.SentAt,
	})
	if err != nil {
		return fmt.Errorf("upsert thread: %w", err)
	}

	senderContactID := ""
	if m.Direction == MessageDirectionInbound {
		senderContactID = contact.ID
	}
	if _, err := s.messages.Create(ctx, db.CreateMessageParams{
		ThreadID:          thread.ID,
		ChannelAccountID:  accountID,
		ExternalMessageID: m.ExternalMessageID,
		Direction:         m.Direction,
		SenderContactID:   senderContactID,
		BodyText:          m.BodyText,
		AttachmentsJSON:   m.AttachmentsJSON,
		SentAt:            m.SentAt,
	}); err != nil {
		return fmt.Errorf("create message: %w", err)
	}
	return nil
}

// ─── Threads & messages ─────────────────────────────────────────────────────

func (s *Service) ListThreads(ctx context.Context, principal *backendauth.Principal, params ListThreadsParams) ([]Thread, error) {
	if s == nil || s.threads == nil {
		return nil, bkerr.Unavailable("inbox store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	records, err := s.threads.ListByUserID(ctx, principal.User.ID, params.Status, params.Limit)
	if err != nil {
		return nil, bkerr.Internal("list threads", err)
	}
	out := make([]Thread, 0, len(records))
	for _, r := range records {
		t, err := s.hydrateThread(ctx, r)
		if err != nil {
			return nil, err
		}
		out = append(out, *t)
	}
	return out, nil
}

func (s *Service) GetThread(ctx context.Context, principal *backendauth.Principal, threadID string) (*Thread, []Message, error) {
	dbThread, err := s.threads.GetByID(ctx, threadID)
	if err != nil {
		return nil, nil, bkerr.NotFound("thread not found", err)
	}
	if _, _, err := s.getOwnedAccountRecord(ctx, principal, dbThread.ChannelAccountID); err != nil {
		return nil, nil, err
	}
	thread, err := s.hydrateThread(ctx, *dbThread)
	if err != nil {
		return nil, nil, err
	}
	dbMessages, err := s.messages.ListByThreadID(ctx, threadID)
	if err != nil {
		return nil, nil, bkerr.Internal("list messages", err)
	}
	messages := make([]Message, 0, len(dbMessages))
	for _, m := range dbMessages {
		messages = append(messages, *messageFromDB(m))
	}
	return thread, messages, nil
}

func (s *Service) UpdateThreadStatus(ctx context.Context, principal *backendauth.Principal, threadID, status string) error {
	dbThread, err := s.threads.GetByID(ctx, threadID)
	if err != nil {
		return bkerr.NotFound("thread not found", err)
	}
	if _, _, err := s.getOwnedAccountRecord(ctx, principal, dbThread.ChannelAccountID); err != nil {
		return err
	}
	return s.threads.UpdateStatus(ctx, threadID, status)
}

// SaveDraft stores a not-yet-sent reply against a thread - the agent's
// draft_reply tool writes here; the human reviews and either edits it or
// calls SendReply, never an automatic send.
func (s *Service) SaveDraft(ctx context.Context, principal *backendauth.Principal, params SendReplyParams) (*Message, error) {
	dbThread, err := s.threads.GetByID(ctx, params.ThreadID)
	if err != nil {
		return nil, bkerr.NotFound("thread not found", err)
	}
	if _, _, err := s.getOwnedAccountRecord(ctx, principal, dbThread.ChannelAccountID); err != nil {
		return nil, err
	}
	created, err := s.messages.Create(ctx, db.CreateMessageParams{
		ThreadID:         dbThread.ID,
		ChannelAccountID: dbThread.ChannelAccountID,
		Direction:        MessageDirectionOutbound,
		BodyText:         params.Body,
		IsDraft:          true,
		SentAt:           time.Now(),
	})
	if err != nil {
		return nil, bkerr.Internal("save draft", err)
	}
	return messageFromDB(*created), nil
}

// SendReply delivers a reply through the thread's channel connector, then
// records it as a sent (non-draft) outbound message. Requires an explicit
// call from either the user or the agent after user confirmation - there is
// no path that sends a message without this being invoked directly, which
// is the point: every send is deliberate and traceable.
func (s *Service) SendReply(ctx context.Context, principal *backendauth.Principal, params SendReplyParams) (*Message, error) {
	dbThread, err := s.threads.GetByID(ctx, params.ThreadID)
	if err != nil {
		return nil, bkerr.NotFound("thread not found", err)
	}
	dbAccount, account, err := s.getOwnedAccountRecord(ctx, principal, dbThread.ChannelAccountID)
	if err != nil {
		return nil, err
	}
	connector, ok := s.connectors[account.Channel]
	if !ok {
		return nil, bkerr.Unavailable(fmt.Sprintf("no connector registered for channel %q", account.Channel), nil)
	}
	secret, err := s.accounts.GetSecret(ctx, account.ID)
	if err != nil {
		return nil, bkerr.Internal("load channel account secret", err)
	}
	contact, err := s.contacts.GetByID(ctx, dbThread.ContactID)
	if err != nil {
		return nil, bkerr.Internal("load thread contact", err)
	}

	externalMessageID, err := connector.Send(ctx, account, ConnectorSecret{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		SessionState: secret.SessionState,
		ExpiresAt:    secret.ExpiresAt,
	}, dbThread.ExternalThreadID, contact.ExternalID, params.Body)
	if err != nil {
		return nil, bkerr.BadGateway(fmt.Sprintf("send failed for channel %q", account.Channel), err)
	}

	created, err := s.messages.Create(ctx, db.CreateMessageParams{
		ThreadID:          dbThread.ID,
		ChannelAccountID:  dbAccount.ID,
		ExternalMessageID: externalMessageID,
		Direction:         MessageDirectionOutbound,
		SentAt:            time.Now(),
		BodyText:          params.Body,
	})
	if err != nil {
		return nil, bkerr.Internal("record sent message", err)
	}
	if err := s.threads.UpdateStatus(ctx, dbThread.ID, ThreadStatusHandled); err != nil {
		return nil, bkerr.Internal("update thread status", err)
	}
	return messageFromDB(*created), nil
}

func (s *Service) SearchContacts(ctx context.Context, principal *backendauth.Principal, channelAccountID, query string, limit int) ([]Contact, error) {
	if _, _, err := s.getOwnedAccountRecord(ctx, principal, channelAccountID); err != nil {
		return nil, err
	}
	records, err := s.contacts.Search(ctx, channelAccountID, query, limit)
	if err != nil {
		return nil, bkerr.Internal("search contacts", err)
	}
	out := make([]Contact, 0, len(records))
	for _, r := range records {
		out = append(out, contactFromDB(r))
	}
	return out, nil
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func (s *Service) getOwnedAccount(ctx context.Context, principal *backendauth.Principal, accountID string) (*ChannelAccount, error) {
	_, account, err := s.getOwnedAccountRecord(ctx, principal, accountID)
	return account, err
}

func (s *Service) getOwnedAccountRecord(ctx context.Context, principal *backendauth.Principal, accountID string) (*db.ChannelAccount, *ChannelAccount, error) {
	if principal == nil {
		return nil, nil, bkerr.Unauthorized("authentication required", nil)
	}
	record, err := s.accounts.GetByID(ctx, accountID)
	if err != nil {
		return nil, nil, bkerr.NotFound("channel account not found", err)
	}
	if !principal.HasRole("admin") && record.UserID != principal.User.ID {
		return nil, nil, bkerr.Forbidden("channel account belongs to another user", nil)
	}
	return record, accountFromDB(*record), nil
}

func (s *Service) hydrateThread(ctx context.Context, r db.InboxThread) (*Thread, error) {
	var contact Contact
	if r.ContactID != "" {
		if c, err := s.contacts.GetByID(ctx, r.ContactID); err == nil {
			contact = contactFromDB(*c)
		}
	}
	account, err := s.accounts.GetByID(ctx, r.ChannelAccountID)
	channel := ""
	if err == nil {
		channel = account.Channel
	}
	return &Thread{
		ID:               r.ID,
		ChannelAccountID: r.ChannelAccountID,
		Channel:          channel,
		Contact:          contact,
		Subject:          r.Subject,
		Status:           r.Status,
		PriorityScore:    r.PriorityScore,
		LastMessageAt:    r.LastMessageAt,
		CreatedAt:        r.CreatedAt,
		UpdatedAt:        r.UpdatedAt,
	}, nil
}

func accountFromDB(r db.ChannelAccount) *ChannelAccount {
	return &ChannelAccount{
		ID:                r.ID,
		UserID:            r.UserID,
		WorkspaceID:       r.WorkspaceID,
		Channel:           r.Channel,
		DisplayName:       r.DisplayName,
		ExternalAccountID: r.ExternalAccountID,
		Status:            r.Status,
		HasRefreshToken:   r.HasRefreshToken,
		SyncCursor:        r.SyncCursor,
		LastSyncedAt:      r.LastSyncedAt,
		LastError:         r.LastError,
		CreatedAt:         r.CreatedAt,
		UpdatedAt:         r.UpdatedAt,
	}
}

func contactFromDB(r db.InboxContact) Contact {
	return Contact{
		ID:          r.ID,
		ExternalID:  r.ExternalID,
		DisplayName: r.DisplayName,
		AvatarURL:   r.AvatarURL,
	}
}

func messageFromDB(r db.InboxMessage) *Message {
	return &Message{
		ID:              r.ID,
		ThreadID:        r.ThreadID,
		Direction:       r.Direction,
		SenderContactID: r.SenderContactID,
		BodyText:        r.BodyText,
		AttachmentsJSON: r.AttachmentsJSON,
		IsDraft:         r.IsDraft,
		SentAt:          r.SentAt,
		CreatedAt:       r.CreatedAt,
	}
}
