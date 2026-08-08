package inboxwhatsapp

import (
	"testing"
	"time"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inbox"
)

func chatJID() types.JID { return types.NewJID("15551234567", "s.whatsapp.net") }

func TestTranslateIncoming_InboundPlainText(t *testing.T) {
	ts := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	evt := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{Chat: chatJID(), Sender: chatJID(), IsFromMe: false, IsGroup: false},
			ID:            "wa-msg-1",
			PushName:      "Restaurant Regular",
			Timestamp:     ts,
		},
		Message: &waE2E.Message{Conversation: proto.String("Table for 4 tonight?")},
	}

	n, ok := translateIncoming(evt)
	if !ok {
		t.Fatal("expected translateIncoming to succeed")
	}
	if n.Direction != inbox.MessageDirectionInbound {
		t.Errorf("expected inbound, got %q", n.Direction)
	}
	if n.BodyText != "Table for 4 tonight?" {
		t.Errorf("unexpected body: %q", n.BodyText)
	}
	if n.ContactDisplayName != "Restaurant Regular" {
		t.Errorf("unexpected contact name: %q", n.ContactDisplayName)
	}
	if n.ContactExternalID != chatJID().String() || n.ExternalThreadID != chatJID().String() {
		t.Errorf("unexpected JID-derived IDs: contact=%q thread=%q", n.ContactExternalID, n.ExternalThreadID)
	}
	if !n.SentAt.Equal(ts) {
		t.Errorf("unexpected SentAt: %v", n.SentAt)
	}
}

func TestTranslateIncoming_OutboundWhenFromMe(t *testing.T) {
	evt := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{Chat: chatJID(), IsFromMe: true, IsGroup: false},
			ID:            "wa-msg-2",
			Timestamp:     time.Now(),
		},
		Message: &waE2E.Message{Conversation: proto.String("Yes, see you at 8pm!")},
	}
	n, ok := translateIncoming(evt)
	if !ok {
		t.Fatal("expected translateIncoming to succeed")
	}
	if n.Direction != inbox.MessageDirectionOutbound {
		t.Errorf("expected outbound, got %q", n.Direction)
	}
}

func TestTranslateIncoming_SkipsGroupChats(t *testing.T) {
	evt := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{Chat: chatJID(), IsGroup: true},
			ID:            "wa-msg-3",
			Timestamp:     time.Now(),
		},
		Message: &waE2E.Message{Conversation: proto.String("hello group")},
	}
	if _, ok := translateIncoming(evt); ok {
		t.Fatal("expected group chat messages to be skipped")
	}
}

func TestTranslateIncoming_SkipsMessagesWithNoExtractableText(t *testing.T) {
	evt := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{Chat: chatJID()},
			ID:            "wa-msg-4",
			Timestamp:     time.Now(),
		},
		Message: &waE2E.Message{}, // e.g. a sticker/reaction with nothing extractable
	}
	if _, ok := translateIncoming(evt); ok {
		t.Fatal("expected a message with no extractable text to be skipped")
	}
}

func TestTranslateIncoming_NilEventIsSkipped(t *testing.T) {
	if _, ok := translateIncoming(nil); ok {
		t.Fatal("expected a nil event to be skipped")
	}
}

func TestExtractText(t *testing.T) {
	cases := []struct {
		name string
		msg  *waE2E.Message
		want string
	}{
		{"nil message", nil, ""},
		{"conversation", &waE2E.Message{Conversation: proto.String("hi")}, "hi"},
		{"extended text", &waE2E.Message{ExtendedTextMessage: &waE2E.ExtendedTextMessage{Text: proto.String("hi with link")}}, "hi with link"},
		{"image caption", &waE2E.Message{ImageMessage: &waE2E.ImageMessage{Caption: proto.String("nice photo")}}, "nice photo"},
		{"document caption", &waE2E.Message{DocumentMessage: &waE2E.DocumentMessage{Caption: proto.String("invoice attached")}}, "invoice attached"},
		{"video caption", &waE2E.Message{VideoMessage: &waE2E.VideoMessage{Caption: proto.String("see this")}}, "see this"},
		{"empty message", &waE2E.Message{}, ""},
	}
	for _, c := range cases {
		if got := extractText(c.msg); got != c.want {
			t.Errorf("%s: extractText() = %q, want %q", c.name, got, c.want)
		}
	}
}
