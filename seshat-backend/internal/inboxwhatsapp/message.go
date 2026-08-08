package inboxwhatsapp

import (
	"time"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types/events"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inbox"
)

// translateIncoming converts a whatsmeow message event into the
// channel-agnostic shape inbox.Service persists. Group chats are skipped
// (returns ok=false) - v1 scope is 1:1 conversations only, matching the
// restaurant-owner use case this was built for; group support is a
// deliberate later addition, not an oversight.
func translateIncoming(evt *events.Message) (msg inbox.NormalizedMessage, ok bool) {
	if evt == nil {
		return inbox.NormalizedMessage{}, false
	}
	if evt.Info.IsGroup {
		return inbox.NormalizedMessage{}, false
	}
	body := extractText(evt.Message)
	if body == "" {
		return inbox.NormalizedMessage{}, false
	}

	direction := inbox.MessageDirectionInbound
	if evt.Info.IsFromMe {
		direction = inbox.MessageDirectionOutbound
	}

	return inbox.NormalizedMessage{
		ExternalThreadID:   evt.Info.Chat.String(),
		ExternalMessageID:  evt.Info.ID,
		Direction:          direction,
		ContactExternalID:  evt.Info.Chat.String(),
		ContactDisplayName: evt.Info.PushName,
		BodyText:           body,
		SentAt:             sentAt(evt.Info.Timestamp),
	}, true
}

func sentAt(t time.Time) time.Time {
	if t.IsZero() {
		return time.Now()
	}
	return t
}

// extractText pulls a display-worthy text out of whatever message type
// WhatsApp sent - a plain chat message (Conversation), a message with a
// link preview (ExtendedTextMessage), or a caption on media. Media itself
// isn't downloaded here (same deliberate scope limit as the Gmail
// connector's attachment handling - metadata now, content on demand later).
func extractText(m *waE2E.Message) string {
	if m == nil {
		return ""
	}
	if t := m.GetConversation(); t != "" {
		return t
	}
	if ext := m.GetExtendedTextMessage(); ext != nil && ext.GetText() != "" {
		return ext.GetText()
	}
	if img := m.GetImageMessage(); img != nil && img.GetCaption() != "" {
		return img.GetCaption()
	}
	if doc := m.GetDocumentMessage(); doc != nil && doc.GetCaption() != "" {
		return doc.GetCaption()
	}
	if vid := m.GetVideoMessage(); vid != nil && vid.GetCaption() != "" {
		return vid.GetCaption()
	}
	return ""
}
