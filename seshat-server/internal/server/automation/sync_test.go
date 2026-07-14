package automation

import (
	"context"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func TestMyRunsReturnsNonTerminalRunsAssignedToTheDevice(t *testing.T) {
	env := newTestEnv(t)
	device, err := env.automation.RegisterDevice(context.Background(), env.adminPrincipal, RegisterDeviceParams{OrganizationID: env.orgID, Name: "Worker"})
	if err != nil {
		t.Fatalf("register device: %v", err)
	}
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Device job",
		TriggerType:     TriggerTypeInterval,
		IntervalSeconds: 3600,
		ExecutionTarget: ExecutionTargetDevice,
		TargetDeviceID:  device.Device.ID,
		Prompt:          "Do local work.",
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	// Before anything is queued, the device has nothing to reconcile.
	empty, err := env.automation.MyRuns(context.Background(), device.Token)
	if err != nil {
		t.Fatalf("my runs (empty): %v", err)
	}
	if len(empty) != 0 {
		t.Fatalf("expected no runs yet, got %d", len(empty))
	}

	run, err := env.automation.TriggerJobNow(context.Background(), env.adminPrincipal, job.ID)
	if err != nil {
		t.Fatalf("trigger job now: %v", err)
	}
	queued, err := env.automation.MyRuns(context.Background(), device.Token)
	if err != nil {
		t.Fatalf("my runs (queued): %v", err)
	}
	if len(queued) != 1 || queued[0].ID != run.ID {
		t.Fatalf("expected the queued run to show up, got %+v", queued)
	}

	if _, err := env.automation.ClaimRun(context.Background(), device.Token); err != nil {
		t.Fatalf("claim run: %v", err)
	}
	claimed, err := env.automation.MyRuns(context.Background(), device.Token)
	if err != nil {
		t.Fatalf("my runs (claimed): %v", err)
	}
	if len(claimed) != 1 || claimed[0].Status != RunStatusClaimed {
		t.Fatalf("expected the claimed run to still show up, got %+v", claimed)
	}

	if _, err := env.automation.CompleteRun(context.Background(), device.Token, run.ID, "done"); err != nil {
		t.Fatalf("complete run: %v", err)
	}
	afterCompletion, err := env.automation.MyRuns(context.Background(), device.Token)
	if err != nil {
		t.Fatalf("my runs (after completion): %v", err)
	}
	if len(afterCompletion) != 0 {
		t.Fatalf("expected no non-terminal runs after completion, got %+v", afterCompletion)
	}
}

func TestSchedulerReapsStaleClaimedRun(t *testing.T) {
	env := newTestEnv(t)
	device, err := env.automation.RegisterDevice(context.Background(), env.adminPrincipal, RegisterDeviceParams{OrganizationID: env.orgID, Name: "Worker"})
	if err != nil {
		t.Fatalf("register device: %v", err)
	}
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Device job",
		TriggerType:     TriggerTypeInterval,
		IntervalSeconds: 3600,
		ExecutionTarget: ExecutionTargetDevice,
		TargetDeviceID:  device.Device.ID,
		Prompt:          "Do local work.",
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	run, err := env.automation.TriggerJobNow(context.Background(), env.adminPrincipal, job.ID)
	if err != nil {
		t.Fatalf("trigger job now: %v", err)
	}
	claimed, err := env.automation.ClaimRun(context.Background(), device.Token)
	if err != nil {
		t.Fatalf("claim run: %v", err)
	}
	if claimed == nil {
		t.Fatal("expected to claim the run")
	}

	// Simulate the device having gone silent a long time ago: back-date the
	// claim so it falls outside a short stale-run timeout, without waiting
	// real wall-clock time.
	longAgo := time.Now().UTC().Add(-time.Hour)
	if err := env.db.Gorm().Model(&sdb.JobRun{}).Where("id = ?", run.ID).
		Update("claimed_at", longAgo).Error; err != nil {
		t.Fatalf("back-date claimed_at: %v", err)
	}

	scheduler := NewScheduler(env.automation, time.Hour).WithStaleRunTimeout(time.Minute)
	if err := scheduler.tick(context.Background()); err != nil {
		t.Fatalf("tick: %v", err)
	}

	reloaded, err := env.automation.GetRun(context.Background(), env.adminPrincipal, run.ID)
	if err != nil {
		t.Fatalf("get run: %v", err)
	}
	if reloaded.Status != RunStatusFailed {
		t.Fatalf("expected the stale run to be reaped as failed, got %s", reloaded.Status)
	}
	if reloaded.ExitReason == "" {
		t.Fatal("expected a non-empty exit reason explaining the reap")
	}

	reloadedJob, err := env.automation.GetJob(context.Background(), env.adminPrincipal, job.ID)
	if err != nil {
		t.Fatalf("get job: %v", err)
	}
	if reloadedJob.LastRunStatus != RunStatusFailed {
		t.Fatalf("expected job.last_run_status to reflect the reap, got %s", reloadedJob.LastRunStatus)
	}

	// A device that later tries to act on the reaped run is told it's over.
	if _, err := env.automation.CompleteRun(context.Background(), device.Token, run.ID, "too late"); err == nil {
		t.Fatal("expected completing an already-reaped run to be rejected")
	}
}

func TestSchedulerDoesNotReapRunsWithRecentHeartbeat(t *testing.T) {
	env := newTestEnv(t)
	device, err := env.automation.RegisterDevice(context.Background(), env.adminPrincipal, RegisterDeviceParams{OrganizationID: env.orgID, Name: "Worker"})
	if err != nil {
		t.Fatalf("register device: %v", err)
	}
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Device job",
		TriggerType:     TriggerTypeInterval,
		IntervalSeconds: 3600,
		ExecutionTarget: ExecutionTargetDevice,
		TargetDeviceID:  device.Device.ID,
		Prompt:          "Do local work.",
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	run, err := env.automation.TriggerJobNow(context.Background(), env.adminPrincipal, job.ID)
	if err != nil {
		t.Fatalf("trigger job now: %v", err)
	}
	if _, err := env.automation.ClaimRun(context.Background(), device.Token); err != nil {
		t.Fatalf("claim run: %v", err)
	}
	if _, err := env.automation.StartRun(context.Background(), device.Token, run.ID); err != nil {
		t.Fatalf("start run: %v", err)
	}
	// Back-date claimed_at/started_at (long ago) but keep a fresh heartbeat —
	// the heartbeat should be what the reaper actually looks at.
	longAgo := time.Now().UTC().Add(-time.Hour)
	if err := env.db.Gorm().Model(&sdb.JobRun{}).Where("id = ?", run.ID).
		Updates(map[string]any{"claimed_at": longAgo, "started_at": longAgo}).Error; err != nil {
		t.Fatalf("back-date timestamps: %v", err)
	}
	if _, err := env.automation.HeartbeatRun(context.Background(), device.Token, run.ID); err != nil {
		t.Fatalf("heartbeat run: %v", err)
	}

	scheduler := NewScheduler(env.automation, time.Hour).WithStaleRunTimeout(time.Minute)
	if err := scheduler.tick(context.Background()); err != nil {
		t.Fatalf("tick: %v", err)
	}

	reloaded, err := env.automation.GetRun(context.Background(), env.adminPrincipal, run.ID)
	if err != nil {
		t.Fatalf("get run: %v", err)
	}
	if reloaded.Status != RunStatusRunning {
		t.Fatalf("expected a recently-heartbeated run to survive the reap, got %s", reloaded.Status)
	}
}
