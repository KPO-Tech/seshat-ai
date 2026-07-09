package scheduler

import (
	"context"
	"time"
)

// Job is the domain representation of a scheduled automation job.
type Job struct {
	ID           string
	UserID       string
	Name         string
	CronExpr     string
	AgentSlug    string
	Prompt       string
	SessionTitle string
	Enabled      bool
	LastRunAt    *time.Time
	NextRunAt    time.Time
	LastStatus   string // "", "ok", "error", "running"
	LastError    string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// CreateParams holds the inputs for creating a new scheduled job.
type CreateParams struct {
	Name         string
	CronExpr     string
	AgentSlug    string
	Prompt       string
	SessionTitle string
	Enabled      bool
}

// UpdateParams holds optional fields for a partial job update.
type UpdateParams struct {
	Name         *string
	CronExpr     *string
	AgentSlug    *string
	Prompt       *string
	SessionTitle *string
	Enabled      *bool
}

// JobExecutor is the function the worker calls to actually run a job.
// The implementation lives in bootstrap so the scheduler package does not
// need to import the query package directly.
type JobExecutor func(ctx context.Context, params ExecParams) error

// ExecParams are the inputs passed to the JobExecutor for each run.
type ExecParams struct {
	UserID       string
	JobID        string
	JobName      string
	Prompt       string
	AgentSlug    string
	SessionTitle string
}
