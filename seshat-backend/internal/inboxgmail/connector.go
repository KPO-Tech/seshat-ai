// Package inboxgmail implements inbox.Connector for Gmail via the official
// Gmail API - see internal/inbox's package doc for why this stays a thin
// translation layer (Sync/Send only; persistence lives in inbox.Service).
package inboxgmail

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/oauth2"
	gmail "google.golang.org/api/gmail/v1"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/option"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/connector"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inbox"
)

// bootstrapMessageLimit caps how many messages a brand-new connection
// pulls in on its first sync - enough to seed a useful triage list without
// a multi-minute initial sync on a mailbox with years of history. Older
// messages remain reachable through Gmail itself; this connector only
// mirrors what's needed for the Inbox Agent to work with recent activity.
const bootstrapMessageLimit = 50

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

func (c *Connector) client(ctx context.Context, secret inbox.ConnectorSecret) (*gmail.Service, error) {
	if c.oauthConfig == nil {
		return nil, fmt.Errorf("gmail oauth is not configured")
	}
	token := &oauth2.Token{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		Expiry:       secret.ExpiresAt,
	}
	ts := c.oauthConfig.TokenSource(ctx, token)
	return gmail.NewService(ctx, option.WithTokenSource(ts))
}

func (c *Connector) Sync(ctx context.Context, account *inbox.ChannelAccount, secret inbox.ConnectorSecret) ([]inbox.NormalizedMessage, string, error) {
	svc, err := c.client(ctx, secret)
	if err != nil {
		return nil, "", fmt.Errorf("build gmail client: %w", err)
	}
	if account.SyncCursor == "" {
		return c.bootstrapSync(ctx, svc, account.ExternalAccountID)
	}
	messages, cursor, err := c.incrementalSync(ctx, svc, account.SyncCursor, account.ExternalAccountID)
	if err != nil && isHistoryExpired(err) {
		// Gmail only retains history for ~7 days - a cursor older than that
		// comes back as a 404. The correct recovery is the same as a
		// first-ever sync: pull a fresh snapshot and start a new cursor,
		// rather than surfacing an error the account owner can't act on.
		return c.bootstrapSync(ctx, svc, account.ExternalAccountID)
	}
	return messages, cursor, err
}

func (c *Connector) bootstrapSync(ctx context.Context, svc *gmail.Service, accountEmail string) ([]inbox.NormalizedMessage, string, error) {
	profile, err := svc.Users.GetProfile("me").Context(ctx).Do()
	if err != nil {
		return nil, "", fmt.Errorf("get profile: %w", err)
	}
	list, err := svc.Users.Messages.List("me").MaxResults(bootstrapMessageLimit).Context(ctx).Do()
	if err != nil {
		return nil, "", fmt.Errorf("list messages: %w", err)
	}
	normalized, err := c.fetchAndTranslate(ctx, svc, accountEmail, messageIDs(list.Messages))
	if err != nil {
		return nil, "", err
	}
	// The profile's HistoryId is captured after listing, so anything that
	// arrived mid-bootstrap is (at worst) re-observed on the very next
	// incremental sync - inbox.Service's persistence is idempotent per
	// external message ID, so that's a no-op rather than a duplicate.
	return normalized, strconv.FormatUint(profile.HistoryId, 10), nil
}

func (c *Connector) incrementalSync(ctx context.Context, svc *gmail.Service, cursor, accountEmail string) ([]inbox.NormalizedMessage, string, error) {
	startHistoryID, err := strconv.ParseUint(cursor, 10, 64)
	if err != nil {
		return nil, "", fmt.Errorf("invalid sync cursor %q: %w", cursor, err)
	}

	var ids []string
	latestHistoryID := startHistoryID
	pageToken := ""
	for {
		call := svc.Users.History.List("me").StartHistoryId(startHistoryID).HistoryTypes("messageAdded").Context(ctx)
		if pageToken != "" {
			call = call.PageToken(pageToken)
		}
		resp, err := call.Do()
		if err != nil {
			return nil, "", fmt.Errorf("list history: %w", err)
		}
		if resp.HistoryId > latestHistoryID {
			latestHistoryID = resp.HistoryId
		}
		for _, h := range resp.History {
			for _, added := range h.MessagesAdded {
				if added.Message != nil {
					ids = append(ids, added.Message.Id)
				}
			}
		}
		if resp.NextPageToken == "" {
			break
		}
		pageToken = resp.NextPageToken
	}

	normalized, err := c.fetchAndTranslate(ctx, svc, accountEmail, ids)
	if err != nil {
		return nil, "", err
	}
	return normalized, strconv.FormatUint(latestHistoryID, 10), nil
}

func (c *Connector) fetchAndTranslate(ctx context.Context, svc *gmail.Service, accountEmail string, ids []string) ([]inbox.NormalizedMessage, error) {
	normalized := make([]inbox.NormalizedMessage, 0, len(ids))
	for _, id := range ids {
		msg, err := svc.Users.Messages.Get("me", id).Format("full").Context(ctx).Do()
		if err != nil {
			return nil, fmt.Errorf("get message %s: %w", id, err)
		}
		n, err := translateMessage(msg, accountEmail)
		if err != nil {
			// A single unparseable message (e.g. a malformed header on some
			// automated sender) shouldn't fail the whole sync - skip it and
			// keep going.
			continue
		}
		normalized = append(normalized, n)
	}
	return normalized, nil
}

func messageIDs(refs []*gmail.Message) []string {
	ids := make([]string, 0, len(refs))
	for _, r := range refs {
		ids = append(ids, r.Id)
	}
	return ids
}

func isHistoryExpired(err error) bool {
	var apiErr *googleapi.Error
	return errors.As(err, &apiErr) && apiErr.Code == 404
}

// Send delivers a reply in the given Gmail thread. It first fetches the
// thread's most recent message (headers only) to build a properly threaded
// reply - matching Subject plus In-Reply-To/References - rather than
// sending an orphaned message that merely shares a ThreadId, which Gmail's
// own clients don't reliably group without those headers.
func (c *Connector) Send(ctx context.Context, account *inbox.ChannelAccount, secret inbox.ConnectorSecret, externalThreadID, contactExternalID, body string) (string, error) {
	svc, err := c.client(ctx, secret)
	if err != nil {
		return "", fmt.Errorf("build gmail client: %w", err)
	}

	subject := ""
	inReplyTo := ""
	references := ""
	if externalThreadID != "" {
		thread, err := svc.Users.Threads.Get("me", externalThreadID).
			Format("metadata").
			MetadataHeaders("Subject", "Message-Id", "References").
			Context(ctx).Do()
		if err == nil && len(thread.Messages) > 0 {
			last := thread.Messages[len(thread.Messages)-1]
			subject = "Re: " + stripReplyPrefix(headerValue(last.Payload.Headers, "Subject"))
			inReplyTo = headerValue(last.Payload.Headers, "Message-Id")
			references = strings.TrimSpace(headerValue(last.Payload.Headers, "References") + " " + inReplyTo)
		}
	}
	if subject == "" {
		subject = "(no subject)"
	}

	raw := buildRawMessage(contactExternalID, subject, body, inReplyTo, references)
	msg := &gmail.Message{
		Raw:      raw,
		ThreadId: externalThreadID,
	}
	sent, err := svc.Users.Messages.Send("me", msg).Context(ctx).Do()
	if err != nil {
		return "", fmt.Errorf("send message: %w", err)
	}
	return sent.Id, nil
}

// FetchAttachment implements inbox.AttachmentFetcher - Gmail attachments
// aren't downloaded during Sync (see mime.go's doc comment), so Service
// calls this lazily, the first time a user actually requests a download.
// attachmentRef is the GmailAttachmentID captured at sync time.
func (c *Connector) FetchAttachment(ctx context.Context, account *inbox.ChannelAccount, secret inbox.ConnectorSecret, externalMessageID, attachmentRef string) ([]byte, error) {
	svc, err := c.client(ctx, secret)
	if err != nil {
		return nil, fmt.Errorf("build gmail client: %w", err)
	}
	body, err := svc.Users.Messages.Attachments.Get("me", externalMessageID, attachmentRef).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("get attachment: %w", err)
	}
	// Same unpadded base64url convention as mime.go's decodeBody.
	data, err := base64.RawURLEncoding.DecodeString(body.Data)
	if err != nil {
		return nil, fmt.Errorf("decode attachment data: %w", err)
	}
	return data, nil
}

// buildRawMessage builds a minimal RFC 2822 message and returns it as the
// unpadded base64url string the Gmail API's Message.Raw field expects.
func buildRawMessage(to, subject, body, inReplyTo, references string) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "To: %s\r\n", to)
	fmt.Fprintf(&sb, "Subject: %s\r\n", subject)
	if inReplyTo != "" {
		fmt.Fprintf(&sb, "In-Reply-To: %s\r\n", inReplyTo)
	}
	if references != "" {
		fmt.Fprintf(&sb, "References: %s\r\n", references)
	}
	sb.WriteString("MIME-Version: 1.0\r\n")
	sb.WriteString("Content-Type: text/plain; charset=\"UTF-8\"\r\n")
	sb.WriteString("\r\n")
	sb.WriteString(body)
	return base64.RawURLEncoding.EncodeToString([]byte(sb.String()))
}

var (
	_ inbox.Connector         = (*Connector)(nil)
	_ inbox.AttachmentFetcher = (*Connector)(nil)
)
