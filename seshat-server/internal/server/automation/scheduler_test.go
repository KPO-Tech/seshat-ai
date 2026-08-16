package automation

import (
	"context"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func TestSchedulerTickQueuesDueJobAndAdvancesNextRunAt(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Every hour",
		TriggerType:     TriggerTypeInterval,
		IntervalSeconds: 3600,
		ExecutionTarget: ExecutionTargetCloud,
		ModelOverride:   "anthropic:claude-sonnet-5",
		Prompt:          "Check for updates.",
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	// CreateJob always schedules the first run in the future; force it into
	// the past to simulate the tick catching a due job, since there is no
	// service-level way to fast-forward time.
	past := time.Now().UTC().Add(-time.Minute)
	if err := env.db.Gorm().Model(&sdb.ScheduledJob{}).Where("id = ?", job.ID).
		Update("next_run_at", past).Error; err != nil {
		t.Fatalf("force next_run_at into the past: %v", err)
	}

	scheduler := NewScheduler(env.automation, time.Hour) // long interval: we call tick directly, not Start
	if err := scheduler.tick(context.Background()); err != nil {
		t.Fatalf("tick: %v", err)
	}

	runs, _, err := env.automation.ListRuns(context.Background(), env.adminPrincipal, ListRunsParams{
		OrganizationID: env.orgID,
		JobID:          job.ID,
	}, sdb.ListParams{Sort: "queued_at", Order: "desc", Limit: 50})
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("expected the tick to queue exactly one run, got %d", len(runs))
	}

	reloaded, err := env.automation.GetJob(context.Background(), env.adminPrincipal, job.ID)
	if err != nil {
		t.Fatalf("get job: %v", err)
	}
	if reloaded.NextRunAt == nil || !reloaded.NextRunAt.After(past) {
		t.Fatalf("expected next_run_at to advance past %v, got %+v", past, reloaded.NextRunAt)
	}

	// A second tick immediately after should find nothing due.
	if err := scheduler.tick(context.Background()); err != nil {
		t.Fatalf("second tick: %v", err)
	}
	runsAfter, _, err := env.automation.ListRuns(context.Background(), env.adminPrincipal, ListRunsParams{
		OrganizationID: env.orgID,
		JobID:          job.ID,
	}, sdb.ListParams{Sort: "queued_at", Order: "desc", Limit: 50})
	if err != nil {
		t.Fatalf("list runs after second tick: %v", err)
	}
	if len(runsAfter) != 1 {
		t.Fatalf("expected no additional run to be queued, got %d runs", len(runsAfter))
	}
}

// TestSchedulerQueueAndRescheduleIsSafeAgainstConcurrentInstances is the
// money test for multi-instance safety: it doesn't spin up goroutines
// (SQLite's single-connection pool would just serialize them, proving
// nothing about the actual hazard), it directly reproduces the race
// condition queueAndReschedule guards against — two calls sharing the
// exact same stale ScheduledJob snapshot, exactly what two seshat-server
// processes would both read from the same tick() SELECT before either one
// claims the due firing.
func TestSchedulerQueueAndRescheduleIsSafeAgainstConcurrentInstances(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Every hour",
		TriggerType:     TriggerTypeInterval,
		IntervalSeconds: 3600,
		ExecutionTarget: ExecutionTargetCloud,
		ModelOverride:   "anthropic:claude-sonnet-5",
		Prompt:          "Check for updates.",
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	past := time.Now().UTC().Add(-time.Minute)
	if err := env.db.Gorm().Model(&sdb.ScheduledJob{}).Where("id = ?", job.ID).
		Update("next_run_at", past).Error; err != nil {
		t.Fatalf("force next_run_at into the past: %v", err)
	}

	// Both "instances" read the identical stale snapshot before either one
	// has claimed the firing.
	var staleJob sdb.ScheduledJob
	if err := env.db.Gorm().First(&staleJob, "id = ?", job.ID).Error; err != nil {
		t.Fatalf("read stale job snapshot: %v", err)
	}

	scheduler := NewScheduler(env.automation, time.Hour)
	now := time.Now().UTC()
	if err := scheduler.queueAndReschedule(context.Background(), staleJob, now); err != nil {
		t.Fatalf("first instance's queueAndReschedule: %v", err)
	}
	if err := scheduler.queueAndReschedule(context.Background(), staleJob, now); err != nil {
		t.Fatalf("second (racing) instance's queueAndReschedule: %v", err)
	}

	runs, _, err := env.automation.ListRuns(context.Background(), env.adminPrincipal, ListRunsParams{
		OrganizationID: env.orgID,
		JobID:          job.ID,
	}, sdb.ListParams{Sort: "queued_at", Order: "desc", Limit: 50})
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("expected exactly 1 run despite two concurrent instances racing the same due firing, got %d", len(runs))
	}
}

func TestSchedulerSkipsPausedJobs(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Every hour",
		TriggerType:     TriggerTypeInterval,
		IntervalSeconds: 3600,
		ExecutionTarget: ExecutionTargetCloud,
		ModelOverride:   "anthropic:claude-sonnet-5",
		Prompt:          "Check for updates.",
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	if _, err := env.automation.SetJobPaused(context.Background(), env.adminPrincipal, job.ID, true); err != nil {
		t.Fatalf("pause job: %v", err)
	}

	past := time.Now().UTC().Add(-time.Minute)
	if err := env.db.Gorm().Model(&sdb.ScheduledJob{}).Where("id = ?", job.ID).
		Update("next_run_at", past).Error; err != nil {
		t.Fatalf("force next_run_at into the past: %v", err)
	}

	scheduler := NewScheduler(env.automation, time.Hour)
	if err := scheduler.tick(context.Background()); err != nil {
		t.Fatalf("tick: %v", err)
	}

	runs, _, err := env.automation.ListRuns(context.Background(), env.adminPrincipal, ListRunsParams{
		OrganizationID: env.orgID,
		JobID:          job.ID,
	}, sdb.ListParams{Sort: "queued_at", Order: "desc", Limit: 50})
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 0 {
		t.Fatalf("expected a paused job to be skipped by the scheduler, got %d runs", len(runs))
	}
}
