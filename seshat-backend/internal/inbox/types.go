package inbox

import (
	"context"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

// Aliased from internal/db rather than redeclared, so the two can never
// silently drift apart (a rename in db/inbox.go breaks this at compile
// time instead of just here at runtime) - db owns the canonical values
// since they're persisted column values, and this package re-exports them
// under its own name so callers (tools, API handlers) don't need to import
// internal/db just for a status string.
const (
	ChannelGmail    = db.ChannelGmail
	ChannelOutlook  = db.ChannelOutlook
	ChannelWhatsApp = db.ChannelWhatsApp

	AccountStatusPending      = db.ChannelAccountStatusPending
	AccountStatusConnected    = db.ChannelAccountStatusConnected
	AccountStatusError        = db.ChannelAccountStatusError
	AccountStatusDisconnected = db.ChannelAccountStatusDisconnected

	ThreadStatusOpen      = db.InboxThreadStatusOpen
	ThreadStatusHandled   = db.InboxThreadStatusHandled
	ThreadStatusSnoozed   = db.InboxThreadStatusSnoozed
	ThreadStatusEscalated = db.InboxThreadStatusEscalated

	MessageDirectionInbound  = db.InboxMessageDirectionInbound
	MessageDirectionOutbound = db.InboxMessageDirectionOutbound
)

type ChannelAccount struct {
	ID                string    `json:"id"`
	UserID            string    `json:"user_id"`
	WorkspaceID       string    `json:"workspace_id,omitempty"`
	Channel           string    `json:"channel"`
	DisplayName       string    `json:"display_name"`
	ExternalAccountID string    `json:"external_account_id"`
	Status            string    `json:"status"`
	HasRefreshToken   bool      `json:"has_refresh_token"`
	SyncCursor        string    `json:"-"`
	LastSyncedAt      time.Time `json:"last_synced_at,omitempty"`
	LastError         string    `json:"last_error,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type Contact struct {
	ID          string `json:"id"`
	ExternalID  string `json:"external_id"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url,omitempty"`
}

type Thread struct {
	ID               string    `json:"id"`
	ChannelAccountID string    `json:"channel_account_id"`
	Channel          string    `json:"channel"`
	Contact          Contact   `json:"contact"`
	Subject          string    `json:"subject,omitempty"`
	Status           string    `json:"status"`
	PriorityScore    float64   `json:"priority_score"`
	LastMessageAt    time.Time `json:"last_message_at"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type Message struct {
	ID              string    `json:"id"`
	ThreadID        string    `json:"thread_id"`
	Direction       string    `json:"direction"`
	SenderContactID string    `json:"sender_contact_id,omitempty"`
	BodyText        string    `json:"body_text"`
	AttachmentsJSON string    `json:"attachments_json,omitempty"`
	IsDraft         bool      `json:"is_draft"`
	SentAt          time.Time `json:"sent_at"`
	CreatedAt       time.Time `json:"created_at"`
}

type ConnectAccountParams struct {
	WorkspaceID       string
	Channel           string
	DisplayName       string
	ExternalAccountID string
	AccessToken       string
	RefreshToken      string
	SessionState      string
	Scope             string
	ExpiresAt         time.Time
}

type ListThreadsParams struct {
	Status string
	Limit  int
}

type SendReplyParams struct {
	ThreadID string
	Body     string
}

// NormalizedMessage is what a Connector's Sync returns for each message it
// observed on the external channel. Persisting it (upserting the contact
// and thread, creating the message row, and applying the thread-reopen
// rule) is the Service's job, not the connector's - that keeps sync
// persistence logic in exactly one place regardless of how many channels
// exist, instead of duplicated per connector.
type NormalizedMessage struct {
	ExternalThreadID string
	// ThreadSubject is only meaningful for channels with a real subject
	// line (email); leave empty for chat-style channels like WhatsApp,
	// where the thread is just "the conversation with this contact".
	ThreadSubject      string
	ExternalMessageID  string
	Direction          string
	ContactExternalID  string
	ContactDisplayName string
	ContactAvatarURL   string
	BodyText           string
	AttachmentsJSON    string
	SentAt             time.Time
}

// Connector is what a channel implementation (Gmail, WhatsApp, ...) provides.
// It never touches the database directly - Sync returns normalized data for
// the Service to persist, and Send only needs enough identity to address the
// external API, not local row IDs.
type Connector interface {
	Channel() string

	// Sync pulls everything new since account.SyncCursor and returns it
	// normalized, plus the cursor value to persist for next time (opaque -
	// only this connector interprets it, e.g. a Gmail historyId or a
	// last-seen WhatsApp timestamp).
	Sync(ctx context.Context, account *ChannelAccount, secret ConnectorSecret) (messages []NormalizedMessage, nextCursor string, err error)

	// Send delivers an outbound message to a contact/thread on the external
	// channel and returns that channel's own message ID (stored so a later
	// Sync recognizes and skips this message rather than re-importing it as
	// a duplicate inbound one).
	Send(ctx context.Context, account *ChannelAccount, secret ConnectorSecret, externalThreadID, contactExternalID, body string) (externalMessageID string, err error)
}

// ConnectorSecret is the decrypted connection material a Connector needs -
// never logged, never serialized to an API response.
type ConnectorSecret struct {
	AccessToken  string
	RefreshToken string
	SessionState string
	ExpiresAt    time.Time
}
