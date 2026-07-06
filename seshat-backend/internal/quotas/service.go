package quotas

import (
	"context"
	"time"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

type Service struct {
	store *db.UsageCounterStore
}

func NewService(store *db.UsageCounterStore) *Service {
	return &Service{store: store}
}

// Increment adds delta (minimum 1) to both daily and monthly counters for (userID, metric).
// Errors are suppressed — quota tracking must never break the caller.
func (s *Service) Increment(ctx context.Context, userID, metric string, delta int64) {
	if s == nil || s.store == nil {
		return
	}
	if delta <= 0 {
		delta = 1
	}
	now := time.Now().UTC()
	_ = s.store.Increment(ctx, userID, metric, db.DayPeriodKey(now), delta)
	_ = s.store.Increment(ctx, userID, metric, db.MonthPeriodKey(now), delta)
}

// GetUsage returns all usage counters for the authenticated user.
func (s *Service) GetUsage(ctx context.Context, principal *backendauth.Principal) (*UsageSummary, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("quota store not configured", nil)
	}

	rows, err := s.store.ListByUser(ctx, principal.User.ID, "", 60)
	if err != nil {
		return nil, bkerr.Internal("list usage counters: "+err.Error(), err)
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
	return &UsageSummary{
		UserID:  principal.User.ID,
		Entries: entries,
	}, nil
}
