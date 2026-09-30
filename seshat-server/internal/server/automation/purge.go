package automation

import (
	"context"
	"log"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// purgeBatchSize/purgeMaxBatchesPerTick are vars, not consts, so tests can
// shrink them to exercise the batching loop without creating thousands of
// rows. purgeableStatuses excludes every in-flight status - a run is only
// ever eligible for purge once it's done, regardless of age or count.
var (
	purgeBatchSize         = 500
	purgeMaxBatchesPerTick = 100
)

var purgeableStatuses = []string{RunStatusCompleted, RunStatusFailed, RunStatusCancelled}

// JobRunPurge periodically deletes old/excess JobRun rows (Tier 1.4, see
// docs/helps/audit-2026-09-04-n8n-gap-analysis.md) - each carries a
// potentially large NodeTrace/TriggerPayload JSON blob, kept forever
// otherwise. Mirrors workspacechat.Cleanup's Start/Stop tick-loop shape.
// Safe to run on more than one seshat-server process concurrently: every
// delete is a plain DELETE ... WHERE, naturally idempotent under duplicate
// concurrent execution (no create-a-side-effect step to guard with a claim,
// unlike Scheduler).
type JobRunPurge struct {
	service        *Service
	maxAge         time.Duration
	maxCountPerJob int
	interval       time.Duration
	stop, done     chan struct{}
}

// NewJobRunPurge - maxAge/maxCountPerJob of 0 disables that criterion.
func NewJobRunPurge(service *Service, maxAge time.Duration, maxCountPerJob int, interval time.Duration) *JobRunPurge {
	if interval <= 0 {
		interval = time.Hour
	}
	return &JobRunPurge{service: service, maxAge: maxAge, maxCountPerJob: maxCountPerJob, interval: interval,
		stop: make(chan struct{}), done: make(chan struct{})}
}

// Start runs the tick loop in the background until Stop is called. Sweeps
// once immediately too, so a short-lived process still gets one pass.
func (p *JobRunPurge) Start() { go p.loop() }

// Stop signals the loop to exit and waits for it to finish.
func (p *JobRunPurge) Stop() {
	close(p.stop)
	<-p.done
}

func (p *JobRunPurge) loop() {
	defer close(p.done)
	p.run()

	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()
	for {
		select {
		case <-p.stop:
			return
		case <-ticker.C:
			p.run()
		}
	}
}

func (p *JobRunPurge) run() {
	ctx := context.Background()
	if p.maxAge > 0 {
		if err := p.service.purgeOldJobRuns(ctx, p.maxAge); err != nil {
			log.Printf("[automation] purge old job runs failed: %v", err)
		}
	}
	if p.maxCountPerJob > 0 {
		if err := p.service.purgeExcessJobRunsPerJob(ctx, p.maxCountPerJob); err != nil {
			log.Printf("[automation] purge excess job runs failed: %v", err)
		}
	}
}

// purgeOldJobRuns deletes terminal-status runs older than maxAge, in
// batches of purgeBatchSize, stopping once a batch comes back short (no
// more matches) or purgeMaxBatchesPerTick is reached - a pathological
// backlog resumes on the next tick instead of blocking this one
// indefinitely.
func (s *Service) purgeOldJobRuns(ctx context.Context, maxAge time.Duration) error {
	cutoff := time.Now().UTC().Add(-maxAge)
	for batch := 0; batch < purgeMaxBatchesPerTick; batch++ {
		var ids []string
		if err := s.db.Gorm().WithContext(ctx).Model(&sdb.JobRun{}).
			Where("queued_at < ? AND status IN ?", cutoff, purgeableStatuses).
			Limit(purgeBatchSize).Pluck("id", &ids).Error; err != nil {
			return err
		}
		if len(ids) == 0 {
			return nil
		}
		if err := s.db.Gorm().WithContext(ctx).Where("id IN ?", ids).Delete(&sdb.JobRun{}).Error; err != nil {
			return err
		}
		if len(ids) < purgeBatchSize {
			return nil
		}
	}
	return nil
}

// purgeExcessJobRunsPerJob keeps each job's newest maxCountPerJob
// terminal-status runs, deleting the rest - the number of distinct jobs
// with an excess is small (unlike the number of runs), so a per-job loop
// stays cheap without needing a window-function query.
func (s *Service) purgeExcessJobRunsPerJob(ctx context.Context, maxCountPerJob int) error {
	var jobIDs []string
	if err := s.db.Gorm().WithContext(ctx).Model(&sdb.JobRun{}).
		Where("status IN ?", purgeableStatuses).
		Group("job_id").Having("COUNT(*) > ?", maxCountPerJob).
		Pluck("job_id", &jobIDs).Error; err != nil {
		return err
	}
	for _, jobID := range jobIDs {
		if err := s.purgeExcessRunsForJob(ctx, jobID, maxCountPerJob); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) purgeExcessRunsForJob(ctx context.Context, jobID string, maxCountPerJob int) error {
	// The set of "newest N to keep" doesn't change as older excess rows get
	// deleted below, so it's computed once rather than per batch.
	var keepIDs []string
	if err := s.db.Gorm().WithContext(ctx).Model(&sdb.JobRun{}).
		Where("job_id = ? AND status IN ?", jobID, purgeableStatuses).
		Order("queued_at DESC").Limit(maxCountPerJob).Pluck("id", &keepIDs).Error; err != nil {
		return err
	}

	for batch := 0; batch < purgeMaxBatchesPerTick; batch++ {
		query := s.db.Gorm().WithContext(ctx).Model(&sdb.JobRun{}).
			Where("job_id = ? AND status IN ?", jobID, purgeableStatuses)
		if len(keepIDs) > 0 {
			query = query.Where("id NOT IN ?", keepIDs)
		}
		var excessIDs []string
		if err := query.Limit(purgeBatchSize).Pluck("id", &excessIDs).Error; err != nil {
			return err
		}
		if len(excessIDs) == 0 {
			return nil
		}
		if err := s.db.Gorm().WithContext(ctx).Where("id IN ?", excessIDs).Delete(&sdb.JobRun{}).Error; err != nil {
			return err
		}
		if len(excessIDs) < purgeBatchSize {
			return nil
		}
	}
	return nil
}
