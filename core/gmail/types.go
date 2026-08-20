// Package gmail is a thin wrapper around the official Gmail API client
// (google.golang.org/api/gmail/v1) - unlike core/msgraph, there's a real
// SDK to build on here, so this package's job is the higher-level
// orchestration around it (history-based sync with bootstrap fallback,
// MIME parsing/translation, reply threading), not raw HTTP.
//
// Shared, tenant-agnostic logic used two ways: seshat-backend wraps it in
// a real inbox.Connector (internal/inboxgmail) for the local Inbox
// workflow, and seshat-server wraps it in a small self-hosted MCP server
// (internal/server/gmailmcp) so the workspace chat agent can call it as a
// tool, bridged through a per-employee OAuth-connected account the same
// way every other agent_action connector kind works. Neither side stores
// or manages OAuth tokens here - callers pass an already-token-bound
// oauth2.TokenSource, mirroring core/msgraph's Client.
package gmail

import "time"

// EmailAddress is a parsed "Name <address>" (or bare address) header value.
type EmailAddress struct {
	Address string
	Name    string
}

// Attachment is one attachment's metadata, not its bytes - see
// Client.FetchAttachment for the lazy download step.
type Attachment struct {
	Filename          string
	ContentType       string
	Size              int64
	GmailAttachmentID string
}

// Message is one email, already MIME-parsed. Deliberately has no
// "direction" field - inbound vs. outbound depends on which address is
// the connected account's own, an inbox-domain concept the caller (e.g.
// inboxgmail.translateMessage) computes itself from From/To.
type Message struct {
	ID          string
	ThreadID    string
	Subject     string
	From        EmailAddress
	To          EmailAddress
	BodyText    string
	Attachments []Attachment
	SentAt      time.Time
}
