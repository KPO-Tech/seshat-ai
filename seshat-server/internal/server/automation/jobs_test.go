package automation

import (
	"context"
	"testing"
	"time"
)

func TestCreateJobComputesNextRunAtForEachTriggerType(t *testing.T) {
	env := newTestEnv(t)
	before := time.Now().UTC()

	cronJob, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Nightly digest",
		TriggerType:     TriggerTypeCron,
		CronExpr:        "0 0 * * *",
		ExecutionTarget: ExecutionTargetCloud,
		ModelOverride:   "anthropic:claude-sonnet-5",
		Prompt:          "Summarize today's activity.",
	})
	if err != nil {
		t.Fatalf("create cron job: %v", err)
	}
	if cronJob.NextRunAt == nil || !cronJob.NextRunAt.After(before) {
		t.Fatalf("expected a future next_run_at for the cron job, got %+v", cronJob.NextRunAt)
	}

	intervalJob, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Every hour",
		TriggerType:     TriggerTypeInterval,
		IntervalSeconds: 3600,
		ExecutionTarget: ExecutionTargetCloud,
		ModelOverride:   "anthropic:claude-sonnet-5",
		Prompt:          "Check for updates.",
	})
	if err != nil {
		t.Fatalf("create interval job: %v", err)
	}
	if intervalJob.NextRunAt == nil || !intervalJob.NextRunAt.After(before.Add(59*time.Minute)) {
		t.Fatalf("expected next_run_at roughly one hour out, got %+v", intervalJob.NextRunAt)
	}

	runAt := before.Add(24 * time.Hour)
	onceJob, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "One-off",
		TriggerType:     TriggerTypeOnce,
		RunAt:           &runAt,
		ExecutionTarget: ExecutionTargetCloud,
		ModelOverride:   "anthropic:claude-sonnet-5",
		Prompt:          "Run this exactly once.",
	})
	if err != nil {
		t.Fatalf("create once job: %v", err)
	}
	if onceJob.NextRunAt == nil || !onceJob.NextRunAt.Equal(runAt) {
		t.Fatalf("expected next_run_at to equal run_at for a once trigger, got %+v want %v", onceJob.NextRunAt, runAt)
	}
}

func TestCreateJobValidatesExecutionTarget(t *testing.T) {
	env := newTestEnv(t)

	// device target without target_device_id is rejected.
	if _, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Device job",
		TriggerType:     TriggerTypeInterval,
		IntervalSeconds: 60,
		ExecutionTarget: ExecutionTargetDevice,
		Prompt:          "Do local work.",
	}); err == nil {
		t.Fatal("expected device execution_target without target_device_id to be rejected")
	}

	deviceResult, err := env.automation.RegisterDevice(context.Background(), env.adminPrincipal, RegisterDeviceParams{
		OrganizationID: env.orgID,
		Name:           "Worker",
	})
	if err != nil {
		t.Fatalf("register device: %v", err)
	}

	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Device job",
		TriggerType:     TriggerTypeInterval,
		IntervalSeconds: 60,
		ExecutionTarget: ExecutionTargetDevice,
		TargetDeviceID:  deviceResult.Device.ID,
		Prompt:          "Do local work.",
	})
	if err != nil {
		t.Fatalf("expected a valid device job to be created: %v", err)
	}
	if job.TargetDeviceID != deviceResult.Device.ID {
		t.Fatalf("unexpected target_device_id: %s", job.TargetDeviceID)
	}

	// Revoked device can no longer be targeted by a new job.
	if err := env.automation.RevokeDevice(context.Background(), env.adminPrincipal, deviceResult.Device.ID); err != nil {
		t.Fatalf("revoke device: %v", err)
	}
	if _, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Another device job",
		TriggerType:     TriggerTypeInterval,
		IntervalSeconds: 60,
		ExecutionTarget: ExecutionTargetDevice,
		TargetDeviceID:  deviceResult.Device.ID,
		Prompt:          "Do local work.",
	}); err == nil {
		t.Fatal("expected targeting a revoked device to be rejected")
	}
}

func TestJobManagementRequiresPermission(t *testing.T) {
	env := newTestEnv(t)
	viewerPrincipal := env.addMember(t, "viewer")

	if _, err := env.automation.CreateJob(context.Background(), viewerPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Nightly digest",
		TriggerType:     TriggerTypeCron,
		CronExpr:        "0 0 * * *",
		ExecutionTarget: ExecutionTargetCloud,
		ModelOverride:   "anthropic:claude-sonnet-5",
		Prompt:          "Summarize today's activity.",
	}); err == nil {
		t.Fatal("expected a viewer to be denied creating a job")
	}

	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Nightly digest",
		TriggerType:     TriggerTypeCron,
		CronExpr:        "0 0 * * *",
		ExecutionTarget: ExecutionTargetCloud,
		ModelOverride:   "anthropic:claude-sonnet-5",
		Prompt:          "Summarize today's activity.",
	})
	if err != nil {
		t.Fatalf("create job as admin: %v", err)
	}

	if _, err := env.automation.UpdateJob(context.Background(), viewerPrincipal, job.ID, UpdateJobParams{
		Name: "Renamed", TriggerType: TriggerTypeCron, CronExpr: "0 0 * * *",
		ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5", Prompt: "Summarize today's activity.",
	}); err == nil {
		t.Fatal("expected a viewer to be denied updating a job")
	}
	if _, err := env.automation.SetJobPaused(context.Background(), viewerPrincipal, job.ID, true); err == nil {
		t.Fatal("expected a viewer to be denied pausing a job")
	}
	if err := env.automation.DeleteJob(context.Background(), viewerPrincipal, job.ID); err == nil {
		t.Fatal("expected a viewer to be denied deleting a job")
	}
	if _, err := env.automation.ListJobs(context.Background(), viewerPrincipal, env.orgID); err != nil {
		t.Fatalf("unexpected error listing jobs as viewer: %v", err)
	}
}

func TestPauseResumeJob(t *testing.T) {
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

	paused, err := env.automation.SetJobPaused(context.Background(), env.adminPrincipal, job.ID, true)
	if err != nil {
		t.Fatalf("pause job: %v", err)
	}
	if paused.Status != JobStatusPaused {
		t.Fatalf("expected status paused, got %s", paused.Status)
	}

	resumed, err := env.automation.SetJobPaused(context.Background(), env.adminPrincipal, job.ID, false)
	if err != nil {
		t.Fatalf("resume job: %v", err)
	}
	if resumed.Status != JobStatusActive {
		t.Fatalf("expected status active, got %s", resumed.Status)
	}
}
