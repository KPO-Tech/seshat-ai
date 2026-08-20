package gmail

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"

	gmailapi "google.golang.org/api/gmail/v1"
)

// Reply delivers a reply in the given Gmail thread (empty threadID sends
// an orphaned message instead). It first fetches the thread's most recent
// message (headers only) to build a properly threaded reply - matching
// Subject plus In-Reply-To/References - rather than sending a message that
// merely shares a ThreadId, which Gmail's own clients don't reliably group
// without those headers. Unlike Microsoft Graph's fire-and-forget reply
// action, Gmail's Send returns a real message ID synchronously.
func (c *Client) Reply(ctx context.Context, threadID, to, body string) (string, error) {
	subject := ""
	inReplyTo := ""
	references := ""
	if threadID != "" {
		thread, err := c.svc.Users.Threads.Get("me", threadID).
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

	raw := buildRawMessage(to, subject, body, inReplyTo, references)
	msg := &gmailapi.Message{Raw: raw, ThreadId: threadID}
	sent, err := c.svc.Users.Messages.Send("me", msg).Context(ctx).Do()
	if err != nil {
		return "", fmt.Errorf("send message: %w", err)
	}
	return sent.Id, nil
}

// Send delivers a fresh (non-reply) message to one or more recipients.
func (c *Client) Send(ctx context.Context, to []string, subject, body string) (string, error) {
	if len(to) == 0 {
		return "", fmt.Errorf("at least one recipient is required")
	}
	raw := buildRawMessage(strings.Join(to, ", "), subject, body, "", "")
	msg := &gmailapi.Message{Raw: raw}
	sent, err := c.svc.Users.Messages.Send("me", msg).Context(ctx).Do()
	if err != nil {
		return "", fmt.Errorf("send message: %w", err)
	}
	return sent.Id, nil
}

// FetchAttachment downloads one attachment's bytes by the GmailAttachmentID
// captured on its Attachment metadata at sync time.
func (c *Client) FetchAttachment(ctx context.Context, messageID, attachmentID string) ([]byte, error) {
	body, err := c.svc.Users.Messages.Attachments.Get("me", messageID, attachmentID).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("get attachment: %w", err)
	}
	// Same unpadded base64url convention as message.go's decodeBody.
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
