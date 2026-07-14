// Package quotas is a strictly personal, self-service usage-counter domain
// — no organization, no permission catalog, no enforced limit. It mirrors
// seshat-backend's own internal/quotas package algorithm for algorithm:
// every Increment call bumps both a daily and a monthly bucket for
// (user, metric), and GetUsage just lists the counters back. There is no
// plan/tier concept anywhere in seshat-server, so this is deliberately pure
// counting, not a step toward billing enforcement — see
// helps/seshat-architecture-target.md §7, "Quotas."
package quotas

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/apperr"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

const (
	PeriodDay   = "day"
	PeriodMonth = "month"
)

type UsageEntry struct {
	Metric    string    `json:"metric"`
	Period    string    `json:"period"`
	PeriodKey string    `json:"period_key"`
	Count     int64     `json:"count"`
	UpdatedAt time.Time `json:"updated_at"`
}

type UsageSummary struct {
	UserID  string       `json:"user_id"`
	Entries []UsageEntry `json:"entries"`
}

type Service struct {
	db *sdb.DB
}

func New(database *sdb.DB) *Service {
	return &Service{db: database}
}

func dayPeriodKey(t time.Time) string   { return t.UTC().Format("2006-01-02") }
func monthPeriodKey(t time.Time) string { return t.UTC().Format("2006-01") }

// Increment adds delta (minimum 1) to both the daily and monthly counters
// for (principal, metric) — same dual-bucket behavior as seshat-backend's
// own quotas.Service.Increment, just resolved server-side so a single HTTP
// call from a connected backend is enough.
func (s *Service) Increment(ctx context.Context, principal *iam.Principal, metric string, delta int64) error {
	if principal == nil {
		return apperr.Unauthorized("authentication required")
	}
	metric = strings.TrimSpace(metric)
	if metric == "" {
		return apperr.InvalidInput("metric is required")
	}
	if delta <= 0 {
		delta = 1
	}
	now := time.Now().UTC()
	if err := s.incrementOne(ctx, principal.User.ID, metric, dayPeriodKey(now), delta); err != nil {
		return err
	}
	return s.incrementOne(ctx, principal.User.ID, metric, monthPeriodKey(now), delta)
}

func (s *Service) incrementOne(ctx context.Context, userID, metric, periodKey string, delta int64) error {
	tx := s.db.Gorm().WithContext(ctx)

	// Try to update an existing row first — avoids a separate SELECT round trip.
	result := tx.Model(&sdb.UsageCounter{}).
		Where("user_id = ? AND metric = ? AND period_key = ?", userID, metric, periodKey).
		UpdateColumn("count", gorm.Expr("count + ?", delta))
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected > 0 {
		return nil
	}

	// Row does not exist yet; create it. Ignore unique constraint errors from races.
	id, err := sdb.NewID("usg")
	if err != nil {
		return err
	}
	err = tx.Create(&sdb.UsageCounter{
		ID: id, UserID: userID, Metric: metric, PeriodKey: periodKey, Count: delta,
	}).Error
	if err != nil && isUniqueConstraintError(err) {
		return nil
	}
	return err
}

// GetUsage returns all usage counters for the authenticated caller.
func (s *Service) GetUsage(ctx context.Context, principal *iam.Principal) (*UsageSummary, error) {
	if principal == nil {
		return nil, apperr.Unauthorized("authentication required")
	}
	var rows []sdb.UsageCounter
	err := s.db.Gorm().WithContext(ctx).
		Where("user_id = ?", principal.User.ID).
		Order("period_key DESC, metric ASC").
		Limit(60).
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	entries := make([]UsageEntry, 0, len(rows))
	for _, row := range rows {
		period := PeriodDay
		if len(row.PeriodKey) == 7 {
			period = PeriodMonth
		}
		entries = append(entries, UsageEntry{
			Metric:    row.Metric,
			Period:    period,
			PeriodKey: row.PeriodKey,
			Count:     row.Count,
			UpdatedAt: row.UpdatedAt,
		})
	}
	return &UsageSummary{UserID: principal.User.ID, Entries: entries}, nil
}

func isUniqueConstraintError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unique") || strings.Contains(msg, "duplicate")
}
