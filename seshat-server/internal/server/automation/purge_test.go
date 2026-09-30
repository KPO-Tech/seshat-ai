package automation

import (
	"context"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// insertTestRun writes a JobRun row directly (bypassing queueRunForJob) so
// purge tests can control QueuedAt/Status precisely without needing a real
// execution to have happened.
func insertTestRun(t *testing.T, env testEnv, jobID, status string, queuedAt time.Time) string {
	t.Helper()
	run := sdb.JobRun{
		ID: "run_" + randomSuffix(t), JobID: jobID, OrganizationID: env.orgID,
		ExecutionTarget: ExecutionTargetCloud, Status: status, QueuedAt: queuedAt,
	}
	if err := env.db.Gorm().Create(&run).Error; err != nil {
		t.Fatalf("insert test run: %v", err)
	}
	return run.ID
}

var randomSuffixCounter int

// randomSuffix keeps generated IDs unique within a test without pulling in
// a real ID generator - purge tests don't care about ID shape.
func randomSuffix(t *testing.T) string {
	t.Helper()
	randomSuffixCounter++
	return time.Now().Format("150405.000000000") + "_" + string(rune('a'+randomSuffixCounter%26))
}

func countRuns(t *testing.T, env testEnv, jobID string) int64 {
	t.Helper()
	var count int64
	if err := env.db.Gorm().Model(&sdb.JobRun{}).Where("job_id = ?", jobID).Count(&count).Error; err != nil {
		t.Fatalf("count runs: %v", err)
	}
	return count
}

func runExists(t *testing.T, env testEnv, runID string) bool {
	t.Helper()
	var count int64
	if err := env.db.Gorm().Model(&sdb.JobRun{}).Where("id = ?", runID).Count(&count).Error; err != nil {
		t.Fatalf("check run exists: %v", err)
	}
	return count > 0
}

func TestPurgeOldJobRunsDeletesOnlyOldTerminalRuns(t *testing.T) {
	env := newTestEnv(t)
	now := time.Now().UTC()

	oldCompleted := insertTestRun(t, env, "job-a", RunStatusCompleted, now.Add(-48*time.Hour))
	oldFailed := insertTestRun(t, env, "job-a", RunStatusFailed, now.Add(-48*time.Hour))
	oldButRunning := insertTestRun(t, env, "job-a", RunStatusRunning, now.Add(-48*time.Hour))
	recentCompleted := insertTestRun(t, env, "job-a", RunStatusCompleted, now.Add(-1*time.Hour))

	if err := env.automation.purgeOldJobRuns(context.Background(), 24*time.Hour); err != nil {
		t.Fatalf("purge: %v", err)
	}

	if runExists(t, env, oldCompleted) {
		t.Error("expected old completed run to be purged")
	}
	if runExists(t, env, oldFailed) {
		t.Error("expected old failed run to be purged")
	}
	if !runExists(t, env, oldButRunning) {
		t.Error("expected an old but still-running run to survive - never purge in-flight runs")
	}
	if !runExists(t, env, recentCompleted) {
		t.Error("expected a recent completed run to survive")
	}
}

func TestPurgeOldJobRunsDisabledWhenMaxAgeIsZero(t *testing.T) {
	env := newTestEnv(t)
	old := insertTestRun(t, env, "job-a", RunStatusCompleted, time.Now().UTC().Add(-24*365*time.Hour))

	purge := NewJobRunPurge(env.automation, 0, 0, time.Hour)
	purge.run()

	if !runExists(t, env, old) {
		t.Error("expected maxAge=0 to disable age-based purging entirely")
	}
}

func TestPurgeExcessJobRunsPerJobKeepsNewestAndIsolatesJobs(t *testing.T) {
	env := newTestEnv(t)
	now := time.Now().UTC()

	// job-a: 5 completed runs, keep newest 2. Insert oldest (i=4, now-4h)
	// first so jobARunsOldestFirst ends up in oldest-to-newest order.
	var jobARunsOldestFirst []string
	for i := 4; i >= 0; i-- {
		jobARunsOldestFirst = append(jobARunsOldestFirst, insertTestRun(t, env, "job-a", RunStatusCompleted, now.Add(-time.Duration(i)*time.Hour)))
	}
	// job-b: only 1 completed run - must be entirely unaffected by job-a's own count.
	jobBRun := insertTestRun(t, env, "job-b", RunStatusCompleted, now.Add(-100*time.Hour))

	if err := env.automation.purgeExcessJobRunsPerJob(context.Background(), 2); err != nil {
		t.Fatalf("purge: %v", err)
	}

	if got := countRuns(t, env, "job-a"); got != 2 {
		t.Fatalf("expected job-a to keep exactly 2 runs, got %d", got)
	}
	// The two newest (last two in oldest-first order) must be the survivors.
	for _, id := range jobARunsOldestFirst[:3] {
		if runExists(t, env, id) {
			t.Errorf("expected old excess run %s to be purged", id)
		}
	}
	for _, id := range jobARunsOldestFirst[3:] {
		if !runExists(t, env, id) {
			t.Errorf("expected newest run %s to survive", id)
		}
	}
	if !runExists(t, env, jobBRun) {
		t.Error("expected job-b's single run to be unaffected by job-a's count limit")
	}
}

func TestPurgeExcessJobRunsPerJobDisabledWhenMaxCountIsZero(t *testing.T) {
	env := newTestEnv(t)
	now := time.Now().UTC()
	for i := 0; i < 5; i++ {
		insertTestRun(t, env, "job-a", RunStatusCompleted, now.Add(-time.Duration(i)*time.Hour))
	}

	purge := NewJobRunPurge(env.automation, 0, 0, time.Hour)
	purge.run()

	if got := countRuns(t, env, "job-a"); got != 5 {
		t.Fatalf("expected maxCountPerJob=0 to disable count-based purging entirely, got %d runs left", got)
	}
}

func TestPurgeBatchesUntilNoneRemain(t *testing.T) {
	env := newTestEnv(t)
	origBatchSize := purgeBatchSize
	purgeBatchSize = 3
	t.Cleanup(func() { purgeBatchSize = origBatchSize })

	now := time.Now().UTC()
	const total = 10
	for i := 0; i < total; i++ {
		insertTestRun(t, env, "job-a", RunStatusCompleted, now.Add(-time.Duration(i+1)*time.Hour))
	}

	if err := env.automation.purgeOldJobRuns(context.Background(), 30*time.Minute); err != nil {
		t.Fatalf("purge: %v", err)
	}

	if got := countRuns(t, env, "job-a"); got != 0 {
		t.Fatalf("expected batching to eventually delete all %d matching runs, %d remain", total, got)
	}
}
