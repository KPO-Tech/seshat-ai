package query

import (
	"context"
	"testing"

	"github.com/EngineerProjects/seshat-ai/internal/bkerr"
	"github.com/EngineerProjects/seshat/pkg/sdk"
)

// ─── minimal runtime stubs ────────────────────────────────────────────────────

type stubRuntime struct {
	result *QueryResult
	err    error
}

func (r *stubRuntime) RunPrompt(_ context.Context, _ QueryInput) (*QueryResult, error) {
	return r.result, r.err
}

type stubStreamingRuntime struct {
	stubRuntime
	streamResult *QueryResult
	streamErr    error
}

func (r *stubStreamingRuntime) StreamPrompt(_ context.Context, _ QueryInput, _ func(sdk.ResponseChunk), _ func(sdk.RuntimeEvent)) (*QueryResult, error) {
	return r.streamResult, r.streamErr
}

// ─── SupportsStreaming ────────────────────────────────────────────────────────

func TestSupportsStreamingNilRuntime(t *testing.T) {
	svc := NewService(ServiceConfig{})
	if svc.SupportsStreaming() {
		t.Error("nil runtime should not support streaming")
	}
}

func TestSupportsStreamingNonStreamingRuntime(t *testing.T) {
	svc := NewService(ServiceConfig{Runtime: &stubRuntime{}})
	if svc.SupportsStreaming() {
		t.Error("non-streaming runtime should report false")
	}
}

func TestSupportsStreamingStreamingRuntime(t *testing.T) {
	svc := NewService(ServiceConfig{Runtime: &stubStreamingRuntime{}})
	if !svc.SupportsStreaming() {
		t.Error("streaming runtime should report true")
	}
}

// ─── RunPrompt guards ─────────────────────────────────────────────────────────

func TestRunPromptNilRuntimeReturnsUnavailable(t *testing.T) {
	svc := NewService(ServiceConfig{})
	_, err := svc.RunPrompt(context.Background(), nil, QueryInput{Prompt: "hello"})
	if bkerr.KindOf(err) != bkerr.ErrorKindUnavailable {
		t.Errorf("expected unavailable, got %v", err)
	}
}

func TestRunPromptEmptyPromptReturnsInvalidInput(t *testing.T) {
	svc := NewService(ServiceConfig{Runtime: &stubRuntime{}})
	_, err := svc.RunPrompt(context.Background(), nil, QueryInput{Prompt: "   "})
	if bkerr.KindOf(err) != bkerr.ErrorKindInvalidInput {
		t.Errorf("expected invalid_input, got %v", err)
	}
}

// ─── StreamPrompt guards ──────────────────────────────────────────────────────

func TestStreamPromptNilRuntimeReturnsUnavailable(t *testing.T) {
	svc := NewService(ServiceConfig{})
	_, err := svc.StreamPrompt(context.Background(), nil, QueryInput{Prompt: "hi"}, nil, nil)
	if bkerr.KindOf(err) != bkerr.ErrorKindUnavailable {
		t.Errorf("expected unavailable, got %v", err)
	}
}

func TestStreamPromptEmptyPromptReturnsInvalidInput(t *testing.T) {
	svc := NewService(ServiceConfig{Runtime: &stubStreamingRuntime{}})
	_, err := svc.StreamPrompt(context.Background(), nil, QueryInput{Prompt: ""}, nil, nil)
	if bkerr.KindOf(err) != bkerr.ErrorKindInvalidInput {
		t.Errorf("expected invalid_input, got %v", err)
	}
}

func TestStreamPromptNonStreamingRuntimeReturnsUnavailable(t *testing.T) {
	svc := NewService(ServiceConfig{Runtime: &stubRuntime{}})
	_, err := svc.StreamPrompt(context.Background(), nil, QueryInput{Prompt: "hi"}, nil, nil)
	if bkerr.KindOf(err) != bkerr.ErrorKindUnavailable {
		t.Errorf("expected unavailable for non-streaming runtime, got %v", err)
	}
}

// ─── encodeBinding / decodeBinding ───────────────────────────────────────────

func TestEncodeDecodeBinidngRoundtrip(t *testing.T) {
	cases := []struct {
		settingID string
		modelID   string
	}{
		{"setting-abc", "claude-3-5-sonnet"},
		{"setting-xyz", ""},
		{"", ""},
	}
	for _, tc := range cases {
		encoded := encodeBinding(tc.settingID, tc.modelID)
		gotSetting, gotModel := decodeBinding(encoded)
		if gotSetting != tc.settingID || gotModel != tc.modelID {
			t.Errorf("roundtrip(%q, %q): got (%q, %q)", tc.settingID, tc.modelID, gotSetting, gotModel)
		}
	}
}

func TestDecodeBindingEmptyString(t *testing.T) {
	s, m := decodeBinding("")
	if s != "" || m != "" {
		t.Errorf("expected empty, got (%q, %q)", s, m)
	}
}

func TestEncodeBindingEmptySettingIDReturnsEmpty(t *testing.T) {
	if got := encodeBinding("", "some-model"); got != "" {
		t.Errorf("expected empty for empty settingID, got %q", got)
	}
}

// ─── listSessionsUnscoped ─────────────────────────────────────────────────────

func TestListSessionsUnscopedNilSessionsReturnsEmpty(t *testing.T) {
	svc := NewService(ServiceConfig{Sessions: nil})
	sessions, err := svc.listSessionsUnscoped()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(sessions) != 0 {
		t.Errorf("expected empty slice, got %v", sessions)
	}
}

// ─── checkSessionAccess ───────────────────────────────────────────────────────

func TestCheckSessionAccessNilOwnershipAlwaysPasses(t *testing.T) {
	svc := NewService(ServiceConfig{})
	// With no ownership store, any session ID (even non-empty) passes.
	if err := svc.checkSessionAccess(context.Background(), nil, "any-session-id"); err != nil {
		t.Errorf("expected nil error, got %v", err)
	}
}

func TestCheckSessionAccessBlankIDAlwaysPasses(t *testing.T) {
	svc := NewService(ServiceConfig{})
	if err := svc.checkSessionAccess(context.Background(), nil, ""); err != nil {
		t.Errorf("expected nil error for blank session ID, got %v", err)
	}
}
