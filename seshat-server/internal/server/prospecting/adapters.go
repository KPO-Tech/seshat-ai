package prospecting

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	prospectingcore "github.com/EngineerProjects/seshat-ai/core/prospecting"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// cacheAdapter satisfies prospectingcore.Cache on top of the deliberately
// global (non-organization-scoped) sdb.ProspectingCache table — see that
// model's doc comment for why sharing cached external-API results across
// organizations is correct here (factual, non-tenant data) rather than a
// scoping bug.
type cacheAdapter struct {
	db *sdb.DB
}

func (a cacheAdapter) Get(ctx context.Context, key string) (*prospectingcore.CacheEntry, bool, error) {
	var row sdb.ProspectingCache
	err := a.db.Gorm().WithContext(ctx).Where("key = ?", key).First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if !row.ExpiresAt.After(time.Now()) {
		return nil, false, nil
	}
	return &prospectingcore.CacheEntry{
		Key:        row.Key,
		Source:     row.Source,
		ValueJSON:  row.ValueJSON,
		StatusCode: row.StatusCode,
		ExpiresAt:  row.ExpiresAt,
	}, true, nil
}

func (a cacheAdapter) Set(ctx context.Context, key, source, valueJSON string, statusCode int, ttl time.Duration) error {
	if strings.TrimSpace(key) == "" {
		return errors.New("key is required")
	}
	row := sdb.ProspectingCache{
		Key:        key,
		Source:     source,
		ValueJSON:  valueJSON,
		StatusCode: statusCode,
		ExpiresAt:  time.Now().Add(ttl),
	}
	return a.db.Gorm().WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "key"}},
			DoUpdates: clause.AssignmentColumns([]string{"source", "value_json", "status_code", "expires_at"}),
		}).Create(&row).Error
}

// usageAdapter satisfies prospectingcore.UsageTracker scoped to one
// organization — unlike cacheAdapter, each organization brings its own
// Google Places API key (ProspectingSettings) and therefore has its own
// daily budget to protect.
type usageAdapter struct {
	db             *sdb.DB
	organizationID string
}

func (a usageAdapter) GetTotals(ctx context.Context, periodKey string) (searchCalls, detailsCalls int64, err error) {
	var row sdb.ProspectingUsage
	dbErr := a.db.Gorm().WithContext(ctx).
		Where("organization_id = ? AND period_key = ?", a.organizationID, periodKey).
		First(&row).Error
	if dbErr != nil {
		if errors.Is(dbErr, gorm.ErrRecordNotFound) {
			return 0, 0, nil
		}
		return 0, 0, dbErr
	}
	return row.SearchCalls, row.DetailsCalls, nil
}

func (a usageAdapter) IncrementSearchCalls(ctx context.Context, periodKey string, delta int64) (int64, error) {
	return a.increment(ctx, periodKey, "search_calls", delta)
}

func (a usageAdapter) IncrementDetailsCalls(ctx context.Context, periodKey string, delta int64) (int64, error) {
	return a.increment(ctx, periodKey, "details_calls", delta)
}

func (a usageAdapter) increment(ctx context.Context, periodKey, column string, delta int64) (int64, error) {
	if strings.TrimSpace(periodKey) == "" {
		return 0, errors.New("period_key is required")
	}
	if delta <= 0 {
		delta = 1
	}
	result := a.db.Gorm().WithContext(ctx).
		Model(&sdb.ProspectingUsage{}).
		Where("organization_id = ? AND period_key = ?", a.organizationID, periodKey).
		UpdateColumn(column, gorm.Expr(column+" + ?", delta))
	if result.Error != nil {
		return 0, result.Error
	}
	if result.RowsAffected == 0 {
		row := sdb.ProspectingUsage{OrganizationID: a.organizationID, PeriodKey: periodKey}
		if column == "search_calls" {
			row.SearchCalls = delta
		} else {
			row.DetailsCalls = delta
		}
		if err := a.db.Gorm().WithContext(ctx).Create(&row).Error; err != nil {
			// A concurrent increment may have created the row first (unique
			// index on org+period) — fall through to re-read totals rather
			// than treating that race as a hard failure.
			if !errors.Is(err, gorm.ErrDuplicatedKey) {
				return 0, err
			}
		}
	}
	search, details, err := a.GetTotals(ctx, periodKey)
	if err != nil {
		return 0, err
	}
	if column == "search_calls" {
		return search, nil
	}
	return details, nil
}

func dayPeriodKey(t time.Time) string {
	return t.UTC().Format("2006-01-02")
}
