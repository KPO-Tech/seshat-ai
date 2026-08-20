package prospecting

import (
	"context"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	prospectingcore "github.com/EngineerProjects/seshat-ai/seshat-core/prospecting"
)

// cacheStoreAdapter satisfies prospectingcore.Cache on top of
// *db.ProspectingCacheStore. Only Get needs real adapting (converting
// *db.ProspectingCacheEntry to *prospectingcore.CacheEntry, same fields,
// different named types) - Set's signature already matches exactly.
//
// Note: *db.ProspectingUsageStore is NOT wrapped here - its method set
// (GetTotals/IncrementSearchCalls/IncrementDetailsCalls) already matches
// prospectingcore.UsageTracker exactly, so it satisfies the interface
// directly with no adapter needed.
type cacheStoreAdapter struct {
	store *db.ProspectingCacheStore
}

func (a cacheStoreAdapter) Get(ctx context.Context, key string) (*prospectingcore.CacheEntry, bool, error) {
	entry, found, err := a.store.Get(ctx, key)
	if err != nil || !found {
		return nil, found, err
	}
	return &prospectingcore.CacheEntry{
		Key:        entry.Key,
		Source:     entry.Source,
		ValueJSON:  entry.ValueJSON,
		StatusCode: entry.StatusCode,
		ExpiresAt:  entry.ExpiresAt,
	}, true, nil
}

func (a cacheStoreAdapter) Set(ctx context.Context, key, source, valueJSON string, statusCode int, ttl time.Duration) error {
	return a.store.Set(ctx, key, source, valueJSON, statusCode, ttl)
}
