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
	originalNextRunAt := *job.NextRunAt

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
	if reloaded.NextRunAt.Equal(originalNextRunAt) {
		t.Fatal("expected next_run_at to be recomputed, not left at its original value")
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
