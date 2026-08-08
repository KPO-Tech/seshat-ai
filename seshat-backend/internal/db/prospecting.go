package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Prospecting cache sources - one TTL policy per external API this feature
// calls. See ProspectingCacheStore.Set for the success-vs-failure TTL split.
const (
	ProspectingCacheSourceGeocode       = "geocode"
	ProspectingCacheSourcePlacesSearch  = "places_search"
	ProspectingCacheSourcePlacesDetails = "places_details"
	ProspectingCacheSourceGouvEnrich    = "gouv_enrich"
)

const (
	ProspectingSweepStatusRunning   = "running"
	ProspectingSweepStatusPartial   = "partial"
	ProspectingSweepStatusCompleted = "completed"
	ProspectingSweepStatusFailed    = "failed"
)

// gProspectingCacheEntry is a generic, package-scoped KV cache for the
// external calls internal/prospecting makes (geocoding, Google Places,
// French company registry lookups) - nothing reusable/persistent existed
// for this before (the SDK's TTLCache[V] is in-memory-only, per-subsystem).
// StatusCode 0 means "the network call failed", cached under a short,
// source-independent TTL (see Set) so a transient outage on a free/keyless
// government API doesn't block retries for as long as a real success would
// be cached.
type gProspectingCacheEntry struct {
	Key           string `gorm:"column:key;primaryKey;size:191"`
	Source        string `gorm:"column:source;size:32;not null;index"`
	ValueJSON     string `gorm:"column:value_json;type:text;not null;default:''"`
	StatusCode    int    `gorm:"column:status_code;not null;default:0"`
	ExpiresAtUnix int64  `gorm:"column:expires_at_unix;not null;index"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gProspectingCacheEntry) TableName() string { return "prospecting_cache_entries" }

// gProspectingDailyUsage tracks real (non-cache-hit) Google Places calls
// against a single global daily cap - deliberately not UsageCounterStore,
// which is per-user; this cap protects one GOOGLE_PLACES_API_KEY's bill
// regardless of which user's agent triggered the call.
type gProspectingDailyUsage struct {
	PeriodKey     string `gorm:"column:period_key;primaryKey;size:32"`
	SearchCalls   int64  `gorm:"column:search_calls;not null;default:0"`
	DetailsCalls  int64  `gorm:"column:details_calls;not null;default:0"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gProspectingDailyUsage) TableName() string { return "prospecting_daily_usage" }

// gProspectingSweep is one discovery run. NextUnitIndex is a cursor into a
// flattened (sector × grid-cell) work-list computed once at creation time
// (see GridJSON/SectorsJSON) - this is what makes "continue this sweep on
// the next tool call" a stateless operation driven entirely by DB state, no
// in-memory job/queue infrastructure needed.
type gProspectingSweep struct {
	ID                  string  `gorm:"primaryKey;size:64"`
	UserID              string  `gorm:"column:user_id;size:64;not null;index"`
	Country             string  `gorm:"column:country;size:8;not null;default:'fr'"`
	AreaQuery           string  `gorm:"column:area_query;not null;default:''"`
	AreaLabel           string  `gorm:"column:area_label;not null;default:''"`
	CenterLat           float64 `gorm:"column:center_lat;not null;default:0"`
	CenterLng           float64 `gorm:"column:center_lng;not null;default:0"`
	RadiusKM            float64 `gorm:"column:radius_km;not null;default:0"`
	SectorsJSON         string  `gorm:"column:sectors_json;type:text;not null;default:'[]'"`
	GridJSON            string  `gorm:"column:grid_json;type:text;not null;default:'[]'"`
	NextUnitIndex       int     `gorm:"column:next_unit_index;not null;default:0"`
	TotalUnits          int     `gorm:"column:total_units;not null;default:0"`
	Status              string  `gorm:"column:status;size:32;not null;default:'running';index"`
	BusinessesFound     int     `gorm:"column:businesses_found;not null;default:0"`
	RealPlacesCallsUsed int     `gorm:"column:real_places_calls_used;not null;default:0"`
	LastError           string  `gorm:"column:last_error;not null;default:''"`
	CreatedAtUnix       int64   `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix       int64   `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
	CompletedAtUnix     int64   `gorm:"column:completed_at_unix;not null;default:0"`
}

func (gProspectingSweep) TableName() string { return "prospecting_sweeps" }

// gProspectingBusiness is one retained candidate, unique per (sweep, place).
// Scoped per-sweep, not deduped across separate sweeps of the same area -
// re-sweeping later creates fresh rows (a known v1 simplification; the
// external *calls* stay cheap via the cache either way).
type gProspectingBusiness struct {
	ID                string  `gorm:"primaryKey;size:64"`
	SweepID           string  `gorm:"column:sweep_id;size:64;not null;uniqueIndex:idx_prospecting_biz_sweep_place"`
	PlaceID           string  `gorm:"column:place_id;not null;default:'';uniqueIndex:idx_prospecting_biz_sweep_place"`
	Sector            string  `gorm:"column:sector;not null;default:''"`
	Name              string  `gorm:"column:name;not null;default:''"`
	FormattedAddress  string  `gorm:"column:formatted_address;not null;default:''"`
	PostalCode        string  `gorm:"column:postal_code;size:16;not null;default:''"`
	City              string  `gorm:"column:city;not null;default:''"`
	Lat               float64 `gorm:"column:lat;not null;default:0"`
	Lng               float64 `gorm:"column:lng;not null;default:0"`
	Phone             string  `gorm:"column:phone;not null;default:''"`
	Website           string  `gorm:"column:website;not null;default:''"`
	Rating            float64 `gorm:"column:rating;not null;default:0"`
	UserRatingCount   int     `gorm:"column:user_rating_count;not null;default:0"`
	BusinessStatus    string  `gorm:"column:business_status;size:32;not null;default:''"`
	OpeningHoursJSON  string  `gorm:"column:opening_hours_json;type:text;not null;default:'[]'"`
	SIREN             string  `gorm:"column:siren;size:16;not null;default:'';index"`
	CompanyName       string  `gorm:"column:company_name;not null;default:''"`
	ExecutivesJSON    string  `gorm:"column:executives_json;type:text;not null;default:'[]'"`
	MatchConfidence   float64 `gorm:"column:match_confidence;not null;default:0"`
	ReachabilityScore int     `gorm:"column:reachability_score;not null;default:0;index"`
	CreatedAtUnix     int64   `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix     int64   `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gProspectingBusiness) TableName() string { return "prospecting_businesses" }

// ─── Domain types ───────────────────────────────────────────────────────────

type ProspectingCacheEntry struct {
	Key        string
	Source     string
	ValueJSON  string
	StatusCode int
	ExpiresAt  time.Time
}

type ProspectingSweep struct {
	ID                  string
	UserID              string
	Country             string
	AreaQuery           string
	AreaLabel           string
	CenterLat           float64
	CenterLng           float64
	RadiusKM            float64
	SectorsJSON         string
	GridJSON            string
	NextUnitIndex       int
	TotalUnits          int
	Status              string
	BusinessesFound     int
	RealPlacesCallsUsed int
	LastError           string
	CreatedAt           time.Time
	UpdatedAt           time.Time
	CompletedAt         time.Time
}

type CreateProspectingSweepParams struct {
	UserID      string
	Country     string
	AreaQuery   string
	AreaLabel   string
	CenterLat   float64
	CenterLng   float64
	RadiusKM    float64
	SectorsJSON string
	GridJSON    string
	TotalUnits  int
}

type UpdateProspectingSweepProgressParams struct {
	ID                  string
	NextUnitIndex       int
	Status              string
	BusinessesFound     int
	RealPlacesCallsUsed int
	LastError           string
}

type ProspectingBusiness struct {
	ID                string
	SweepID           string
	PlaceID           string
	Sector            string
	Name              string
	FormattedAddress  string
	PostalCode        string
	City              string
	Lat               float64
	Lng               float64
	Phone             string
	Website           string
	Rating            float64
	UserRatingCount   int
	BusinessStatus    string
	OpeningHoursJSON  string
	SIREN             string
	CompanyName       string
	ExecutivesJSON    string
	MatchConfidence   float64
	ReachabilityScore int
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type UpsertProspectingBusinessParams struct {
	SweepID           string
	PlaceID           string
	Sector            string
	Name              string
	FormattedAddress  string
	PostalCode        string
	City              string
	Lat               float64
	Lng               float64
	Phone             string
	Website           string
	Rating            float64
	UserRatingCount   int
	BusinessStatus    string
	OpeningHoursJSON  string
	SIREN             string
	CompanyName       string
	ExecutivesJSON    string
	MatchConfidence   float64
	ReachabilityScore int
}

type ListProspectingBusinessesFilter struct {
	MinScore int
	HasPhone bool
	Sector   string
}

// ─── ProspectingCacheStore ──────────────────────────────────────────────────

type ProspectingCacheStore struct {
	db *DB
}

func NewProspectingCacheStore(database *DB) (*ProspectingCacheStore, error) {
	if database == nil {
		return nil, fmt.Errorf("prospecting cache store: database is required")
	}
	return &ProspectingCacheStore{db: database}, nil
}

// Get returns the cached entry for key, or found=false if absent or expired
// (an expired row is treated as a miss, not deleted here - the next Set
// overwrites it).
func (s *ProspectingCacheStore) Get(ctx context.Context, key string) (*ProspectingCacheEntry, bool, error) {
	var row gProspectingCacheEntry
	err := s.db.GormDB().WithContext(ctx).Where("key = ?", key).First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if row.ExpiresAtUnix <= time.Now().Unix() {
		return nil, false, nil
	}
	return &ProspectingCacheEntry{
		Key:        row.Key,
		Source:     row.Source,
		ValueJSON:  row.ValueJSON,
		StatusCode: row.StatusCode,
		ExpiresAt:  timeOrZero(row.ExpiresAtUnix),
	}, true, nil
}

// Set stores/refreshes a cache entry with an absolute TTL from now. Callers
// pass a short TTL (e.g. 1h) for a failed call and the source's normal,
// longer TTL for a successful one - this function has no opinion on which,
// it just stores whatever TTL it's given.
func (s *ProspectingCacheStore) Set(ctx context.Context, key, source, valueJSON string, statusCode int, ttl time.Duration) error {
	if strings.TrimSpace(key) == "" {
		return fmt.Errorf("key is required")
	}
	row := gProspectingCacheEntry{
		Key:           key,
		Source:        source,
		ValueJSON:     valueJSON,
		StatusCode:    statusCode,
		ExpiresAtUnix: time.Now().Add(ttl).Unix(),
	}
	return s.db.GormDB().WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "key"}},
			DoUpdates: clause.AssignmentColumns([]string{"source", "value_json", "status_code", "expires_at_unix"}),
		}).Create(&row).Error
}

// ─── ProspectingUsageStore ──────────────────────────────────────────────────

type ProspectingUsageStore struct {
	db *DB
}

func NewProspectingUsageStore(database *DB) (*ProspectingUsageStore, error) {
	if database == nil {
		return nil, fmt.Errorf("prospecting usage store: database is required")
	}
	return &ProspectingUsageStore{db: database}, nil
}

func (s *ProspectingUsageStore) IncrementSearchCalls(ctx context.Context, periodKey string, delta int64) (int64, error) {
	return s.increment(ctx, periodKey, "search_calls", delta)
}

func (s *ProspectingUsageStore) IncrementDetailsCalls(ctx context.Context, periodKey string, delta int64) (int64, error) {
	return s.increment(ctx, periodKey, "details_calls", delta)
}

// increment applies the same update-first, create-on-miss idiom as
// UsageCounterStore.Increment (quotas.go) - avoids a SELECT round trip on
// the common case where the day's row already exists.
func (s *ProspectingUsageStore) increment(ctx context.Context, periodKey, column string, delta int64) (int64, error) {
	if strings.TrimSpace(periodKey) == "" {
		return 0, fmt.Errorf("period_key is required")
	}
	if delta <= 0 {
		delta = 1
	}
	result := s.db.GormDB().WithContext(ctx).
		Model(&gProspectingDailyUsage{}).
		Where("period_key = ?", periodKey).
		UpdateColumn(column, gorm.Expr(column+" + ?", delta))
	if result.Error != nil {
		return 0, result.Error
	}
	if result.RowsAffected == 0 {
		row := gProspectingDailyUsage{PeriodKey: periodKey}
		if column == "search_calls" {
			row.SearchCalls = delta
		} else {
			row.DetailsCalls = delta
		}
		if err := s.db.GormDB().WithContext(ctx).Create(&row).Error; err != nil && !isUniqueConstraintError(err) {
			return 0, err
		}
	}
	search, details, err := s.GetTotals(ctx, periodKey)
	if err != nil {
		return 0, err
	}
	if column == "search_calls" {
		return search, nil
	}
	return details, nil
}

func (s *ProspectingUsageStore) GetTotals(ctx context.Context, periodKey string) (searchCalls, detailsCalls int64, err error) {
	var row gProspectingDailyUsage
	dbErr := s.db.GormDB().WithContext(ctx).Where("period_key = ?", periodKey).First(&row).Error
	if dbErr != nil {
		if errors.Is(dbErr, gorm.ErrRecordNotFound) {
			return 0, 0, nil
		}
		return 0, 0, dbErr
	}
	return row.SearchCalls, row.DetailsCalls, nil
}

// ─── ProspectingSweepStore ──────────────────────────────────────────────────

type ProspectingSweepStore struct {
	db *DB
}

func NewProspectingSweepStore(database *DB) (*ProspectingSweepStore, error) {
	if database == nil {
		return nil, fmt.Errorf("prospecting sweep store: database is required")
	}
	return &ProspectingSweepStore{db: database}, nil
}

func (s *ProspectingSweepStore) Create(ctx context.Context, p CreateProspectingSweepParams) (*ProspectingSweep, error) {
	if strings.TrimSpace(p.UserID) == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	row := gProspectingSweep{
		ID:          newIdentityID("psweep"),
		UserID:      p.UserID,
		Country:     strings.ToLower(strings.TrimSpace(p.Country)),
		AreaQuery:   p.AreaQuery,
		AreaLabel:   p.AreaLabel,
		CenterLat:   p.CenterLat,
		CenterLng:   p.CenterLng,
		RadiusKM:    p.RadiusKM,
		SectorsJSON: p.SectorsJSON,
		GridJSON:    p.GridJSON,
		TotalUnits:  p.TotalUnits,
		Status:      ProspectingSweepStatusRunning,
	}
	if row.Country == "" {
		row.Country = "fr"
	}
	if err := s.db.GormDB().WithContext(ctx).Create(&row).Error; err != nil {
		return nil, fmt.Errorf("create prospecting sweep: %w", err)
	}
	return prospectingSweepFromModel(row), nil
}

func (s *ProspectingSweepStore) GetByID(ctx context.Context, id string) (*ProspectingSweep, error) {
	var row gProspectingSweep
	if err := s.db.GormDB().WithContext(ctx).Where("id = ?", id).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("prospecting sweep not found")
		}
		return nil, err
	}
	return prospectingSweepFromModel(row), nil
}

func (s *ProspectingSweepStore) UpdateProgress(ctx context.Context, p UpdateProspectingSweepProgressParams) error {
	updates := map[string]any{
		"next_unit_index":        p.NextUnitIndex,
		"status":                 p.Status,
		"businesses_found":       p.BusinessesFound,
		"real_places_calls_used": p.RealPlacesCallsUsed,
		"last_error":             strings.TrimSpace(p.LastError),
	}
	if p.Status == ProspectingSweepStatusCompleted {
		updates["completed_at_unix"] = time.Now().Unix()
	}
	return s.db.GormDB().WithContext(ctx).Model(&gProspectingSweep{}).Where("id = ?", p.ID).Updates(updates).Error
}

func prospectingSweepFromModel(row gProspectingSweep) *ProspectingSweep {
	return &ProspectingSweep{
		ID:                  row.ID,
		UserID:              row.UserID,
		Country:             row.Country,
		AreaQuery:           row.AreaQuery,
		AreaLabel:           row.AreaLabel,
		CenterLat:           row.CenterLat,
		CenterLng:           row.CenterLng,
		RadiusKM:            row.RadiusKM,
		SectorsJSON:         row.SectorsJSON,
		GridJSON:            row.GridJSON,
		NextUnitIndex:       row.NextUnitIndex,
		TotalUnits:          row.TotalUnits,
		Status:              row.Status,
		BusinessesFound:     row.BusinessesFound,
		RealPlacesCallsUsed: row.RealPlacesCallsUsed,
		LastError:           row.LastError,
		CreatedAt:           timeOrZero(row.CreatedAtUnix),
		UpdatedAt:           timeOrZero(row.UpdatedAtUnix),
		CompletedAt:         timeOrZero(row.CompletedAtUnix),
	}
}

// ─── ProspectingBusinessStore ───────────────────────────────────────────────

type ProspectingBusinessStore struct {
	db *DB
}

func NewProspectingBusinessStore(database *DB) (*ProspectingBusinessStore, error) {
	if database == nil {
		return nil, fmt.Errorf("prospecting business store: database is required")
	}
	return &ProspectingBusinessStore{db: database}, nil
}

// Upsert stores or refreshes a candidate on (sweep_id, place_id) conflict -
// a sweep can safely re-observe the same place across resumed tool calls.
func (s *ProspectingBusinessStore) Upsert(ctx context.Context, p UpsertProspectingBusinessParams) (*ProspectingBusiness, error) {
	if strings.TrimSpace(p.SweepID) == "" {
		return nil, fmt.Errorf("sweep_id is required")
	}
	if strings.TrimSpace(p.PlaceID) == "" {
		return nil, fmt.Errorf("place_id is required")
	}
	row := gProspectingBusiness{
		ID:                newIdentityID("pbiz"),
		SweepID:           p.SweepID,
		PlaceID:           p.PlaceID,
		Sector:            p.Sector,
		Name:              p.Name,
		FormattedAddress:  p.FormattedAddress,
		PostalCode:        p.PostalCode,
		City:              p.City,
		Lat:               p.Lat,
		Lng:               p.Lng,
		Phone:             p.Phone,
		Website:           p.Website,
		Rating:            p.Rating,
		UserRatingCount:   p.UserRatingCount,
		BusinessStatus:    p.BusinessStatus,
		OpeningHoursJSON:  p.OpeningHoursJSON,
		SIREN:             p.SIREN,
		CompanyName:       p.CompanyName,
		ExecutivesJSON:    p.ExecutivesJSON,
		MatchConfidence:   p.MatchConfidence,
		ReachabilityScore: p.ReachabilityScore,
	}
	if row.OpeningHoursJSON == "" {
		row.OpeningHoursJSON = "[]"
	}
	if row.ExecutivesJSON == "" {
		row.ExecutivesJSON = "[]"
	}
	err := s.db.GormDB().WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "sweep_id"}, {Name: "place_id"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"sector", "name", "formatted_address", "postal_code", "city", "lat", "lng",
				"phone", "website", "rating", "user_rating_count", "business_status", "opening_hours_json",
				"siren", "company_name", "executives_json", "match_confidence", "reachability_score",
			}),
		}).Create(&row).Error
	if err != nil {
		return nil, fmt.Errorf("upsert prospecting business: %w", err)
	}
	var stored gProspectingBusiness
	if err := s.db.GormDB().WithContext(ctx).
		Where("sweep_id = ? AND place_id = ?", p.SweepID, p.PlaceID).
		First(&stored).Error; err != nil {
		return nil, err
	}
	return prospectingBusinessFromModel(stored), nil
}

// ExistingPlaceIDs returns the set of place_ids already stored for a sweep -
// used to skip re-fetching (and re-billing) Place Details for a candidate
// already seen in an earlier resumed call of the same sweep.
func (s *ProspectingBusinessStore) ExistingPlaceIDs(ctx context.Context, sweepID string) (map[string]bool, error) {
	var placeIDs []string
	if err := s.db.GormDB().WithContext(ctx).
		Model(&gProspectingBusiness{}).
		Where("sweep_id = ?", sweepID).
		Pluck("place_id", &placeIDs).Error; err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(placeIDs))
	for _, id := range placeIDs {
		out[id] = true
	}
	return out, nil
}

// FindLatestByUserAndPlaceID looks up the most recently updated business
// row for (userID, placeID) across ALL of the user's sweeps, not just one -
// used to avoid re-fetching Place Details/company enrichment for a
// business already discovered in an earlier sweep of an overlapping area.
// found=false (not an error) means no prior sighting, a normal outcome.
func (s *ProspectingBusinessStore) FindLatestByUserAndPlaceID(ctx context.Context, userID, placeID string) (*ProspectingBusiness, bool, error) {
	// Both tables have columns of the same name (id, created_at_unix,
	// updated_at_unix) - an unqualified SELECT * across the join would let
	// GORM scan the wrong table's value into gProspectingBusiness's fields,
	// so the select list is qualified explicitly.
	var row gProspectingBusiness
	err := s.db.GormDB().WithContext(ctx).
		Model(&gProspectingBusiness{}).
		Select("prospecting_businesses.*").
		Joins("JOIN prospecting_sweeps ON prospecting_sweeps.id = prospecting_businesses.sweep_id").
		Where("prospecting_sweeps.user_id = ? AND prospecting_businesses.place_id = ?", userID, placeID).
		// id is a random suffix, not time-sortable, but it's a stable
		// tie-breaker: updated_at_unix has only second granularity, so two
		// upserts in the same second would otherwise sort non-deterministically.
		Order("prospecting_businesses.updated_at_unix DESC, prospecting_businesses.id DESC").
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return prospectingBusinessFromModel(row), true, nil
}

// ListBySweep returns candidates for a sweep, best reachability score
// first, filtered/paginated. limit is clamped 1-100 like InboxContactStore.
func (s *ProspectingBusinessStore) ListBySweep(ctx context.Context, sweepID string, filter ListProspectingBusinessesFilter, limit, offset int) ([]ProspectingBusiness, int, error) {
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	if offset < 0 {
		offset = 0
	}
	q := s.db.GormDB().WithContext(ctx).Model(&gProspectingBusiness{}).Where("sweep_id = ?", sweepID)
	if filter.MinScore > 0 {
		q = q.Where("reachability_score >= ?", filter.MinScore)
	}
	if filter.HasPhone {
		q = q.Where("phone != ''")
	}
	if strings.TrimSpace(filter.Sector) != "" {
		q = q.Where("sector = ?", strings.TrimSpace(filter.Sector))
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []gProspectingBusiness
	if err := q.Order("reachability_score DESC").Limit(limit).Offset(offset).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	out := make([]ProspectingBusiness, 0, len(rows))
	for _, row := range rows {
		out = append(out, *prospectingBusinessFromModel(row))
	}
	return out, int(total), nil
}

func prospectingBusinessFromModel(row gProspectingBusiness) *ProspectingBusiness {
	return &ProspectingBusiness{
		ID:                row.ID,
		SweepID:           row.SweepID,
		PlaceID:           row.PlaceID,
		Sector:            row.Sector,
		Name:              row.Name,
		FormattedAddress:  row.FormattedAddress,
		PostalCode:        row.PostalCode,
		City:              row.City,
		Lat:               row.Lat,
		Lng:               row.Lng,
		Phone:             row.Phone,
		Website:           row.Website,
		Rating:            row.Rating,
		UserRatingCount:   row.UserRatingCount,
		BusinessStatus:    row.BusinessStatus,
		OpeningHoursJSON:  row.OpeningHoursJSON,
		SIREN:             row.SIREN,
		CompanyName:       row.CompanyName,
		ExecutivesJSON:    row.ExecutivesJSON,
		MatchConfidence:   row.MatchConfidence,
		ReachabilityScore: row.ReachabilityScore,
		CreatedAt:         timeOrZero(row.CreatedAtUnix),
		UpdatedAt:         timeOrZero(row.UpdatedAtUnix),
	}
}
