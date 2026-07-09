package automation

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// These tests exercise only the validation/wiring paths around cloud
// execution — never the actual LLM call itself (executeCloudRun bails out
// with a clear failure before ever reaching the SDK whenever no
// provider_settings exists, which is true throughout this file since none
// is ever created). A real network call to an LLM provider has no place in
// a unit test: it would be slow, nondeterministic, cost money, and require
// a real credential this suite can't have.

func TestParseModelOverride(t *testing.T) {
	if _, _, err := parseModelOverride(""); err == nil {
		t.Fatal("expected an empty model_override to be rejected")
	}
	if _, _, err := parseModelOverride("claude-sonnet-5"); err == nil {
		t.Fatal("expected a model_override without an explicit provider prefix to be rejected")
	}
	provider, model, err := parseModelOverride("anthropic:claude-sonnet-5")
	if err != nil {
		t.Fatalf("parse valid model_override: %v", err)
	}
	if provider != "anthropic" || model != "claude-sonnet-5" {
		t.Fatalf("unexpected parse result: provider=%q model=%q", provider, model)
	}
}

func TestExecuteCloudRunDoesNotStartACancelledQueuedRun(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Cloud job",
		TriggerType:     TriggerTypeInterval,
		IntervalSeconds: 3600,
		ExecutionTarget: ExecutionTargetCloud,
		ModelOverride:   "anthropic:claude-sonnet-5",
		Prompt:          "Do cloud work.",
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	run, err := env.automation.TriggerJobNow(context.Background(), env.adminPrincipal, job.ID)
	if err != nil {
		t.Fatalf("trigger job now: %v", err)
	}
	if _, err := env.automation.CancelRun(context.Background(), env.adminPrincipal, run.ID); err != nil {
		t.Fatalf("cancel run: %v", err)
	}

	if err := env.automation.executeCloudRun(context.Background(), run.ID); err != nil {
		t.Fatalf("executeCloudRun on a cancelled run: %v", err)
	}

	reloaded, err := env.automation.GetRun(context.Background(), env.adminPrincipal, run.ID)
	if err != nil {
		t.Fatalf("get run: %v", err)
	}
	if reloaded.Status != RunStatusCancelled {
		t.Fatalf("expected the cancelled run to stay cancelled, got %s", reloaded.Status)
	}
	if reloaded.StartedAt != nil {
		t.Fatalf("expected cancelled run not to be marked started, got %v", reloaded.StartedAt)
	}
}

func TestFinishCloudRunDoesNotOverwriteACancelledRun(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Cloud job",
		TriggerType:     TriggerTypeInterval,
		IntervalSeconds: 3600,
		ExecutionTarget: ExecutionTargetCloud,
		ModelOverride:   "anthropic:claude-sonnet-5",
		Prompt:          "Do cloud work.",
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	run, err := env.automation.TriggerJobNow(context.Background(), env.adminPrincipal, job.ID)
	if err != nil {
		t.Fatalf("trigger job now: %v", err)
	}
	if err := env.db.Gorm().Model(&sdb.JobRun{}).Where("id = ?", run.ID).
		Updates(map[string]any{"status": RunStatusRunning, "started_at": run.QueuedAt}).Error; err != nil {
		t.Fatalf("mark run running: %v", err)
	}
	if _, err := env.automation.CancelRun(context.Background(), env.adminPrincipal, run.ID); err != nil {
		t.Fatalf("cancel run: %v", err)
	}

	if err := env.automation.finishCloudRun(context.Background(), run.ID, RunStatusCompleted, "late result", ""); err != nil {
		t.Fatalf("finishCloudRun on cancelled run: %v", err)
	}

	reloaded, err := env.automation.GetRun(context.Background(), env.adminPrincipal, run.ID)
	if err != nil {
		t.Fatalf("get run: %v", err)
	}
	if reloaded.Status != RunStatusCancelled {
		t.Fatalf("expected cancelled run to stay cancelled, got %s", reloaded.Status)
	}
	if reloaded.OutputText != "" {
		t.Fatalf("expected cancelled run output to stay empty, got %q", reloaded.OutputText)
	}
}

func TestExecuteCloudRunFailsCleanlyWithNoProviderSettingsConfigured(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Cloud job",
		TriggerType:     TriggerTypeInterval,
		IntervalSeconds: 3600,
		ExecutionTarget: ExecutionTargetCloud,
		ModelOverride:   "anthropic:claude-sonnet-5",
		Prompt:          "Do cloud work.",
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	run, err := env.automation.TriggerJobNow(context.Background(), env.adminPrincipal, job.ID)
	if err != nil {
		t.Fatalf("trigger job now: %v", err)
	}
	if run.Status != RunStatusQueued {
		t.Fatalf("expected the run to be queued before execution, got %s", run.Status)
	}

	// No ProviderSetting was ever created for this org — executeCloudRun
	// must fail before it would need to touch the network.
	if err := env.automation.executeCloudRun(context.Background(), run.ID); err != nil {
		t.Fatalf("executeCloudRun should report failure via the run record, not return an error: %v", err)
	}

	reloaded, err := env.automation.GetRun(context.Background(), env.adminPrincipal, run.ID)
	if err != nil {
		t.Fatalf("get run: %v", err)
	}
	if reloaded.Status != RunStatusFailed {
		t.Fatalf("expected the run to be marked failed, got %s", reloaded.Status)
	}
	if reloaded.ExitReason == "" {
		t.Fatal("expected a non-empty exit reason explaining the missing provider settings")
	}

	reloadedJob, err := env.automation.GetJob(context.Background(), env.adminPrincipal, job.ID)
	if err != nil {
		t.Fatalf("get job: %v", err)
	}
	if reloadedJob.LastRunStatus != RunStatusFailed {
		t.Fatalf("expected job.last_run_status to reflect the failure, got %s", reloadedJob.LastRunStatus)
	}
}

func TestExecuteCloudRunIsANoOpForNonQueuedOrNonCloudRuns(t *testing.T) {
	env := newTestEnv(t)
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
		IntervalSeconds: 3600,
		ExecutionTarget: ExecutionTargetDevice,
		TargetDeviceID:  deviceResult.Device.ID,
		Prompt:          "Do local work.",
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	run, err := env.automation.TriggerJobNow(context.Background(), env.adminPrincipal, job.ID)
	if err != nil {
		t.Fatalf("trigger job now: %v", err)
	}

	// A device-targeted run must never be touched by the cloud executor.
	if err := env.automation.executeCloudRun(context.Background(), run.ID); err != nil {
		t.Fatalf("executeCloudRun on a device run: %v", err)
	}
	reloaded, err := env.automation.GetRun(context.Background(), env.adminPrincipal, run.ID)
	if err != nil {
		t.Fatalf("get run: %v", err)
	}
	if reloaded.Status != RunStatusQueued {
		t.Fatalf("expected the device run to be left untouched, got %s", reloaded.Status)
	}

	// A run ID that doesn't exist is a silent no-op, not an error.
	if err := env.automation.executeCloudRun(context.Background(), "does-not-exist"); err != nil {
		t.Fatalf("executeCloudRun on a missing run id: %v", err)
	}
}
