package workspacechat

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/KPO-Tech/seshat/pkg/sdk"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// sdkSessionBackend implements sdk.SessionBackend (10 methods) against this
// server's shared DB, so an sdk.Client's own conversation memory survives
// whatever forces a brand-new sdk.Client for an existing chat session - a
// server restart, workspacechat's own 2h idle eviction (evictStaleLocked),
// or a mid-conversation provider/model switch (each discards the old
// in-memory sdk.Session - see getOrCreateSession's cache-miss branch).
// Without this, client.CreateSession always started an empty conversation
// and the LLM silently forgot everything, even though the console kept
// showing the full history - a completely separate, already-durable UI
// event log (see WorkspaceChatMessageRecord's own doc comment) that was
// never fed back into the LLM. That mismatch (UI shows continuity, model
// has none) was reported live as "the agent loses all context, like it's
// starting from scratch" - confirmed first via a direct two-turn same-
// session/same-provider test (context WAS retained, ruling out a bug in
// ordinary continuous use), then traced to every one of the three
// cache-miss paths above discarding history instead of resuming it.
//
// Modeled directly on the SDK's own reference implementation
// (internal/runtime/state/sqlite_backend.go in the seshat module) - same
// two-table shape (session metadata + an ordered transcript-entry table),
// against this server's shared DB instead of a private SQLite file.
// Checkpoints are intentionally not persisted (SaveCheckpoint is a no-op,
// LoadCheckpoint always returns nil) - the SDK's own state.Store (the
// generic 16-method sdk.SessionStore this backend gets wrapped into, via
// sdk.NewSessionStoreWithBackend / ClientConfig.SessionBackend) treats a
// nil checkpoint as "nothing to validate against" and skips its
// hash-mismatch check entirely, confirmed against the SDK's own source -
// so this is a real, deliberate simplification, not a correctness gap: it
// just means this backend trusts its own transcript table directly
// instead of additionally cross-checking it against a separately stored
// hash of the same data.
//
// Session IDs are the exact same string as WorkspaceChatSession.ID (the
// console-generated "wchat_<uuid>") - there is no separate SDK-side ID
// space to reconcile. sdk.Client.CreateSession cannot be told to use a
// caller-supplied ID (it always mints its own), so this backend never
// calls it: resumeOrCreateSDKSession always goes through
// client.LoadSession, first calling ensureSessionExists to seed an empty-
// but-valid metadata row on a genuine first turn - LoadSession then
// succeeds immediately with zero prior messages, identical in effect to
// CreateSession, just under the ID this server already uses everywhere
// else for this conversation.
type sdkSessionBackend struct {
	db *sdb.DB
}

func newSDKSessionBackend(database *sdb.DB) *sdkSessionBackend {
	return &sdkSessionBackend{db: database}
}

var _ sdk.SessionBackend = (*sdkSessionBackend)(nil)

func (b *sdkSessionBackend) SaveSession(sessionID sdk.SessionID, metadata *sdk.SessionMetadata) error {
	data, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("marshal session metadata: %w", err)
	}
	now := time.Now().UTC()
	return b.db.Gorm().Transaction(func(tx *gorm.DB) error {
		var existing sdb.WorkspaceChatSDKSessionMetadata
		err := tx.Where("sdk_session_id = ?", string(sessionID)).First(&existing).Error
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			return tx.Create(&sdb.WorkspaceChatSDKSessionMetadata{
				SDKSessionID: string(sessionID),
				Status:       string(metadata.Status),
				MetadataJSON: string(data),
				CreatedAt:    now,
				UpdatedAt:    now,
			}).Error
		case err != nil:
			return err
		default:
			return tx.Model(&existing).Updates(map[string]any{
				"status":        string(metadata.Status),
				"metadata_json": string(data),
				"updated_at":    now,
			}).Error
		}
	})
}

func (b *sdkSessionBackend) LoadSession(sessionID sdk.SessionID) (*sdk.SessionMetadata, error) {
	var row sdb.WorkspaceChatSDKSessionMetadata
	err := b.db.Gorm().Where("sdk_session_id = ?", string(sessionID)).First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("failed to read metadata: session %s not found", sessionID)
		}
		return nil, err
	}
	var metadata sdk.SessionMetadata
	if err := json.Unmarshal([]byte(row.MetadataJSON), &metadata); err != nil {
		return nil, fmt.Errorf("unmarshal session metadata: %w", err)
	}
	return &metadata, nil
}

// ensureSessionExists seeds a fresh, empty metadata row for sessionID if
// none exists yet (a genuine first turn for this chat session) - a no-op
// once one does. Called before every client.LoadSession in
// resumeOrCreateSDKSession, since that's the only entry point this backend
// ever uses to start a conversation (see the type doc comment on why
// client.CreateSession is never called).
func (b *sdkSessionBackend) ensureSessionExists(sessionID sdk.SessionID) error {
	if _, err := b.LoadSession(sessionID); err == nil {
		return nil
	}
	now := time.Now().UTC()
	return b.SaveSession(sessionID, &sdk.SessionMetadata{
		ID:            sessionID,
		Status:        sdk.SessionStatusActive,
		CreatedAt:     now,
		UpdatedAt:     now,
		SchemaVersion: 1,
	})
}

func (b *sdkSessionBackend) DeleteSession(sessionID sdk.SessionID) error {
	return b.deleteSessions([]string{string(sessionID)})
}

// deleteSessions removes every row (metadata + transcript) for the given
// SDK session IDs in one transaction - shared by DeleteSession and
// workspacechat's own purgeExpiredSessions, which already knows the exact
// set of WorkspaceChatSession IDs (== these SDK session IDs) aging out.
func (b *sdkSessionBackend) deleteSessions(sessionIDs []string) error {
	if len(sessionIDs) == 0 {
		return nil
	}
	return b.db.Gorm().Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("sdk_session_id IN ?", sessionIDs).Delete(&sdb.WorkspaceChatSDKTranscriptEntry{}).Error; err != nil {
			return err
		}
		return tx.Where("sdk_session_id IN ?", sessionIDs).Delete(&sdb.WorkspaceChatSDKSessionMetadata{}).Error
	})
}

func (b *sdkSessionBackend) ListSessions() ([]sdk.SessionID, error) {
	var ids []string
	if err := b.db.Gorm().Model(&sdb.WorkspaceChatSDKSessionMetadata{}).Pluck("sdk_session_id", &ids).Error; err != nil {
		return nil, err
	}
	out := make([]sdk.SessionID, len(ids))
	for i, id := range ids {
		out[i] = sdk.SessionID(id)
	}
	return out, nil
}

func (b *sdkSessionBackend) AppendTranscriptEntries(sessionID sdk.SessionID, entries []sdk.TranscriptEntry) error {
	if len(entries) == 0 {
		return nil
	}
	return b.db.Gorm().Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&sdb.WorkspaceChatSDKTranscriptEntry{}).Where("sdk_session_id = ?", string(sessionID)).Count(&count).Error; err != nil {
			return err
		}
		return insertTranscriptEntries(tx, sessionID, int(count), entries)
	})
}

func (b *sdkSessionBackend) ReplaceTranscript(sessionID sdk.SessionID, entries []sdk.TranscriptEntry) error {
	return b.db.Gorm().Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("sdk_session_id = ?", string(sessionID)).Delete(&sdb.WorkspaceChatSDKTranscriptEntry{}).Error; err != nil {
			return err
		}
		return insertTranscriptEntries(tx, sessionID, 0, entries)
	})
}

func insertTranscriptEntries(tx *gorm.DB, sessionID sdk.SessionID, startIndex int, entries []sdk.TranscriptEntry) error {
	if len(entries) == 0 {
		return nil
	}
	rows := make([]sdb.WorkspaceChatSDKTranscriptEntry, len(entries))
	for i, entry := range entries {
		data, err := json.Marshal(entry)
		if err != nil {
			return fmt.Errorf("marshal transcript entry: %w", err)
		}
		rows[i] = sdb.WorkspaceChatSDKTranscriptEntry{
			SDKSessionID: string(sessionID),
			EntryIndex:   startIndex + i,
			EntryJSON:    string(data),
		}
	}
	return tx.Create(&rows).Error
}

func (b *sdkSessionBackend) LoadTranscript(sessionID sdk.SessionID) ([]sdk.TranscriptEntry, error) {
	var rows []sdb.WorkspaceChatSDKTranscriptEntry
	if err := b.db.Gorm().Where("sdk_session_id = ?", string(sessionID)).Order("entry_index asc").Find(&rows).Error; err != nil {
		return nil, err
	}
	entries := make([]sdk.TranscriptEntry, 0, len(rows))
	for _, row := range rows {
		var entry sdk.TranscriptEntry
		if err := json.Unmarshal([]byte(row.EntryJSON), &entry); err != nil {
			return nil, fmt.Errorf("unmarshal transcript entry: %w", err)
		}
		entries = append(entries, entry)
	}
	return entries, nil
}

// SearchTranscriptsByContent is unused by workspacechat itself today (it
// has its own separate ListSessions/GetSession, backed directly by
// WorkspaceChatSession/WorkspaceChatMessageRecord, for the console's "past
// chats" UI) but is part of sdk.SessionBackend regardless. LOWER()+LIKE
// rather than Postgres's ILIKE - seshat-server's db package supports both
// a Postgres and a SQLite driver (see db.go's Config), and LIKE is the one
// case-insensitive-when-lowered form both understand.
func (b *sdkSessionBackend) SearchTranscriptsByContent(needle string, limit int) ([]sdk.SessionID, error) {
	needle = strings.TrimSpace(strings.ToLower(needle))
	if needle == "" {
		return nil, nil
	}
	query := b.db.Gorm().Model(&sdb.WorkspaceChatSDKTranscriptEntry{}).
		Where("LOWER(entry_json) LIKE ?", "%"+needle+"%").
		Distinct("sdk_session_id")
	if limit > 0 {
		query = query.Limit(limit)
	}
	var ids []string
	if err := query.Pluck("sdk_session_id", &ids).Error; err != nil {
		return nil, err
	}
	out := make([]sdk.SessionID, len(ids))
	for i, id := range ids {
		out[i] = sdk.SessionID(id)
	}
	return out, nil
}

// Checkpoints intentionally unimplemented - see the type doc comment above.
func (b *sdkSessionBackend) SaveCheckpoint(sdk.SessionID, *sdk.Checkpoint) error {
	return nil
}

func (b *sdkSessionBackend) LoadCheckpoint(sdk.SessionID) (*sdk.Checkpoint, error) {
	return nil, nil
}
