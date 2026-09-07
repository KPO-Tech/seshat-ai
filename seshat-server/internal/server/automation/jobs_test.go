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

// TestCreateJobValidatesErrorWorkflowJobID covers Tier 3.1's "Error
// Workflow" job-level setting: it must reference a real job in the same
// organization.
func TestCreateJobValidatesErrorWorkflowJobID(t *testing.T) {
	env := newTestEnv(t)

	if _, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Main job", TriggerType: TriggerTypeInterval,
		IntervalSeconds: 60, ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Prompt: "Do work.", ErrorWorkflowJobID: "job-does-not-exist",
	}); err == nil {
		t.Fatal("expected an error_workflow_job_id that doesn't reference a real job to be rejected")
	}

	errorJob, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Error handler", TriggerType: TriggerTypeInterval,
		IntervalSeconds: 60, ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Prompt: "Handle the failure.",
	})
	if err != nil {
		t.Fatalf("create error job: %v", err)
	}

	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Main job", TriggerType: TriggerTypeInterval,
		IntervalSeconds: 60, ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Prompt: "Do work.", ErrorWorkflowJobID: errorJob.ID,
	})
	if err != nil {
		t.Fatalf("expected a valid error_workflow_job_id to be accepted: %v", err)
	}
	if job.ErrorWorkflowJobID == nil || *job.ErrorWorkflowJobID != errorJob.ID {
		t.Fatalf("expected ErrorWorkflowJobID to round-trip, got %#v", job.ErrorWorkflowJobID)
	}
}

// TestUpdateJobRejectsErrorWorkflowJobIDSelfReference covers the structural
// self-reference guard on normalizeErrorWorkflowJobID - the real anti-loop
// guard against a longer cascade is TriggerPayload's marker at trigger
// time (see cloud_execution_test.go), but a job pointing directly at
// itself is caught here immediately, at save time.
func TestUpdateJobRejectsErrorWorkflowJobIDSelfReference(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Main job", TriggerType: TriggerTypeInterval,
		IntervalSeconds: 60, ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Prompt: "Do work.",
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	if _, err := env.automation.UpdateJob(context.Background(), env.adminPrincipal, job.ID, UpdateJobParams{
		Name: job.Name, TriggerType: TriggerTypeInterval, IntervalSeconds: 60,
		ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Prompt: "Do work.", ErrorWorkflowJobID: job.ID,
	}); err == nil {
		t.Fatal("expected a job referencing itself as its own error workflow to be rejected")
	}
}

// TestUpdateJobClearsErrorWorkflowJobID proves an empty value clears an
// already-configured setting rather than being ignored.
func TestUpdateJobClearsErrorWorkflowJobID(t *testing.T) {
	env := newTestEnv(t)
	errorJob, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Error handler", TriggerType: TriggerTypeInterval,
		IntervalSeconds: 60, ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Prompt: "Handle the failure.",
	})
	if err != nil {
		t.Fatalf("create error job: %v", err)
	}
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Main job", TriggerType: TriggerTypeInterval,
		IntervalSeconds: 60, ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Prompt: "Do work.", ErrorWorkflowJobID: errorJob.ID,
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	updated, err := env.automation.UpdateJob(context.Background(), env.adminPrincipal, job.ID, UpdateJobParams{
		Name: job.Name, TriggerType: TriggerTypeInterval, IntervalSeconds: 60,
		ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Prompt: "Do work.", ErrorWorkflowJobID: "",
	})
	if err != nil {
		t.Fatalf("update job: %v", err)
	}
	if updated.ErrorWorkflowJobID != nil {
		t.Fatalf("expected an empty error_workflow_job_id to clear the setting, got %#v", updated.ErrorWorkflowJobID)
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
