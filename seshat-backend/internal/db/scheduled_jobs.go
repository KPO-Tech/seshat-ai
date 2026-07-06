package db

import (
	"context"
	"fmt"
	"time"
)

// gScheduledJob is the GORM model for the scheduled_jobs table.
type gScheduledJob struct {
	ID           string `gorm:"primaryKey;size:64"`
	UserID       string `gorm:"column:user_id;size:64;not null;index"`
	Name         string `gorm:"column:name;size:255;not null;default:''"`
	CronExpr     string `gorm:"column:cron_expr;size:128;not null"`
	AgentSlug    string `gorm:"column:agent_slug;size:128;not null;default:''"`
	Prompt       string `gorm:"column:prompt;type:text;not null"`
	SessionTitle string `gorm:"column:session_title;size:255;not null;default:''"`
	Enabled      bool   `gorm:"column:enabled;not null;default:true;index:idx_jobs_enabled_next,priority:1"`
	// last_run_at: 0 means never ran
	LastRunAtUnix int64  `gorm:"column:last_run_at_unix;not null;default:0"`
	NextRunAtUnix int64  `gorm:"column:next_run_at_unix;not null;index:idx_jobs_enabled_next,priority:2"`
	LastStatus    string `gorm:"column:last_status;size:16;not null;default:''"`
	LastError     string `gorm:"column:last_error;type:text;not null;default:''"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;not null"`
	UpdatedAtUnix int64  `gorm:"column:updated_at_unix;not null"`
}

func (gScheduledJob) TableName() string { return "scheduled_jobs" }

// ─── public domain type ───────────────────────────────────────────────────────

type ScheduledJob struct {
	ID           string
	UserID       string
	Name         string
	CronExpr     string
	AgentSlug    string
	Prompt       string
	SessionTitle string
	Enabled      bool
	LastRunAt    *time.Time // nil = never ran
	NextRunAt    time.Time
	LastStatus   string // "", "ok", "error", "running"
	LastError    string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// ─── params ───────────────────────────────────────────────────────────────────

type CreateScheduledJobParams struct {
	UserID       string
	Name         string
	CronExpr     string
	AgentSlug    string
	Prompt       string
	SessionTitle string
	Enabled      bool
	NextRunAt    time.Time
}

type UpdateScheduledJobParams struct {
	Name         *string
	CronExpr     *string
	AgentSlug    *string
	Prompt       *string
	SessionTitle *string
	Enabled      *bool
	NextRunAt    *time.Time // set when CronExpr changes
}

// ─── store ────────────────────────────────────────────────────────────────────

type ScheduledJobStore struct {
	db *DB
}

func NewScheduledJobStore(database *DB) (*ScheduledJobStore, error) {
	if database == nil {
		return nil, fmt.Errorf("scheduled job store: database is required")
	}
	return &ScheduledJobStore{db: database}, nil
}

func (s *ScheduledJobStore) Create(ctx context.Context, p CreateScheduledJobParams) (*ScheduledJob, error) {
	now := time.Now().Unix()
	row := gScheduledJob{
		ID:            newIdentityID("job"),
		UserID:        p.UserID,
		Name:          p.Name,
		CronExpr:      p.CronExpr,
		AgentSlug:     p.AgentSlug,
		Prompt:        p.Prompt,
		SessionTitle:  p.SessionTitle,
		Enabled:       p.Enabled,
		NextRunAtUnix: p.NextRunAt.Unix(),
		LastStatus:    "",
		CreatedAtUnix: now,
		UpdatedAtUnix: now,
	}
	if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
		return nil, fmt.Errorf("create scheduled job: %w", err)
	}
	result := toPublicJob(row)
	return &result, nil
}

func (s *ScheduledJobStore) Get(ctx context.Context, id string) (*ScheduledJob, error) {
	var row gScheduledJob
	if err := s.db.gormDB.WithContext(ctx).Where("id = ?", id).First(&row).Error; err != nil {
		return nil, fmt.Errorf("get scheduled job %q: %w", id, err)
	}
	result := toPublicJob(row)
	return &result, nil
}

func (s *ScheduledJobStore) ListByUser(ctx context.Context, userID string) ([]ScheduledJob, error) {
	var rows []gScheduledJob
	if err := s.db.gormDB.WithContext(ctx).Where("user_id = ?", userID).
		Order("created_at_unix DESC").Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list scheduled jobs: %w", err)
	}
	out := make([]ScheduledJob, 0, len(rows))
	for _, r := range rows {
		out = append(out, toPublicJob(r))
	}
	return out, nil
}

// ListDue returns all enabled jobs whose next_run_at is at or before now
// and that are not currently running. Used by the worker.
func (s *ScheduledJobStore) ListDue(ctx context.Context, now time.Time) ([]ScheduledJob, error) {
	var rows []gScheduledJob
	if err := s.db.gormDB.WithContext(ctx).
		Where("enabled = ? AND next_run_at_unix <= ? AND last_status != ?", true, now.Unix(), "running").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list due jobs: %w", err)
	}
	out := make([]ScheduledJob, 0, len(rows))
	for _, r := range rows {
		out = append(out, toPublicJob(r))
	}
	return out, nil
}

func (s *ScheduledJobStore) Update(ctx context.Context, id string, p UpdateScheduledJobParams) (*ScheduledJob, error) {
	updates := map[string]any{
		"updated_at_unix": time.Now().Unix(),
	}
	if p.Name != nil {
		updates["name"] = *p.Name
	}
	if p.CronExpr != nil {
		updates["cron_expr"] = *p.CronExpr
	}
	if p.AgentSlug != nil {
		updates["agent_slug"] = *p.AgentSlug
	}
	if p.Prompt != nil {
		updates["prompt"] = *p.Prompt
	}
	if p.SessionTitle != nil {
		updates["session_title"] = *p.SessionTitle
	}
	if p.Enabled != nil {
		updates["enabled"] = *p.Enabled
	}
	if p.NextRunAt != nil {
		updates["next_run_at_unix"] = p.NextRunAt.Unix()
	}
	if err := s.db.gormDB.WithContext(ctx).Model(&gScheduledJob{}).
		Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("update scheduled job %q: %w", id, err)
	}
	return s.Get(ctx, id)
}

func (s *ScheduledJobStore) Delete(ctx context.Context, id string) error {
	result := s.db.gormDB.WithContext(ctx).Delete(&gScheduledJob{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("delete scheduled job %q: %w", id, result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("scheduled job %q not found", id)
	}
	return nil
}

// SetRunning marks a job as currently running. Called by the worker before
// launching the job goroutine to prevent double-execution.
func (s *ScheduledJobStore) SetRunning(ctx context.Context, id string) error {
	return s.db.gormDB.WithContext(ctx).Model(&gScheduledJob{}).
		Where("id = ?", id).
		Updates(map[string]any{
			"last_status":     "running",
			"last_error":      "",
			"updated_at_unix": time.Now().Unix(),
		}).Error
}

// MarkCompleted records the result of a job run and advances the schedule.
func (s *ScheduledJobStore) MarkCompleted(ctx context.Context, id string, ranAt time.Time, nextRunAt time.Time, status, errMsg string) error {
	updates := map[string]any{
		"last_status":      status,
		"last_error":       errMsg,
		"last_run_at_unix": ranAt.Unix(),
		"next_run_at_unix": nextRunAt.Unix(),
		"updated_at_unix":  time.Now().Unix(),
	}
	return s.db.gormDB.WithContext(ctx).Model(&gScheduledJob{}).
		Where("id = ?", id).Updates(updates).Error
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func toPublicJob(r gScheduledJob) ScheduledJob {
	j := ScheduledJob{
		ID:           r.ID,
		UserID:       r.UserID,
		Name:         r.Name,
		CronExpr:     r.CronExpr,
		AgentSlug:    r.AgentSlug,
		Prompt:       r.Prompt,
		SessionTitle: r.SessionTitle,
		Enabled:      r.Enabled,
		NextRunAt:    time.Unix(r.NextRunAtUnix, 0).UTC(),
		LastStatus:   r.LastStatus,
		LastError:    r.LastError,
		CreatedAt:    time.Unix(r.CreatedAtUnix, 0).UTC(),
		UpdatedAt:    time.Unix(r.UpdatedAtUnix, 0).UTC(),
	}
	if r.LastRunAtUnix > 0 {
		t := time.Unix(r.LastRunAtUnix, 0).UTC()
		j.LastRunAt = &t
	}
	return j
}
