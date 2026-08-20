// Package inboxgmail implements inbox.Connector for Gmail - the actual
// Gmail API interaction (sync, MIME parsing, send/reply, attachments) now
// lives in core/gmail (shared with seshat-server's own gmail-mcp bridge,
// see core/gmail's package doc comment); this package only adapts it to
// the inbox.Connector interface and computes Direction (an inbox-domain
// concept core/gmail deliberately doesn't know about - see
// coregmail.Message's doc comment).
package inboxgmail

import (
	"context"
	"fmt"
	"strings"

	"golang.org/x/oauth2"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/connector"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inbox"
	coregmail "github.com/EngineerProjects/seshat-ai/seshat-core/gmail"
)

type Connector struct {
	oauthConfig *oauth2.Config
}

func NewConnector(oauthConfig *oauth2.Config) *Connector {
	return &Connector{oauthConfig: oauthConfig}
}

func (c *Connector) Channel() string { return inbox.ChannelGmail }

func (c *Connector) Kind() connector.Kind { return connector.Kind(inbox.ChannelGmail) }

func (c *Connector) Capabilities() []connector.Capability {
	return []connector.Capability{connector.CapabilityMessaging}
}

func (c *Connector) client(ctx context.Context, secret inbox.ConnectorSecret) (*coregmail.Client, error) {
	if c.oauthConfig == nil {
		return nil, fmt.Errorf("gmail oauth is not configured")
	}
	token := &oauth2.Token{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		Expiry:       secret.ExpiresAt,
	}
	return coregmail.New(ctx, c.oauthConfig.TokenSource(ctx, token))
}

func (c *Connector) Sync(ctx context.Context, account *inbox.ChannelAccount, secret inbox.ConnectorSecret) ([]inbox.NormalizedMessage, string, error) {
	client, err := c.client(ctx, secret)
	if err != nil {
		return nil, "", fmt.Errorf("build gmail client: %w", err)
	}
	messages, nextCursor, err := client.Sync(ctx, account.SyncCursor)
	if err != nil {
		return nil, "", err
	}
	normalized := make([]inbox.NormalizedMessage, 0, len(messages))
	for _, m := range messages {
		n, err := translateMessage(m, account.ExternalAccountID)
		if err != nil {
			// A single unusable message (no resolvable contact address)
			// shouldn't fail the whole sync - skip it and keep going.
			continue
		}
		normalized = append(normalized, n)
	}
	return normalized, nextCursor, nil
}

// translateMessage maps a core/gmail.Message onto inbox.NormalizedMessage,
// computing Direction/contact from accountEmail - the one piece of
// interpretation that's genuinely inbox-domain, not Gmail-API, logic.
func translateMessage(m coregmail.Message, accountEmail string) (inbox.NormalizedMessage, error) {
	direction := inbox.MessageDirectionInbound
	contact := m.From
	if m.From.Address != "" && strings.EqualFold(m.From.Address, accountEmail) {
		direction = inbox.MessageDirectionOutbound
		contact = m.To
	}
	if contact.Address == "" {
		return inbox.NormalizedMessage{}, fmt.Errorf("message %s has no usable contact address", m.ID)
	}

	attachments := make([]inbox.Attachment, 0, len(m.Attachments))
	for _, a := range m.Attachments {
		attachments = append(attachments, inbox.Attachment{
			Filename:          a.Filename,
			ContentType:       a.ContentType,
			Size:              a.Size,
			GmailAttachmentID: a.GmailAttachmentID,
		})
	}

	return inbox.NormalizedMessage{
		ExternalThreadID:   m.ThreadID,
		ThreadSubject:      m.Subject,
		ExternalMessageID:  m.ID,
		Direction:          direction,
		ContactExternalID:  contact.Address,
		ContactDisplayName: contact.Name,
		BodyText:           m.BodyText,
		Attachments:        attachments,
		SentAt:             m.SentAt,
	}, nil
}

// Send delivers a reply in the given Gmail thread (or a fresh message when
// externalThreadID is empty) - see coregmail.Client.Reply's doc comment for
// the threading-header lookup this does internally.
func (c *Connector) Send(ctx context.Context, account *inbox.ChannelAccount, secret inbox.ConnectorSecret, externalThreadID, contactExternalID, body string) (string, error) {
	client, err := c.client(ctx, secret)
	if err != nil {
		return "", fmt.Errorf("build gmail client: %w", err)
	}
	return client.Reply(ctx, externalThreadID, contactExternalID, body)
}

// FetchAttachment implements inbox.AttachmentFetcher - Gmail attachments
// aren't downloaded during Sync, so Service calls this lazily, the first
// time a user actually requests a download.
func (c *Connector) FetchAttachment(ctx context.Context, account *inbox.ChannelAccount, secret inbox.ConnectorSecret, externalMessageID, attachmentRef string) ([]byte, error) {
	client, err := c.client(ctx, secret)
	if err != nil {
		return nil, fmt.Errorf("build gmail client: %w", err)
	}
	return client.FetchAttachment(ctx, externalMessageID, attachmentRef)
}

var (
	_ inbox.Connector         = (*Connector)(nil)
	_ inbox.AttachmentFetcher = (*Connector)(nil)
)
