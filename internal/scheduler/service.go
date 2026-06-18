package scheduler

import (
	"context"
	"strings"
	"time"

	"github.com/EngineerProjects/nexus_ai/internal/bkerr"
	"github.com/EngineerProjects/nexus_ai/internal/db"
)

// Service manages the lifecycle of scheduled jobs.
type Service struct {
	store *db.ScheduledJobStore
}

func NewService(store *db.ScheduledJobStore) *Service {
	return &Service{store: store}
}

// List returns all jobs owned by userID, newest first.
func (s *Service) List(ctx context.Context, userID string) ([]Job, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("scheduler store not available", nil)
	}
	rows, err := s.store.ListByUser(ctx, userID)
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	out := make([]Job, 0, len(rows))
	for _, r := range rows {
		out = append(out, fromDB(r))
	}
	return out, nil
}

// Get returns a single job, enforcing ownership.
func (s *Service) Get(ctx context.Context, userID, id string) (*Job, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("scheduler store not available", nil)
	}
	row, err := s.store.Get(ctx, id)
	if err != nil {
		return nil, bkerr.NotFound("job not found", err)
	}
	if row.UserID != userID {
		return nil, bkerr.Forbidden("access denied", nil)
	}
	j := fromDB(*row)
	return &j, nil
}

// Create validates the cron expression and persists a new job.
func (s *Service) Create(ctx context.Context, userID string, p CreateParams) (*Job, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("scheduler store not available", nil)
	}
	if err := validateCreate(p); err != nil {
		return nil, err
	}
	cron, err := ParseCron(p.CronExpr)
	if err != nil {
		return nil, bkerr.InvalidInput(err.Error(), err)
	}
	nextRun, err := cron.Next(time.Now())
	if err != nil {
		return nil, bkerr.InvalidInput("cron expression never fires: "+err.Error(), err)
	}
	name := strings.TrimSpace(p.Name)
	if name == "" {
		name = p.CronExpr
	}
	row, err := s.store.Create(ctx, db.CreateScheduledJobParams{
		UserID:       userID,
		Name:         name,
		CronExpr:     p.CronExpr,
		AgentSlug:    strings.TrimSpace(p.AgentSlug),
		Prompt:       p.Prompt,
		SessionTitle: strings.TrimSpace(p.SessionTitle),
		Enabled:      p.Enabled,
		NextRunAt:    nextRun,
	})
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	j := fromDB(*row)
	return &j, nil
}

// Update applies a partial update to a job, enforcing ownership.
// If CronExpr is changed, NextRunAt is recomputed.
func (s *Service) Update(ctx context.Context, userID, id string, p UpdateParams) (*Job, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("scheduler store not available", nil)
	}
	existing, err := s.Get(ctx, userID, id)
	if err != nil {
		return nil, err
	}

	dbParams := db.UpdateScheduledJobParams{
		Name:         p.Name,
		AgentSlug:    p.AgentSlug,
		Prompt:       p.Prompt,
		SessionTitle: p.SessionTitle,
		Enabled:      p.Enabled,
	}

	if p.CronExpr != nil {
		cron, cronErr := ParseCron(*p.CronExpr)
		if cronErr != nil {
			return nil, bkerr.InvalidInput(cronErr.Error(), cronErr)
		}
		nextRun, cronErr := cron.Next(time.Now())
		if cronErr != nil {
			return nil, bkerr.InvalidInput("cron expression never fires: "+cronErr.Error(), cronErr)
		}
		dbParams.CronExpr = p.CronExpr
		dbParams.NextRunAt = &nextRun
	}

	_ = existing // ownership already verified by Get above

	row, err := s.store.Update(ctx, id, dbParams)
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	j := fromDB(*row)
	return &j, nil
}

// Delete removes a job, enforcing ownership.
func (s *Service) Delete(ctx context.Context, userID, id string) error {
	if s == nil || s.store == nil {
		return bkerr.Unavailable("scheduler store not available", nil)
	}
	if _, err := s.Get(ctx, userID, id); err != nil {
		return err
	}
	if err := s.store.Delete(ctx, id); err != nil {
		return bkerr.Internal(err.Error(), err)
	}
	return nil
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func validateCreate(p CreateParams) error {
	if strings.TrimSpace(p.Prompt) == "" {
		return bkerr.InvalidInput("prompt is required", nil)
	}
	if strings.TrimSpace(p.CronExpr) == "" {
		return bkerr.InvalidInput("cron_expr is required", nil)
	}
	return nil
}

func fromDB(r db.ScheduledJob) Job {
	return Job{
		ID:           r.ID,
		UserID:       r.UserID,
		Name:         r.Name,
		CronExpr:     r.CronExpr,
		AgentSlug:    r.AgentSlug,
		Prompt:       r.Prompt,
		SessionTitle: r.SessionTitle,
		Enabled:      r.Enabled,
		LastRunAt:    r.LastRunAt,
		NextRunAt:    r.NextRunAt,
		LastStatus:   r.LastStatus,
		LastError:    r.LastError,
		CreatedAt:    r.CreatedAt,
		UpdatedAt:    r.UpdatedAt,
	}
}
