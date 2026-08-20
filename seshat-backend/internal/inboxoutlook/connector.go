// Package inboxoutlook implements inbox.Connector for Outlook Mail via
// core/msgraph - see internal/inbox's package doc for why this stays a
// thin translation layer (Sync/Send only; persistence lives in
// inbox.Service). core/msgraph is shared, tenant-agnostic Microsoft Graph
// client code - the same package seshat-server wraps in a self-hosted MCP
// server for the workspace chat agent, see msgraphmcp's doc comment there.
package inboxoutlook

import (
	"context"
	"fmt"
	"time"

	"golang.org/x/oauth2"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/connector"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inbox"
	coremsgraph "github.com/EngineerProjects/seshat-ai/seshat-core/msgraph"
)

type Connector struct {
	oauthConfig *oauth2.Config
}

func NewConnector(oauthConfig *oauth2.Config) *Connector {
	return &Connector{oauthConfig: oauthConfig}
}

func (c *Connector) Channel() string { return inbox.ChannelOutlook }

func (c *Connector) Kind() connector.Kind { return connector.Kind(inbox.ChannelOutlook) }

func (c *Connector) Capabilities() []connector.Capability {
	return []connector.Capability{connector.CapabilityMessaging}
}

func (c *Connector) client(ctx context.Context, secret inbox.ConnectorSecret) (*coremsgraph.Client, error) {
	if c.oauthConfig == nil {
		return nil, fmt.Errorf("outlook oauth is not configured")
	}
	token := &oauth2.Token{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		Expiry:       secret.ExpiresAt,
	}
	return coremsgraph.New(c.oauthConfig.Client(ctx, token)), nil
}

// Sync pulls everything new since account.SyncCursor - ListMessagesDelta
// itself treats an empty cursor as a full bootstrap enumeration, so there's
// no separate bootstrap/incremental split needed here, unlike Gmail's
// history-ID-based approach.
func (c *Connector) Sync(ctx context.Context, account *inbox.ChannelAccount, secret inbox.ConnectorSecret) ([]inbox.NormalizedMessage, string, error) {
	client, err := c.client(ctx, secret)
	if err != nil {
		return nil, "", fmt.Errorf("build outlook client: %w", err)
	}
	messages, nextCursor, err := client.ListMessagesDelta(ctx, account.SyncCursor)
	if err != nil {
		return nil, "", err
	}
	normalized := make([]inbox.NormalizedMessage, 0, len(messages))
	for _, m := range messages {
		if m.Deleted != nil {
			// A delta "removed" entry - inbox.Service has no deletion
			// semantics for messages it already persisted, so this is just
			// skipped rather than surfaced.
			continue
		}
		n, err := translateMessage(m)
		if err != nil {
			// A single unparseable message shouldn't fail the whole sync -
			// skip it and keep going, same convention as inboxgmail.
			continue
		}
		normalized = append(normalized, n)
	}
	return normalized, nextCursor, nil
}

func translateMessage(m coremsgraph.Message) (inbox.NormalizedMessage, error) {
	sentAt, err := time.Parse(time.RFC3339, m.ReceivedDateTime)
	if err != nil {
		return inbox.NormalizedMessage{}, fmt.Errorf("parse receivedDateTime %q: %w", m.ReceivedDateTime, err)
	}
	contactAddress, contactName := "", ""
	if m.From != nil {
		contactAddress = m.From.EmailAddress.Address
		contactName = m.From.EmailAddress.Name
	}
	return inbox.NormalizedMessage{
		ExternalThreadID:   m.ConversationID,
		ThreadSubject:      m.Subject,
		ExternalMessageID:  m.ID,
		Direction:          inbox.MessageDirectionInbound,
		ContactExternalID:  contactAddress,
		ContactDisplayName: contactName,
		BodyText:           m.BodyPreview,
		SentAt:             sentAt,
	}, nil
}

// Send replies within an existing conversation when externalThreadID is
// set (looking up the conversation's latest message first, since Graph's
// reply action needs a specific message ID, not a conversation ID), or
// sends a fresh message otherwise. Graph's reply/sendMail actions return
// 202 Accepted with no body, so no external message ID is available
// synchronously - returning empty is harmless here since Sync only watches
// the inbox folder (see ListMessagesDelta), never Sent Items, so an
// agent-sent message is never re-observed as a duplicate inbound one.
func (c *Connector) Send(ctx context.Context, account *inbox.ChannelAccount, secret inbox.ConnectorSecret, externalThreadID, contactExternalID, body string) (string, error) {
	client, err := c.client(ctx, secret)
	if err != nil {
		return "", fmt.Errorf("build outlook client: %w", err)
	}
	if externalThreadID != "" {
		latest, err := client.LatestMessageInConversation(ctx, externalThreadID)
		if err == nil {
			if err := client.ReplyToMessage(ctx, latest.ID, body); err != nil {
				return "", err
			}
			return "", nil
		}
		// Fall through to a fresh send if the conversation lookup failed
		// (e.g. the original message was since deleted) - same
		// best-effort spirit as Gmail's Send, which just drops threading
		// headers rather than failing outright.
	}
	if err := client.SendMail(ctx, []string{contactExternalID}, "(no subject)", body); err != nil {
		return "", err
	}
	return "", nil
}

var _ inbox.Connector = (*Connector)(nil)
