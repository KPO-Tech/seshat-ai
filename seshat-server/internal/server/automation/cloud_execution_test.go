package automation

import (
	"context"
	"testing"
	"time"

	"github.com/KPO-Tech/seshat/pkg/dataflow"

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

	if err := env.automation.finishCloudRun(context.Background(), run.ID, RunStatusCompleted, "late result", "", nil); err != nil {
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

// buildNodeTrace converts the dataflow engine's own Result - already
// computed by dataflow.Run - into the DB-persisted shape. This tests only
// that conversion (order preserved, fields mapped, Duration -> ms, Item ->
// map[string]any), not the engine's own skip/fail semantics, which belong
// to and are already covered by the SDK's own test suite.
func TestBuildNodeTrace(t *testing.T) {
	started := time.Date(2026, 9, 3, 12, 0, 0, 0, time.UTC)
	ended := started.Add(250 * time.Millisecond)

	result := dataflow.Result{
		Order: []string{"fetch", "transform", "notify"},
		Results: map[string]dataflow.NodeResult{
			"fetch": {
				ID: "fetch", Type: "http_request", Success: false,
				Error: "connection refused", StartedAt: started, EndedAt: ended, Duration: 250 * time.Millisecond,
			},
			"transform": {
				ID: "transform", Type: "set", Skipped: true,
				Error: `upstream node "fetch" failed`, StartedAt: started, EndedAt: started,
			},
			"notify": {
				ID: "notify", Type: "agent", Success: true,
				Output:    []dataflow.Item{{"text": "done"}},
				StartedAt: started, EndedAt: ended, Duration: 250 * time.Millisecond,
			},
		},
	}

	trace := buildNodeTrace(result)
	if len(trace) != 3 {
		t.Fatalf("expected 3 trace entries, got %d", len(trace))
	}

	// Order must follow result.Order, not map iteration order.
	if trace[0].ID != "fetch" || trace[1].ID != "transform" || trace[2].ID != "notify" {
		t.Fatalf("expected trace order fetch/transform/notify, got %s/%s/%s", trace[0].ID, trace[1].ID, trace[2].ID)
	}

	fetch := trace[0]
	if fetch.Success || fetch.Skipped || fetch.Error != "connection refused" {
		t.Fatalf("expected fetch to be a plain failure, got %+v", fetch)
	}
	if fetch.DurationMS != 250 {
		t.Fatalf("expected fetch duration 250ms, got %d", fetch.DurationMS)
	}

	transform := trace[1]
	if transform.Success || !transform.Skipped {
		t.Fatalf("expected transform to be skipped, not a plain failure, got %+v", transform)
	}

	notify := trace[2]
	if !notify.Success || notify.Skipped {
		t.Fatalf("expected notify to have succeeded independently, got %+v", notify)
	}
	if len(notify.Output) != 1 || notify.Output[0]["text"] != "done" {
		t.Fatalf("expected notify output [{text: done}], got %+v", notify.Output)
	}

	// A node id in Order with no matching Results entry must be skipped
	// over, not panic - defensive against the engine ever changing.
	result.Order = append(result.Order, "ghost")
	if got := buildNodeTrace(result); len(got) != 3 {
		t.Fatalf("expected a dangling Order entry to be ignored, got %d entries", len(got))
	}
}
