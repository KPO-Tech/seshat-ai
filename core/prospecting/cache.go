package prospectingcore

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Cache source tags — stable strings used as part of the cache key, kept
// here (rather than only inside internal/db) since building the key is now
// this package's own concern, not the caller's.
const (
	CacheSourceGeocode       = "geocode"
	CacheSourcePlacesSearch  = "places_search"
	CacheSourcePlacesDetails = "places_details"
	CacheSourceGouvEnrich    = "gouv_enrich"
)

// CacheEntry is one cached external-API response.
type CacheEntry struct {
	Key        string
	Source     string
	ValueJSON  string
	StatusCode int
	ExpiresAt  time.Time
}

// Cache is the persistence boundary this package needs — implemented by
// seshat-backend's *db.ProspectingCacheStore locally (via a small adapter,
// see internal/prospecting/adapters.go) and, later, by an org-scoped
// equivalent in seshat-server. Deliberately minimal: this package never
// needs to list, delete, or otherwise manage cache entries, only get/set by
// key.
type Cache interface {
	Get(ctx context.Context, key string) (*CacheEntry, bool, error)
	Set(ctx context.Context, key, source, valueJSON string, statusCode int, ttl time.Duration) error
}

// UsageTracker is the daily real-call budget boundary this package needs —
// implemented by seshat-backend's *db.ProspectingUsageStore directly today
// (its method set already matches this interface, no adapter needed) and,
// later, by an org-scoped equivalent in seshat-server.
type UsageTracker interface {
	GetTotals(ctx context.Context, periodKey string) (searchCalls, detailsCalls int64, err error)
	IncrementSearchCalls(ctx context.Context, periodKey string, delta int64) (int64, error)
	IncrementDetailsCalls(ctx context.Context, periodKey string, delta int64) (int64, error)
}

// failureTTL is deliberately short and source-independent - mirroring a
// success TTL for a failed call (as a naive reading of "cache failures too"
// would do) means a transient outage on a free/keyless government API
// blocks retries for as long as a year, with zero cost justification for
// doing so.
const failureTTL = 1 * time.Hour

// maxResponseBytes caps how much of an external response body is read,
// guarding against a misbehaving upstream streaming an unbounded response.
const maxResponseBytes = 2 << 20 // 2MB

// cacheKey builds a stable "<source>:<sha256 of parts>" key - the same
// shape regardless of which external API is being called.
func cacheKey(source string, parts ...string) string {
	h := sha256.New()
	for _, p := range parts {
		h.Write([]byte(p))
		h.Write([]byte{0})
	}
	return source + ":" + hex.EncodeToString(h.Sum(nil))
}

// doCached executes buildReq's request through cache - a hit (success or
// cached failure) never touches the network. On a real call, success is
// cached under successTTL and failure (non-2xx or a network error) under
// the short failureTTL. cache may be nil (falls through to a real call
// every time), which keeps this usable in tests without a database.
func doCached(ctx context.Context, httpClient *http.Client, cache Cache, source, key string, buildReq func() (*http.Request, error), successTTL time.Duration) ([]byte, error) {
	if cache != nil {
		if entry, found, err := cache.Get(ctx, key); err == nil && found {
			if entry.StatusCode == 0 {
				return nil, fmt.Errorf("%s: cached as unreachable, will retry after the cache entry expires", source)
			}
			return []byte(entry.ValueJSON), nil
		}
	}

	req, err := buildReq()
	if err != nil {
		return nil, fmt.Errorf("%s: build request: %w", source, err)
	}
	resp, err := httpClient.Do(req.WithContext(ctx))
	if err != nil {
		if cache != nil {
			_ = cache.Set(ctx, key, source, "", 0, failureTTL)
		}
		return nil, fmt.Errorf("%s: request failed: %w", source, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return nil, fmt.Errorf("%s: read response: %w", source, err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if cache != nil {
			_ = cache.Set(ctx, key, source, "", 0, failureTTL)
		}
		return nil, fmt.Errorf("%s: http %d", source, resp.StatusCode)
	}
	if cache != nil {
		_ = cache.Set(ctx, key, source, string(body), resp.StatusCode, successTTL)
	}
	return body, nil
}
