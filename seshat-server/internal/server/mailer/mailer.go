// Package mailer sends transactional email. Deliberately minimal - every
// consumer so far (invitation accept links, password reset links) is a
// short plain-text message with one link, so there's no template engine,
// no HTML, no attachments here. Sending is always a best-effort side
// effect on the caller's side (see iam.Service.SetMailer's doc comment) -
// this package's job is only "given a Message, deliver it or return an
// error," never deciding whether the caller should treat delivery as
// required.
package mailer

import (
	"context"
	"fmt"
	"net/smtp"
	"strings"
)

// Message is a plain-text email to send.
type Message struct {
	To       string
	Subject  string
	TextBody string
}

// Sender abstracts email delivery so callers can be tested against a fake
// instead of a real SMTP round-trip, and so "no mailer configured" is
// representable as a nil Sender rather than a special case at every call
// site that wants to send mail.
type Sender interface {
	Send(ctx context.Context, msg Message) error
}

// Config is intentionally provider-agnostic - the same shape works for
// Mailpit (no auth, no TLS, local dev/test) and a real relay (STARTTLS +
// AUTH, e.g. SendGrid/Mailgun/SES's SMTP interface, or Gmail) in
// production; only the values differ.
type Config struct {
	Host     string
	Port     int
	Username string
	Password string
	// From is the full header value, e.g. "Seshat <noreply@seshat.local>".
	From string
}

// SMTPSender sends mail over stdlib net/smtp. Uses PLAIN auth when
// Username is set (a real provider); skips auth entirely when it's empty
// (Mailpit, which accepts anything unauthenticated on a local network).
type SMTPSender struct {
	cfg Config
}

func NewSMTPSender(cfg Config) *SMTPSender {
	return &SMTPSender{cfg: cfg}
}

// SMTPTarget exposes just the host/port a network diagnostic can probe -
// never Username/Password. Implements an optional capability interface a
// caller can type-assert for (see iam.Service.RunNetworkDiagnostics), kept
// out of the Sender interface itself since most Sender implementations
// (test doubles included) have no meaningful target to report.
func (s *SMTPSender) SMTPTarget() (host string, port int, ok bool) {
	return s.cfg.Host, s.cfg.Port, s.cfg.Host != ""
}

func (s *SMTPSender) Send(ctx context.Context, msg Message) error {
	// net/smtp has no context support - respect cancellation only at this
	// boundary. The send itself is a single blocking call kept short by
	// design (small plain-text bodies, a local relay or Mailpit target).
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	addr := fmt.Sprintf("%s:%d", s.cfg.Host, s.cfg.Port)

	var auth smtp.Auth
	if s.cfg.Username != "" {
		auth = smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)
	}

	from := s.cfg.From
	if from == "" {
		from = "noreply@seshat.local"
	}

	body := buildPlainTextMessage(from, msg.To, msg.Subject, msg.TextBody)
	return smtp.SendMail(addr, auth, envelopeAddress(from), []string{msg.To}, body)
}

func buildPlainTextMessage(from, to, subject, textBody string) []byte {
	var b strings.Builder
	b.WriteString("From: " + from + "\r\n")
	b.WriteString("To: " + to + "\r\n")
	b.WriteString("Subject: " + subject + "\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=\"UTF-8\"\r\n")
	b.WriteString("\r\n")
	b.WriteString(textBody)
	return []byte(b.String())
}

// envelopeAddress extracts the bare email from a "Name <email>" From
// header - the SMTP MAIL FROM envelope command needs a plain address, not
// the display-name form.
func envelopeAddress(from string) string {
	start := strings.Index(from, "<")
	end := strings.Index(from, ">")
	if start != -1 && end > start {
		return from[start+1 : end]
	}
	return from
}
