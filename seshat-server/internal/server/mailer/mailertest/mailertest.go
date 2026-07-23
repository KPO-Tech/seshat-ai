// Package mailertest provides a fake mailer.Sender for tests that need to
// assert an email was (or wasn't) sent without a real SMTP round-trip —
// mirrors the stdlib net/http/httptest convention of keeping test doubles
// out of the production package they're doubling for.
package mailertest

import (
	"context"
	"sync"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mailer"
)

// FakeSender records every message handed to it instead of sending
// anything. Safe for concurrent use since iam.Service methods run inside
// database transactions that may retry.
type FakeSender struct {
	mu       sync.Mutex
	messages []mailer.Message
}

func New() *FakeSender {
	return &FakeSender{}
}

func (f *FakeSender) Send(_ context.Context, msg mailer.Message) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.messages = append(f.messages, msg)
	return nil
}

// Messages returns a snapshot of every message sent so far.
func (f *FakeSender) Messages() []mailer.Message {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]mailer.Message, len(f.messages))
	copy(out, f.messages)
	return out
}
