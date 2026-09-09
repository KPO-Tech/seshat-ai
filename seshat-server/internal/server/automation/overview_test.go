package automation

import (
	"context"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// These tests drive real ScheduledJob/JobRun rows directly through
// env.db.Gorm() rather than the full CreateJob/TriggerJobNow/executeCloudRun
// path (see cloud_execution_test.go) - that path always fails the same way
// in this suite (no provider_settings configured) and gives no control over
// timestamps, so it can't produce the deterministic "completed run 5 days
// ago" / "3 failed runs in a row" fixtures these tests need. Direct GORM
// access mirrors exactly what Service itself already does internally
// (s.db.Gorm()...), so this is not reaching around the service's own
// abstractions, just skipping its business logic where that logic isn't
// what's under test.

func createTestJob(t *testing.T, env testEnv, name, status string) sdb.ScheduledJob {
	t.Helper()
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            name,
		TriggerType:     TriggerTypeInterval,
		IntervalSeconds: 3600,
		ExecutionTarget: ExecutionTargetCloud,
		ModelOverride:   "anthropic:claude-sonnet-5",
		Prompt:          "Do work.",
	})
	if err != nil {
		t.Fatalf("create job %q: %v", name, err)
	}
	if status != JobStatusActive {
		if err := env.db.Gorm().Model(&sdb.ScheduledJob{}).Where("id = ?", job.ID).Update("status", status).Error; err != nil {
			t.Fatalf("set job status: %v", err)
		}
	}
	var record sdb.ScheduledJob
	if err := env.db.Gorm().First(&record, "id = ?", job.ID).Error; err != nil {
		t.Fatalf("reload job: %v", err)
	}
	return record
}

// seedRun directly inserts a JobRun row with a chosen status/queuedAt, and
// reflects it onto the job's LastRunStatus (mirroring what
// queueRunForJob/reflectRunOutcomeOnJob do in the real execution path) so
// computeAttentionItems' cheap LastRunStatus pre-filter sees a consistent
// picture.
func seedRun(t *testing.T, env testEnv, jobID, status string, queuedAt time.Time) sdb.JobRun {
	t.Helper()
	id, err := sdb.NewID("run")
	if err != nil {
		t.Fatalf("new run id: %v", err)
	}
	run := sdb.JobRun{
		ID:              id,
		JobID:           jobID,
		OrganizationID:  env.orgID,
		ExecutionTarget: ExecutionTargetCloud,
		Status:          status,
		QueuedAt:        queuedAt,
	}
	if err := env.db.Gorm().Create(&run).Error; err != nil {
		t.Fatalf("seed run: %v", err)
	}
	if err := env.db.Gorm().Model(&sdb.ScheduledJob{}).Where("id = ?", jobID).
		Updates(map[string]any{"last_run_status": status, "last_run_at": queuedAt}).Error; err != nil {
		t.Fatalf("reflect run onto job: %v", err)
	}
	return run
}

func TestGetOverviewCountsActiveAndTotalProjects(t *testing.T) {
	env := newTestEnv(t)
	createTestJob(t, env, "Active one", JobStatusActive)
	createTestJob(t, env, "Active two", JobStatusActive)
	createTestJob(t, env, "Paused one", JobStatusPaused)

	overview, err := env.automation.GetOverview(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("get overview: %v", err)
	}
	if overview.Stats.ActiveProjects != 2 {
		t.Fatalf("expected 2 active projects, got %d", overview.Stats.ActiveProjects)
	}
	if overview.Stats.TotalProjects != 3 {
		t.Fatalf("expected 3 total projects, got %d", overview.Stats.TotalProjects)
	}
}

func TestGetOverviewNewProjectsThisMonthExcludesOlderJobs(t *testing.T) {
	env := newTestEnv(t)
	recent := createTestJob(t, env, "This month", JobStatusActive)
	old := createTestJob(t, env, "Last month", JobStatusActive)

	lastMonth := time.Now().UTC().AddDate(0, -1, 0)
	if err := env.db.Gorm().Model(&sdb.ScheduledJob{}).Where("id = ?", old.ID).Update("created_at", lastMonth).Error; err != nil {
		t.Fatalf("backdate job: %v", err)
	}
	_ = recent

	overview, err := env.automation.GetOverview(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("get overview: %v", err)
	}
	if overview.Stats.NewProjectsThisMonth != 1 {
		t.Fatalf("expected exactly 1 new project this month, got %d", overview.Stats.NewProjectsThisMonth)
	}
	if overview.Stats.TotalProjects != 2 {
		t.Fatalf("expected total projects to still include the old job, got %d", overview.Stats.TotalProjects)
	}
}

func TestGetOverviewExecutionsWindowExcludesOldRuns(t *testing.T) {
	env := newTestEnv(t)
	job := createTestJob(t, env, "Job", JobStatusActive)

	seedRun(t, env, job.ID, RunStatusCompleted, time.Now().UTC().AddDate(0, 0, -40))
	seedRun(t, env, job.ID, RunStatusCompleted, time.Now().UTC().AddDate(0, 0, -5))

	overview, err := env.automation.GetOverview(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("get overview: %v", err)
	}
	if overview.Stats.ExecutionsWindow != 1 {
		t.Fatalf("expected only the recent run to count toward the 30-day window, got %d", overview.Stats.ExecutionsWindow)
	}
}

func TestGetOverviewSuccessRateComputation(t *testing.T) {
	env := newTestEnv(t)
	job := createTestJob(t, env, "Job", JobStatusActive)
	now := time.Now().UTC()

	seedRun(t, env, job.ID, RunStatusCompleted, now)
	seedRun(t, env, job.ID, RunStatusCompleted, now)
	seedRun(t, env, job.ID, RunStatusCompleted, now)
	seedRun(t, env, job.ID, RunStatusFailed, now)

	overview, err := env.automation.GetOverview(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("get overview: %v", err)
	}
	if overview.Stats.SuccessRatePercent == nil {
		t.Fatal("expected a non-nil success rate")
	}
	if got := *overview.Stats.SuccessRatePercent; got < 74.9 || got > 75.1 {
		t.Fatalf("expected success rate ~75%%, got %v", got)
	}
	if got := *overview.Stats.FailureRatePercent; got < 24.9 || got > 25.1 {
		t.Fatalf("expected failure rate ~25%%, got %v", got)
	}
}

func TestGetOverviewSuccessRateNilWhenNoFinishedRuns(t *testing.T) {
	env := newTestEnv(t)
	job := createTestJob(t, env, "Job", JobStatusActive)
	seedRun(t, env, job.ID, RunStatusQueued, time.Now().UTC())
	seedRun(t, env, job.ID, RunStatusRunning, time.Now().UTC())

	overview, err := env.automation.GetOverview(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("get overview: %v", err)
	}
	if overview.Stats.SuccessRatePercent != nil {
		t.Fatalf("expected a nil success rate with no finished runs, got %v", *overview.Stats.SuccessRatePercent)
	}
	if overview.Stats.FailureRatePercent != nil {
		t.Fatalf("expected a nil failure rate with no finished runs, got %v", *overview.Stats.FailureRatePercent)
	}
}

func TestGetOverviewAttentionFlagsConsecutiveFailures(t *testing.T) {
	env := newTestEnv(t)
	job := createTestJob(t, env, "Flaky job", JobStatusActive)
	now := time.Now().UTC()
	seedRun(t, env, job.ID, RunStatusFailed, now.Add(-3*time.Minute))
	seedRun(t, env, job.ID, RunStatusFailed, now.Add(-2*time.Minute))
	last := seedRun(t, env, job.ID, RunStatusFailed, now.Add(-1*time.Minute))

	overview, err := env.automation.GetOverview(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("get overview: %v", err)
	}
	if len(overview.Attention) != 1 {
		t.Fatalf("expected exactly 1 attention item, got %d: %+v", len(overview.Attention), overview.Attention)
	}
	item := overview.Attention[0]
	if item.Kind != AttentionKindConsecutiveFailures {
		t.Fatalf("expected consecutive_failures kind, got %q", item.Kind)
	}
	if item.JobID != job.ID {
		t.Fatalf("expected the flaky job's id, got %q", item.JobID)
	}
	if item.LastRunID != last.ID {
		t.Fatalf("expected the most recent failed run's id, got %q want %q", item.LastRunID, last.ID)
	}
}

func TestGetOverviewAttentionIgnoresJobWithMixedRecentRuns(t *testing.T) {
	env := newTestEnv(t)
	job := createTestJob(t, env, "Mostly fine job", JobStatusActive)
	now := time.Now().UTC()
	seedRun(t, env, job.ID, RunStatusFailed, now.Add(-3*time.Minute))
	seedRun(t, env, job.ID, RunStatusCompleted, now.Add(-2*time.Minute))
	seedRun(t, env, job.ID, RunStatusFailed, now.Add(-1*time.Minute))

	overview, err := env.automation.GetOverview(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("get overview: %v", err)
	}
	if len(overview.Attention) != 0 {
		t.Fatalf("expected no attention items for a job whose recent runs aren't all failed, got %+v", overview.Attention)
	}
}

func TestGetOverviewAttentionIgnoresJobWithFewerThanThresholdRuns(t *testing.T) {
	env := newTestEnv(t)
	job := createTestJob(t, env, "New flaky job", JobStatusActive)
	now := time.Now().UTC()
	seedRun(t, env, job.ID, RunStatusFailed, now.Add(-2*time.Minute))
	seedRun(t, env, job.ID, RunStatusFailed, now.Add(-1*time.Minute))

	overview, err := env.automation.GetOverview(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("get overview: %v", err)
	}
	if len(overview.Attention) != 0 {
		t.Fatalf("expected no attention items without enough run history to call it a streak, got %+v", overview.Attention)
	}
}

func TestGetOverviewAttentionIgnoresPausedJob(t *testing.T) {
	env := newTestEnv(t)
	job := createTestJob(t, env, "Paused flaky job", JobStatusActive)
	now := time.Now().UTC()
	seedRun(t, env, job.ID, RunStatusFailed, now.Add(-3*time.Minute))
	seedRun(t, env, job.ID, RunStatusFailed, now.Add(-2*time.Minute))
	seedRun(t, env, job.ID, RunStatusFailed, now.Add(-1*time.Minute))
	if err := env.db.Gorm().Model(&sdb.ScheduledJob{}).Where("id = ?", job.ID).Update("status", JobStatusPaused).Error; err != nil {
		t.Fatalf("pause job: %v", err)
	}

	overview, err := env.automation.GetOverview(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("get overview: %v", err)
	}
	if len(overview.Attention) != 0 {
		t.Fatalf("expected a paused job's failure streak not to surface, got %+v", overview.Attention)
	}
}

func TestGetOverviewRecentActivityIncludesJobNameAndOrdering(t *testing.T) {
	env := newTestEnv(t)
	job := createTestJob(t, env, "Named job", JobStatusActive)
	now := time.Now().UTC()
	older := seedRun(t, env, job.ID, RunStatusCompleted, now.Add(-10*time.Minute))
	newer := seedRun(t, env, job.ID, RunStatusFailed, now.Add(-1*time.Minute))

	overview, err := env.automation.GetOverview(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("get overview: %v", err)
	}
	if len(overview.RecentActivity) != 2 {
		t.Fatalf("expected 2 recent activity items, got %d", len(overview.RecentActivity))
	}
	if overview.RecentActivity[0].RunID != newer.ID {
		t.Fatalf("expected the newer run first, got %q", overview.RecentActivity[0].RunID)
	}
	if overview.RecentActivity[1].RunID != older.ID {
		t.Fatalf("expected the older run second, got %q", overview.RecentActivity[1].RunID)
	}
	for _, item := range overview.RecentActivity {
		if item.JobName != "Named job" {
			t.Fatalf("expected the job name to be joined in, got %q", item.JobName)
		}
	}
}

func TestGetOverviewRecentActivityLimitsCount(t *testing.T) {
	env := newTestEnv(t)
	job := createTestJob(t, env, "Busy job", JobStatusActive)
	now := time.Now().UTC()
	for i := 0; i < recentActivityLimit+5; i++ {
		seedRun(t, env, job.ID, RunStatusCompleted, now.Add(-time.Duration(i)*time.Minute))
	}

	overview, err := env.automation.GetOverview(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("get overview: %v", err)
	}
	if len(overview.RecentActivity) != recentActivityLimit {
		t.Fatalf("expected the activity feed capped at %d, got %d", recentActivityLimit, len(overview.RecentActivity))
	}
}

func TestGetOverviewScopedByPermission(t *testing.T) {
	env := newTestEnv(t)
	createTestJob(t, env, "Job", JobStatusActive)
	outsider := env.addOutsider(t)

	overview, err := env.automation.GetOverview(context.Background(), outsider, env.orgID)
	if err != nil {
		t.Fatalf("get overview as outsider: %v", err)
	}
	if overview.Stats.TotalProjects != 0 || len(overview.Attention) != 0 || len(overview.RecentActivity) != 0 {
		t.Fatalf("expected an empty-shaped overview for a caller without access, got %+v", overview)
	}
}

func TestGetOverviewRequiresOrganizationID(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.automation.GetOverview(context.Background(), env.adminPrincipal, ""); err == nil {
		t.Fatal("expected an empty organization_id to be rejected")
	}
}

func TestGetOverviewRequiresPrincipal(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.automation.GetOverview(context.Background(), nil, env.orgID); err == nil {
		t.Fatal("expected a nil principal to be rejected")
	}
}
