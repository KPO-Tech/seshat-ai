package inboxgmail

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inbox"
	gmail "google.golang.org/api/gmail/v1"
)

func b64(s string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(s))
}

func header(name, value string) *gmail.MessagePartHeader {
	return &gmail.MessagePartHeader{Name: name, Value: value}
}

func TestTranslateMessage_InboundPlainText(t *testing.T) {
	msg := &gmail.Message{
		Id:           "msg-1",
		ThreadId:     "thread-1",
		InternalDate: 1700000000000,
		Snippet:      "fallback snippet",
		Payload: &gmail.MessagePart{
			MimeType: "text/plain",
			Headers: []*gmail.MessagePartHeader{
				header("From", "Jane Client <jane@example.com>"),
				header("To", "owner@restaurant.com"),
				header("Subject", "Table for 4 tonight?"),
			},
			Body: &gmail.MessagePartBody{Data: b64("Is there space for 4 tonight?")},
		},
	}

	n, err := translateMessage(msg, "owner@restaurant.com")
	if err != nil {
		t.Fatalf("translateMessage: %v", err)
	}
	if n.Direction != inbox.MessageDirectionInbound {
		t.Errorf("expected inbound, got %q", n.Direction)
	}
	if n.ContactExternalID != "jane@example.com" || n.ContactDisplayName != "Jane Client" {
		t.Errorf("expected contact jane@example.com/Jane Client, got %q/%q", n.ContactExternalID, n.ContactDisplayName)
	}
	if n.BodyText != "Is there space for 4 tonight?" {
		t.Errorf("unexpected body: %q", n.BodyText)
	}
	if n.ThreadSubject != "Table for 4 tonight?" {
		t.Errorf("unexpected subject: %q", n.ThreadSubject)
	}
	if n.ExternalThreadID != "thread-1" || n.ExternalMessageID != "msg-1" {
		t.Errorf("unexpected IDs: thread=%q message=%q", n.ExternalThreadID, n.ExternalMessageID)
	}
	if !n.SentAt.Equal(time.UnixMilli(1700000000000)) {
		t.Errorf("unexpected SentAt: %v", n.SentAt)
	}
}

func TestTranslateMessage_OutboundDetectedFromAccountEmail(t *testing.T) {
	msg := &gmail.Message{
		Id:       "msg-2",
		ThreadId: "thread-1",
		Payload: &gmail.MessagePart{
			MimeType: "text/plain",
			Headers: []*gmail.MessagePartHeader{
				header("From", "owner@restaurant.com"),
				header("To", "jane@example.com"),
				header("Subject", "Re: Table for 4 tonight?"),
			},
			Body: &gmail.MessagePartBody{Data: b64("Yes, see you at 8pm!")},
		},
	}

	n, err := translateMessage(msg, "owner@restaurant.com")
	if err != nil {
		t.Fatalf("translateMessage: %v", err)
	}
	if n.Direction != inbox.MessageDirectionOutbound {
		t.Errorf("expected outbound, got %q", n.Direction)
	}
	if n.ContactExternalID != "jane@example.com" {
		t.Errorf("expected contact to be the recipient, got %q", n.ContactExternalID)
	}
	// "Re: " should be stripped so the stored thread subject stays stable.
	if n.ThreadSubject != "Table for 4 tonight?" {
		t.Errorf("expected Re: prefix stripped, got %q", n.ThreadSubject)
	}
}

func TestTranslateMessage_MultipartPrefersPlainTextOverHTML(t *testing.T) {
	msg := &gmail.Message{
		Id:       "msg-3",
		ThreadId: "thread-2",
		Payload: &gmail.MessagePart{
			MimeType: "multipart/alternative",
			Headers: []*gmail.MessagePartHeader{
				header("From", "jane@example.com"),
				header("To", "owner@restaurant.com"),
			},
			Parts: []*gmail.MessagePart{
				{MimeType: "text/html", Body: &gmail.MessagePartBody{Data: b64("<p>Hi <b>there</b></p>")}},
				{MimeType: "text/plain", Body: &gmail.MessagePartBody{Data: b64("Hi there")}},
			},
		},
	}

	n, err := translateMessage(msg, "owner@restaurant.com")
	if err != nil {
		t.Fatalf("translateMessage: %v", err)
	}
	if n.BodyText != "Hi there" {
		t.Errorf("expected plain text part to win, got %q", n.BodyText)
	}
}

func TestTranslateMessage_FallsBackToHTMLWhenNoPlainTextPart(t *testing.T) {
	msg := &gmail.Message{
		Id:       "msg-4",
		ThreadId: "thread-3",
		Payload: &gmail.MessagePart{
			MimeType: "text/html",
			Headers: []*gmail.MessagePartHeader{
				header("From", "jane@example.com"),
				header("To", "owner@restaurant.com"),
			},
			Body: &gmail.MessagePartBody{Data: b64("<p>Hello <b>World</b></p>")},
		},
	}

	n, err := translateMessage(msg, "owner@restaurant.com")
	if err != nil {
		t.Fatalf("translateMessage: %v", err)
	}
	if n.BodyText != "Hello World" {
		t.Errorf("expected stripped HTML fallback, got %q", n.BodyText)
	}
}

func TestTranslateMessage_FallsBackToSnippetWhenNoBodyAtAll(t *testing.T) {
	msg := &gmail.Message{
		Id:       "msg-5",
		ThreadId: "thread-4",
		Snippet:  "a short preview",
		Payload: &gmail.MessagePart{
			MimeType: "application/octet-stream",
			Headers: []*gmail.MessagePartHeader{
				header("From", "jane@example.com"),
				header("To", "owner@restaurant.com"),
			},
		},
	}

	n, err := translateMessage(msg, "owner@restaurant.com")
	if err != nil {
		t.Fatalf("translateMessage: %v", err)
	}
	if n.BodyText != "a short preview" {
		t.Errorf("expected snippet fallback, got %q", n.BodyText)
	}
}

func TestTranslateMessage_CollectsAttachmentMetadata(t *testing.T) {
	msg := &gmail.Message{
		Id:       "msg-6",
		ThreadId: "thread-5",
		Payload: &gmail.MessagePart{
			MimeType: "multipart/mixed",
			Headers: []*gmail.MessagePartHeader{
				header("From", "jane@example.com"),
				header("To", "owner@restaurant.com"),
			},
			Parts: []*gmail.MessagePart{
				{MimeType: "text/plain", Body: &gmail.MessagePartBody{Data: b64("See attached invoice.")}},
				{
					MimeType: "application/pdf",
					Filename: "invoice.pdf",
					Body:     &gmail.MessagePartBody{AttachmentId: "att-1", Size: 12345},
				},
			},
		},
	}

	n, err := translateMessage(msg, "owner@restaurant.com")
	if err != nil {
		t.Fatalf("translateMessage: %v", err)
	}
	if n.AttachmentsJSON == "[]" || n.AttachmentsJSON == "" {
		t.Fatal("expected non-empty attachments JSON")
	}
	if !containsAll(n.AttachmentsJSON, `"filename":"invoice.pdf"`, `"gmail_attachment_id":"att-1"`, `"size":12345`) {
		t.Errorf("attachments JSON missing expected fields: %s", n.AttachmentsJSON)
	}
}

func TestTranslateMessage_RejectsMessageWithNoUsableContact(t *testing.T) {
	msg := &gmail.Message{
		Id:       "msg-7",
		ThreadId: "thread-6",
		Payload: &gmail.MessagePart{
			MimeType: "text/plain",
			Headers:  []*gmail.MessagePartHeader{}, // no From/To at all
			Body:     &gmail.MessagePartBody{Data: b64("orphan")},
		},
	}
	if _, err := translateMessage(msg, "owner@restaurant.com"); err == nil {
		t.Fatal("expected an error when neither From nor To can be resolved")
	}
}

func TestParseFirstAddress(t *testing.T) {
	cases := []struct {
		in       string
		wantAddr string
		wantName string
	}{
		{"jane@example.com", "jane@example.com", ""},
		{"Jane Doe <jane@example.com>", "jane@example.com", "Jane Doe"},
		{"", "", ""},
		{"Jane Doe <jane@example.com>, John <john@example.com>", "jane@example.com", "Jane Doe"},
	}
	for _, c := range cases {
		got := parseFirstAddress(c.in)
		if got.Address != c.wantAddr || got.Name != c.wantName {
			t.Errorf("parseFirstAddress(%q) = %+v, want addr=%q name=%q", c.in, got, c.wantAddr, c.wantName)
		}
	}
}

func TestStripReplyPrefix(t *testing.T) {
	cases := map[string]string{
		"Re: Table for 4":     "Table for 4",
		"RE: Table for 4":     "Table for 4",
		"Fwd: Table for 4":    "Table for 4",
		"Fw: Table for 4":     "Table for 4",
		"Table for 4":         "Table for 4",
		"Re: Re: Table for 4": "Re: Table for 4", // only strips one leading prefix per call
	}
	for in, want := range cases {
		if got := stripReplyPrefix(in); got != want {
			t.Errorf("stripReplyPrefix(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestBuildRawMessage_DecodesToExpectedRFC2822(t *testing.T) {
	raw := buildRawMessage("jane@example.com", "Re: Table for 4", "Yes!", "<msg1@mail.gmail.com>", "<msg1@mail.gmail.com>")
	decoded, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		t.Fatalf("decode raw message: %v", err)
	}
	s := string(decoded)
	for _, want := range []string{"To: jane@example.com", "Subject: Re: Table for 4", "In-Reply-To: <msg1@mail.gmail.com>", "References: <msg1@mail.gmail.com>", "Yes!"} {
		if !containsAll(s, want) {
			t.Errorf("expected raw message to contain %q, got:\n%s", want, s)
		}
	}
}

func containsAll(haystack string, needles ...string) bool {
	for _, n := range needles {
		if !strings.Contains(haystack, n) {
			return false
		}
	}
	return true
}
