package workspacechat

import (
	"testing"
	"time"

	"github.com/KPO-Tech/seshat/pkg/sdk"
)

// These exercise sdkSessionBackend directly against newTestEnv's real
// SQLite database - the contract it must satisfy (LoadSession errors on
// not-found, LoadCheckpoint returns nil/nil on not-found, transcript order
// is entry_index order, AppendTranscriptEntries picks up where the table
// left off, ReplaceTranscript truncates first) comes straight from the
// seshat SDK's own reference SQLite backend (internal/runtime/state/
// sqlite_backend.go) and its test suite - see sdksessionstore.go's doc
// comment for why matching it exactly matters (state.Store, the generic
// wrapper this backend gets composed into via sdk.NewSessionStoreWithBackend,
// hard-fails RestoreSessionState on a checkpoint mismatch, so a subtly
// wrong ordering or a not-found miscategorized as a zero-value success
// would surface as a real "resume failed" error in production, not just a
// wrong test assertion here).

func TestSDKSessionBackendLoadSessionErrorsWhenNotFound(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.chat.sdkSessions.LoadSession("wchat_missing"); err == nil {
		t.Fatal("expected an error loading a session that was never saved")
	}
}

func TestSDKSessionBackendSaveAndLoadSessionRoundTrips(t *testing.T) {
	env := newTestEnv(t)
	backend := env.chat.sdkSessions

	now := time.Now().UTC().Truncate(time.Second)
	original := &sdk.SessionMetadata{
		ID:         "wchat_roundtrip",
		Title:      "untitled_session_1",
		Status:     sdk.SessionStatusActive,
		CreatedAt:  now,
		UpdatedAt:  now,
		Model:      "glm-4.5",
		TotalTurns: 2,
		Additional: map[string]any{"canonical_transcript": map[string]any{"message_count": float64(4)}},
	}
	if err := backend.SaveSession(original.ID, original); err != nil {
		t.Fatalf("SaveSession: %v", err)
	}

	loaded, err := backend.LoadSession(original.ID)
	if err != nil {
		t.Fatalf("LoadSession: %v", err)
	}
	if loaded.Title != original.Title || loaded.Status != original.Status || loaded.Model != original.Model || loaded.TotalTurns != original.TotalTurns {
		t.Fatalf("round-tripped metadata mismatch: got %+v, want %+v", loaded, original)
	}
	if loaded.Additional == nil || loaded.Additional["canonical_transcript"] == nil {
		t.Fatalf("expected Additional to round-trip, got %+v", loaded.Additional)
	}

	// A second save for the same ID must update in place, not duplicate -
	// mirrors the SQLite reference backend's ON CONFLICT upsert.
	original.TotalTurns = 5
	original.Status = sdk.SessionStatusClosed
	if err := backend.SaveSession(original.ID, original); err != nil {
		t.Fatalf("SaveSession (update): %v", err)
	}
	updated, err := backend.LoadSession(original.ID)
	if err != nil {
		t.Fatalf("LoadSession (after update): %v", err)
	}
	if updated.TotalTurns != 5 || updated.Status != sdk.SessionStatusClosed {
		t.Fatalf("expected update to overwrite in place, got %+v", updated)
	}

	ids, err := backend.ListSessions()
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	if len(ids) != 1 || ids[0] != original.ID {
		t.Fatalf("expected exactly [%s] from ListSessions, got %v", original.ID, ids)
	}
}

func TestSDKSessionBackendEnsureSessionExistsIsIdempotent(t *testing.T) {
	env := newTestEnv(t)
	backend := env.chat.sdkSessions
	sessionID := sdk.SessionID("wchat_ensure")

	if err := backend.ensureSessionExists(sessionID); err != nil {
		t.Fatalf("ensureSessionExists (first call): %v", err)
	}
	first, err := backend.LoadSession(sessionID)
	if err != nil {
		t.Fatalf("LoadSession after first ensure: %v", err)
	}
	if first.Status != sdk.SessionStatusActive {
		t.Fatalf("expected a freshly seeded session to be active, got %q", first.Status)
	}

	// Simulate a real turn having happened (a non-default TotalTurns), then
	// call ensureSessionExists again - it must be a true no-op once a row
	// already exists, or a resumed conversation would keep getting silently
	// reset back to zero turns on every subsequent getOrCreateSession call.
	first.TotalTurns = 3
	if err := backend.SaveSession(sessionID, first); err != nil {
		t.Fatalf("SaveSession (simulate a turn): %v", err)
	}
	if err := backend.ensureSessionExists(sessionID); err != nil {
		t.Fatalf("ensureSessionExists (second call): %v", err)
	}
	after, err := backend.LoadSession(sessionID)
	if err != nil {
		t.Fatalf("LoadSession after second ensure: %v", err)
	}
	if after.TotalTurns != 3 {
		t.Fatalf("ensureSessionExists must not touch an existing session, but TotalTurns went from 3 to %d", after.TotalTurns)
	}
}

func TestSDKSessionBackendTranscriptAppendOrderAndReplace(t *testing.T) {
	env := newTestEnv(t)
	backend := env.chat.sdkSessions
	sessionID := sdk.SessionID("wchat_transcript")

	first := sdk.TranscriptEntry{ID: "msg-1", Type: sdk.EntryTypeMessage, Role: sdk.RoleUser, Content: []sdk.ContentBlock{sdk.TextContent{Text: "hello"}}, Timestamp: time.Now().UTC()}
	second := sdk.TranscriptEntry{ID: "msg-2", Type: sdk.EntryTypeMessage, Role: sdk.RoleAssistant, Content: []sdk.ContentBlock{sdk.TextContent{Text: "hi there"}}, Timestamp: time.Now().UTC()}
	if err := backend.AppendTranscriptEntries(sessionID, []sdk.TranscriptEntry{first}); err != nil {
		t.Fatalf("AppendTranscriptEntries (first): %v", err)
	}
	if err := backend.AppendTranscriptEntries(sessionID, []sdk.TranscriptEntry{second}); err != nil {
		t.Fatalf("AppendTranscriptEntries (second): %v", err)
	}

	loaded, err := backend.LoadTranscript(sessionID)
	if err != nil {
		t.Fatalf("LoadTranscript: %v", err)
	}
	if len(loaded) != 2 {
		t.Fatalf("expected 2 transcript entries, got %d", len(loaded))
	}
	if loaded[0].ID != first.ID || loaded[1].ID != second.ID {
		t.Fatalf("expected append order [%s, %s], got [%s, %s]", first.ID, second.ID, loaded[0].ID, loaded[1].ID)
	}
	gotText, ok := loaded[0].Content[0].(sdk.TextContent)
	if !ok || gotText.Text != "hello" {
		t.Fatalf("expected content block to round-trip through the polymorphic ContentBlock JSON envelope, got %+v", loaded[0].Content)
	}

	// ReplaceTranscript must truncate, not append past whatever was there -
	// this is what SyncTranscriptMessages falls back to after a compaction
	// rewrites history (see the research this backend is based on).
	third := sdk.TranscriptEntry{ID: "msg-3", Type: sdk.EntryTypeCompact, Role: sdk.RoleSystem, Content: []sdk.ContentBlock{sdk.TextContent{Text: "summary"}}, Timestamp: time.Now().UTC()}
	if err := backend.ReplaceTranscript(sessionID, []sdk.TranscriptEntry{third}); err != nil {
		t.Fatalf("ReplaceTranscript: %v", err)
	}
	afterReplace, err := backend.LoadTranscript(sessionID)
	if err != nil {
		t.Fatalf("LoadTranscript (after replace): %v", err)
	}
	if len(afterReplace) != 1 || afterReplace[0].ID != third.ID {
		t.Fatalf("expected ReplaceTranscript to leave exactly [%s], got %v", third.ID, afterReplace)
	}
}

func TestSDKSessionBackendCheckpointsAreNoOps(t *testing.T) {
	env := newTestEnv(t)
	backend := env.chat.sdkSessions

	if err := backend.SaveCheckpoint("wchat_x", &sdk.Checkpoint{SessionID: "wchat_x", TurnNumber: 1}); err != nil {
		t.Fatalf("SaveCheckpoint should be a harmless no-op, got error: %v", err)
	}
	checkpoint, err := backend.LoadCheckpoint("wchat_x")
	if err != nil {
		t.Fatalf("LoadCheckpoint should never error, got: %v", err)
	}
	if checkpoint != nil {
		t.Fatalf("LoadCheckpoint must always return nil (see the type doc comment on why), got %+v", checkpoint)
	}
}

func TestSDKSessionBackendDeleteSessionRemovesMetadataAndTranscript(t *testing.T) {
	env := newTestEnv(t)
	backend := env.chat.sdkSessions
	sessionID := sdk.SessionID("wchat_delete_me")

	if err := backend.ensureSessionExists(sessionID); err != nil {
		t.Fatalf("ensureSessionExists: %v", err)
	}
	if err := backend.AppendTranscriptEntries(sessionID, []sdk.TranscriptEntry{
		{ID: "msg-1", Type: sdk.EntryTypeMessage, Role: sdk.RoleUser, Content: []sdk.ContentBlock{sdk.TextContent{Text: "hi"}}, Timestamp: time.Now().UTC()},
	}); err != nil {
		t.Fatalf("AppendTranscriptEntries: %v", err)
	}

	if err := backend.DeleteSession(sessionID); err != nil {
		t.Fatalf("DeleteSession: %v", err)
	}
	if _, err := backend.LoadSession(sessionID); err == nil {
		t.Fatal("expected LoadSession to fail after DeleteSession")
	}
	transcript, err := backend.LoadTranscript(sessionID)
	if err != nil {
		t.Fatalf("LoadTranscript after delete: %v", err)
	}
	if len(transcript) != 0 {
		t.Fatalf("expected an empty transcript after DeleteSession, got %d entries", len(transcript))
	}
}

func TestSDKSessionBackendSearchTranscriptsByContent(t *testing.T) {
	env := newTestEnv(t)
	backend := env.chat.sdkSessions

	matching := sdk.SessionID("wchat_search_match")
	other := sdk.SessionID("wchat_search_other")
	if err := backend.AppendTranscriptEntries(matching, []sdk.TranscriptEntry{
		{ID: "m1", Type: sdk.EntryTypeMessage, Role: sdk.RoleUser, Content: []sdk.ContentBlock{sdk.TextContent{Text: "the secret word is PINEAPPLE42"}}, Timestamp: time.Now().UTC()},
	}); err != nil {
		t.Fatalf("AppendTranscriptEntries (matching): %v", err)
	}
	if err := backend.AppendTranscriptEntries(other, []sdk.TranscriptEntry{
		{ID: "m2", Type: sdk.EntryTypeMessage, Role: sdk.RoleUser, Content: []sdk.ContentBlock{sdk.TextContent{Text: "totally unrelated content"}}, Timestamp: time.Now().UTC()},
	}); err != nil {
		t.Fatalf("AppendTranscriptEntries (other): %v", err)
	}

	// Case-insensitive on purpose (LOWER()+LIKE) - matches the reference
	// backend's own case-insensitive substring search.
	got, err := backend.SearchTranscriptsByContent("pineapple42", 10)
	if err != nil {
		t.Fatalf("SearchTranscriptsByContent: %v", err)
	}
	if len(got) != 1 || got[0] != matching {
		t.Fatalf("expected exactly [%s], got %v", matching, got)
	}
}
