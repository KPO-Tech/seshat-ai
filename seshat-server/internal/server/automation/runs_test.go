package automation

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// TestTriggerJobNowForCloudTargetQueuesForAsyncExecution asserts a cloud
// run is queued (not executed synchronously) by TriggerJobNow — actual
// execution happens out-of-band, via the scheduler's
// executeQueuedCloudRuns pass (see cloud_execution_test.go for the
// execution-path tests). A manual HTTP trigger response must return fast;
// an LLM call is not something to do inside the request/transaction.
func TestTriggerJobNowForCloudTargetQueuesForAsyncExecution(t *testing.T) {
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
		t.Fatalf("expected the cloud run to stay queued for async execution, got status %s", run.Status)
	}

	reloaded, err := env.automation.GetJob(context.Background(), env.adminPrincipal, job.ID)
	if err != nil {
		t.Fatalf("get job: %v", err)
	}
	if reloaded.LastRunStatus != RunStatusQueued {
		t.Fatalf("expected job.last_run_status to reflect the queued run, got %s", reloaded.LastRunStatus)
	}
}

func TestDeleteJobRemovesAssociatedRuns(t *testing.T) {
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

	if err := env.automation.DeleteJob(context.Background(), env.adminPrincipal, job.ID); err != nil {
		t.Fatalf("delete job: %v", err)
	}
	if _, err := env.automation.GetJob(context.Background(), env.adminPrincipal, job.ID); err == nil {
		t.Fatal("expected deleted job to be missing")
	}
	if _, err := env.automation.GetRun(context.Background(), env.adminPrincipal, run.ID); err == nil {
		t.Fatal("expected runs for a deleted job to be removed")
	}
	deviceRuns, err := env.automation.MyRuns(context.Background(), deviceResult.Token)
	if err != nil {
		t.Fatalf("my runs after job deletion: %v", err)
	}
	if len(deviceRuns) != 0 {
		t.Fatalf("expected no device-visible runs after job deletion, got %+v", deviceRuns)
	}
	orgRuns, _, err := env.automation.ListRuns(context.Background(), env.adminPrincipal, ListRunsParams{OrganizationID: env.orgID, JobID: job.ID}, sdb.ListParams{Sort: "queued_at", Order: "desc", Limit: 50})
	if err != nil {
		t.Fatalf("list runs after job deletion: %v", err)
	}
	if len(orgRuns) != 0 {
		t.Fatalf("expected no org-visible runs after job deletion, got %+v", orgRuns)
	}
}

func TestDeviceClaimStartHeartbeatCompleteFlow(t *testing.T) {
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

	triggered, err := env.automation.TriggerJobNow(context.Background(), env.adminPrincipal, job.ID)
	if err != nil {
		t.Fatalf("trigger job now: %v", err)
	}
	if triggered.Status != RunStatusQueued {
		t.Fatalf("expected a device run to stay queued, got %s", triggered.Status)
	}

	claimed, err := env.automation.ClaimRun(context.Background(), deviceResult.Token)
	if err != nil {
		t.Fatalf("claim run: %v", err)
	}
	if claimed == nil || claimed.ID != triggered.ID {
		t.Fatalf("expected to claim the queued run, got %+v", claimed)
	}
	if claimed.Status != RunStatusClaimed {
		t.Fatalf("unexpected status after claim: %s", claimed.Status)
	}

	runJob, err := env.automation.GetRunJob(context.Background(), deviceResult.Token, claimed.ID)
	if err != nil {
		t.Fatalf("get run job: %v", err)
	}
	if runJob.Prompt != "Do local work." {
		t.Fatalf("expected the claimed run's job prompt, got %q", runJob.Prompt)
	}

	// Nothing left to claim right now.
	nothing, err := env.automation.ClaimRun(context.Background(), deviceResult.Token)
	if err != nil {
		t.Fatalf("claim run (empty): %v", err)
	}
	if nothing != nil {
		t.Fatalf("expected no run available to claim, got %+v", nothing)
	}

	started, err := env.automation.StartRun(context.Background(), deviceResult.Token, claimed.ID)
	if err != nil {
		t.Fatalf("start run: %v", err)
	}
	if started.Status != RunStatusRunning || started.StartedAt == nil {
		t.Fatalf("unexpected state after start: %+v", started)
	}

	heartbeated, err := env.automation.HeartbeatRun(context.Background(), deviceResult.Token, claimed.ID)
	if err != nil {
		t.Fatalf("heartbeat run: %v", err)
	}
	if heartbeated.LastHeartbeatAt == nil {
		t.Fatal("expected last_heartbeat_at to be set")
	}

	completed, err := env.automation.CompleteRun(context.Background(), deviceResult.Token, claimed.ID, "all good")
	if err != nil {
		t.Fatalf("complete run: %v", err)
	}
	if completed.Status != RunStatusCompleted || completed.OutputText != "all good" {
		t.Fatalf("unexpected state after complete: %+v", completed)
	}

	reloadedJob, err := env.automation.GetJob(context.Background(), env.adminPrincipal, job.ID)
	if err != nil {
		t.Fatalf("get job: %v", err)
	}
	if reloadedJob.LastRunStatus != RunStatusCompleted {
		t.Fatalf("expected job.last_run_status to reflect completion, got %s", reloadedJob.LastRunStatus)
	}

	// A finished run cannot be completed or failed again.
	if _, err := env.automation.FailRun(context.Background(), deviceResult.Token, claimed.ID, "too late"); err == nil {
		t.Fatal("expected failing an already-completed run to be rejected")
	}
}

func TestDeviceCannotActOnAnotherDevicesRun(t *testing.T) {
	env := newTestEnv(t)
	deviceA, err := env.automation.RegisterDevice(context.Background(), env.adminPrincipal, RegisterDeviceParams{OrganizationID: env.orgID, Name: "Device A"})
	if err != nil {
		t.Fatalf("register device A: %v", err)
	}
	deviceB, err := env.automation.RegisterDevice(context.Background(), env.adminPrincipal, RegisterDeviceParams{OrganizationID: env.orgID, Name: "Device B"})
	if err != nil {
		t.Fatalf("register device B: %v", err)
	}
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Device job",
		TriggerType:     TriggerTypeInterval,
		IntervalSeconds: 3600,
		ExecutionTarget: ExecutionTargetDevice,
		TargetDeviceID:  deviceA.Device.ID,
		Prompt:          "Do local work.",
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	run, err := env.automation.TriggerJobNow(context.Background(), env.adminPrincipal, job.ID)
	if err != nil {
		t.Fatalf("trigger job now: %v", err)
	}

	// Device B cannot claim device A's assigned run at all (claim only
	// returns runs assigned to the calling device).
	claimedByB, err := env.automation.ClaimRun(context.Background(), deviceB.Token)
	if err != nil {
		t.Fatalf("claim run as device B: %v", err)
	}
	if claimedByB != nil {
		t.Fatalf("expected device B to have nothing to claim, got %+v", claimedByB)
	}

	claimedByA, err := env.automation.ClaimRun(context.Background(), deviceA.Token)
	if err != nil {
		t.Fatalf("claim run as device A: %v", err)
	}
	if claimedByA == nil || claimedByA.ID != run.ID {
		t.Fatalf("expected device A to claim its own run, got %+v", claimedByA)
	}

	// Device B still cannot start a run explicitly assigned to device A.
	if _, err := env.automation.StartRun(context.Background(), deviceB.Token, run.ID); err == nil {
		t.Fatal("expected device B to be denied starting device A's run")
	}

	// Nor can device B read the job payload for a run assigned to device A.
	if _, err := env.automation.GetRunJob(context.Background(), deviceB.Token, run.ID); err == nil {
		t.Fatal("expected device B to be denied reading device A's run job")
	}
}

func TestDeviceCannotReadRunJobBeforeClaim(t *testing.T) {
	env := newTestEnv(t)
	deviceResult, err := env.automation.RegisterDevice(context.Background(), env.adminPrincipal, RegisterDeviceParams{OrganizationID: env.orgID, Name: "Worker"})
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

	// The run is queued, not yet claimed — reading its job payload is refused.
	if _, err := env.automation.GetRunJob(context.Background(), deviceResult.Token, run.ID); err == nil {
		t.Fatal("expected reading a queued (unclaimed) run's job to be rejected")
	}
}

func TestDeviceCannotFinishAQueuedRunBeforeClaim(t *testing.T) {
	env := newTestEnv(t)
	deviceResult, err := env.automation.RegisterDevice(context.Background(), env.adminPrincipal, RegisterDeviceParams{OrganizationID: env.orgID, Name: "Worker"})
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

	if _, err := env.automation.CompleteRun(context.Background(), deviceResult.Token, run.ID, "skipped the protocol"); err == nil {
		t.Fatal("expected completing a queued run to be rejected")
	}
	if _, err := env.automation.FailRun(context.Background(), deviceResult.Token, run.ID, "skipped the protocol"); err == nil {
		t.Fatal("expected failing a queued run to be rejected")
	}

	reloaded, err := env.automation.GetRun(context.Background(), env.adminPrincipal, run.ID)
	if err != nil {
		t.Fatalf("get run: %v", err)
	}
	if reloaded.Status != RunStatusQueued {
		t.Fatalf("expected queued run to stay queued, got %s", reloaded.Status)
	}
	if reloaded.FinishedAt != nil {
		t.Fatalf("expected queued run not to be finished, got %v", reloaded.FinishedAt)
	}
}

func TestCancelRun(t *testing.T) {
	env := newTestEnv(t)
	deviceResult, err := env.automation.RegisterDevice(context.Background(), env.adminPrincipal, RegisterDeviceParams{OrganizationID: env.orgID, Name: "Worker"})
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

	cancelled, err := env.automation.CancelRun(context.Background(), env.adminPrincipal, run.ID)
	if err != nil {
		t.Fatalf("cancel run: %v", err)
	}
	if cancelled.Status != RunStatusCancelled {
		t.Fatalf("unexpected status: %s", cancelled.Status)
	}
	if _, err := env.automation.CancelRun(context.Background(), env.adminPrincipal, run.ID); err == nil {
		t.Fatal("expected cancelling an already-finished run to be rejected")
	}
}
