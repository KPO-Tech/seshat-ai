package inboxgmail

import (
	"encoding/base64"
	"fmt"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inbox"
	gmail "google.golang.org/api/gmail/v1"
)

// translateMessage converts a fully-populated (format=full) Gmail message
// into the channel-agnostic shape inbox.Service persists. accountEmail is
// the connected mailbox's own address, used to tell an inbound message
// (someone wrote to this mailbox) from an outbound one (this mailbox sent
// it, e.g. from another client) - Gmail's API has no direction flag of its
// own to read off directly.
func translateMessage(msg *gmail.Message, accountEmail string) (inbox.NormalizedMessage, error) {
	if msg == nil || msg.Payload == nil {
		return inbox.NormalizedMessage{}, fmt.Errorf("message has no payload")
	}
	headers := msg.Payload.Headers

	from := parseFirstAddress(headerValue(headers, "From"))
	to := parseFirstAddress(headerValue(headers, "To"))
	subject := stripReplyPrefix(headerValue(headers, "Subject"))

	direction := inbox.MessageDirectionInbound
	contact := from
	if from.Address != "" && strings.EqualFold(from.Address, accountEmail) {
		direction = inbox.MessageDirectionOutbound
		contact = to
	}
	if contact.Address == "" {
		return inbox.NormalizedMessage{}, fmt.Errorf("message %s has no usable contact address", msg.Id)
	}

	bodyText, attachments := extractBodyAndAttachments(msg.Payload)
	if bodyText == "" {
		bodyText = msg.Snippet
	}

	sentAt := time.UnixMilli(msg.InternalDate)

	return inbox.NormalizedMessage{
		ExternalThreadID:   msg.ThreadId,
		ThreadSubject:      subject,
		ExternalMessageID:  msg.Id,
		Direction:          direction,
		ContactExternalID:  contact.Address,
		ContactDisplayName: contact.Name,
		BodyText:           bodyText,
		Attachments:        attachments,
		SentAt:             sentAt,
	}, nil
}

func headerValue(headers []*gmail.MessagePartHeader, name string) string {
	for _, h := range headers {
		if strings.EqualFold(h.Name, name) {
			return h.Value
		}
	}
	return ""
}

// parseFirstAddress extracts the first address out of a header value that
// may contain a display name ("Jane Doe <jane@example.com>") or a bare
// address - returns a zero mail.Address if the header is empty or
// unparseable, so callers can check .Address == "" rather than handling an
// error for what's usually just a missing header.
func parseFirstAddress(headerVal string) mail.Address {
	if strings.TrimSpace(headerVal) == "" {
		return mail.Address{}
	}
	addrs, err := mail.ParseAddressList(headerVal)
	if err != nil || len(addrs) == 0 {
		// Some real-world senders send slightly malformed headers that
		// net/mail rejects outright (e.g. an unquoted display name with a
		// comma) - falling back to ParseAddress on just the first
		// comma-delimited segment recovers the common case instead of
		// discarding the whole message's contact identity.
		first := strings.TrimSpace(strings.Split(headerVal, ",")[0])
		if a, err := mail.ParseAddress(first); err == nil {
			return *a
		}
		return mail.Address{}
	}
	return *addrs[0]
}

var replyPrefixRe = regexp.MustCompile(`(?i)^(re|fwd?)\s*:\s*`)

// stripReplyPrefix removes one leading "Re:"/"Fwd:" so a thread's stored
// subject stays stable across a whole back-and-forth instead of
// accumulating "Re: Re: Re: ..." as each reply's header gets stored -
// InboxThreadStore.Upsert overwrites the subject on every new message.
func stripReplyPrefix(subject string) string {
	return replyPrefixRe.ReplaceAllString(strings.TrimSpace(subject), "")
}

// extractBodyAndAttachments walks a (possibly multipart) message payload
// depth-first, preferring the first text/plain part it finds for the body
// and falling back to a crude tag-strip of text/html if no plain part
// exists - Gmail always sends at least one of the two for a real email.
// Any part with a Filename is collected as an attachment reference - not
// downloaded here (see Connector.FetchAttachment, called on demand via
// GmailAttachmentID the first time a user actually downloads it).
func extractBodyAndAttachments(part *gmail.MessagePart) (string, []inbox.Attachment) {
	var plainText, htmlText string
	var attachments []inbox.Attachment

	var walk func(p *gmail.MessagePart)
	walk = func(p *gmail.MessagePart) {
		if p == nil {
			return
		}
		if p.Filename != "" {
			attachments = append(attachments, inbox.Attachment{
				Filename:    p.Filename,
				ContentType: p.MimeType,
				Size:        bodySize(p.Body),
				GmailAttachmentID: func() string {
					if p.Body != nil {
						return p.Body.AttachmentId
					}
					return ""
				}(),
			})
			return
		}
		switch p.MimeType {
		case "text/plain":
			if plainText == "" {
				plainText = decodeBody(p.Body)
			}
			return
		case "text/html":
			if htmlText == "" {
				htmlText = decodeBody(p.Body)
			}
			return
		}
		for _, child := range p.Parts {
			walk(child)
		}
	}
	walk(part)

	if plainText != "" {
		return strings.TrimSpace(plainText), attachments
	}
	if htmlText != "" {
		return strings.TrimSpace(stripHTML(htmlText)), attachments
	}
	return "", attachments
}

func bodySize(body *gmail.MessagePartBody) int64 {
	if body == nil {
		return 0
	}
	return body.Size
}

func decodeBody(body *gmail.MessagePartBody) string {
	if body == nil || body.Data == "" {
		return ""
	}
	// Gmail encodes part bodies as unpadded base64url (RFC 4648 §5).
	decoded, err := base64.RawURLEncoding.DecodeString(body.Data)
	if err != nil {
		return ""
	}
	return string(decoded)
}

var (
	htmlTagRe   = regexp.MustCompile(`(?s)<[^>]*>`)
	htmlSpaceRe = regexp.MustCompile(`[ \t]+`)
)

// stripHTML is a deliberately crude fallback, not a real HTML renderer -
// only used when a message has no text/plain part at all, to give the
// triage UI and the agent something readable instead of raw markup.
func stripHTML(htmlText string) string {
	text := htmlTagRe.ReplaceAllString(htmlText, " ")
	text = htmlSpaceRe.ReplaceAllString(text, " ")
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimSpace(line)
	}
	return strings.Join(lines, "\n")
}
