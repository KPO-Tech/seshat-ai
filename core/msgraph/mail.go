package msgraph

import (
	"context"
	"fmt"
	"net/url"
	"strings"
)

// MailScopes are write-capable, unlike core/connectors' SharePointScopes
// (deliberately read-only, a Knowledge connector never writing back) -
// Outlook Mail is used for Inbox replies and agent-sent mail, so it needs
// Mail.Send too.
var MailScopes = []string{
	"openid",
	"profile",
	"offline_access",
	"https://graph.microsoft.com/Mail.Read",
	"https://graph.microsoft.com/Mail.Send",
}

// Message is one email as returned by a mail delta page.
type Message struct {
	ID               string           `json:"id"`
	ConversationID   string           `json:"conversationId"`
	Subject          string           `json:"subject"`
	BodyPreview      string           `json:"bodyPreview"`
	Body             *MessageBody     `json:"body,omitempty"`
	From             *Recipient       `json:"from,omitempty"`
	ToRecipients     []RecipientEntry `json:"toRecipients,omitempty"`
	ReceivedDateTime string           `json:"receivedDateTime"`
	Deleted          *struct{}        `json:"@removed,omitempty"`
}

type MessageBody struct {
	ContentType string `json:"contentType"`
	Content     string `json:"content"`
}

type RecipientEntry struct {
	EmailAddress EmailAddress `json:"emailAddress"`
}

type Recipient struct {
	EmailAddress EmailAddress `json:"emailAddress"`
}

type EmailAddress struct {
	Name    string `json:"name"`
	Address string `json:"address"`
}

type mailDeltaResponse struct {
	Value     []Message `json:"value"`
	NextLink  string    `json:"@odata.nextLink"`
	DeltaLink string    `json:"@odata.deltaLink"`
}

type mailListResponse struct {
	Value []Message `json:"value"`
}

const mailFields = "id,conversationId,subject,bodyPreview,from,toRecipients,receivedDateTime"

// ListMessagesDelta returns every inbox message changed since cursor (empty
// cursor = full enumeration, a first-ever sync), paging through
// @odata.nextLink internally and returning once @odata.deltaLink is
// reached - the caller only ever sees one logical page plus the new
// deltaLink to persist as the next cursor. Mirrors core/connectors'
// sharepoint deltaPage shape.
func (c *Client) ListMessagesDelta(ctx context.Context, cursor string) ([]Message, string, error) {
	url := cursor
	if url == "" {
		url = graphBaseURL + "/me/mailFolders/inbox/messages/delta?$select=" + mailFields
	}

	var messages []Message
	for {
		var page mailDeltaResponse
		if err := c.get(ctx, url, &page); err != nil {
			return nil, "", fmt.Errorf("mail delta page: %w", err)
		}
		messages = append(messages, page.Value...)
		if page.DeltaLink != "" {
			return messages, page.DeltaLink, nil
		}
		if page.NextLink == "" {
			return messages, cursor, nil
		}
		url = page.NextLink
	}
}

// LatestMessageInConversation returns the most recent message in a mail
// conversation (Graph's thread-equivalent) - used to build a properly
// threaded reply, since ReplyToMessage needs a specific message ID, not a
// conversation ID (what NormalizedMessage.ExternalThreadID actually stores
// for mail).
func (c *Client) LatestMessageInConversation(ctx context.Context, conversationID string) (*Message, error) {
	filter := "conversationId eq '" + strings.ReplaceAll(conversationID, "'", "''") + "'"
	q := url.Values{}
	q.Set("$filter", filter)
	q.Set("$orderby", "receivedDateTime desc")
	q.Set("$top", "1")
	q.Set("$select", mailFields)
	reqURL := graphBaseURL + "/me/mailFolders/inbox/messages?" + q.Encode()

	var page mailListResponse
	if err := c.get(ctx, reqURL, &page); err != nil {
		return nil, fmt.Errorf("find latest message in conversation %s: %w", conversationID, err)
	}
	if len(page.Value) == 0 {
		return nil, fmt.Errorf("no messages found in conversation %s", conversationID)
	}
	return &page.Value[0], nil
}

// ReplyToMessage replies to an existing message - Graph handles
// In-Reply-To/References threading natively, unlike Gmail's manual header
// construction.
func (c *Client) ReplyToMessage(ctx context.Context, messageID, body string) error {
	url := graphBaseURL + "/me/messages/" + messageID + "/reply"
	payload := map[string]string{"comment": body}
	return c.post(ctx, url, payload, nil)
}

// SendMail sends a fresh (non-reply) message.
func (c *Client) SendMail(ctx context.Context, to []string, subject, body string) error {
	recipients := make([]RecipientEntry, 0, len(to))
	for _, addr := range to {
		recipients = append(recipients, RecipientEntry{EmailAddress: EmailAddress{Address: addr}})
	}
	payload := map[string]any{
		"message": map[string]any{
			"subject":      subject,
			"body":         MessageBody{ContentType: "Text", Content: body},
			"toRecipients": recipients,
		},
		"saveToSentItems": true,
	}
	url := graphBaseURL + "/me/sendMail"
	return c.post(ctx, url, payload, nil)
}
