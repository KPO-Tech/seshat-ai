package automation

import (
	"context"
	"errors"
	"log"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// defaultStaleRunTimeout is how long a claimed/running run may go without a
// heartbeat before the scheduler assumes the device went silent (crashed,
// lost network, force-quit) and fails the run on its behalf, so the job
// isn't stuck forever waiting for a device that will never report back.
const defaultStaleRunTimeout = 10 * time.Minute

// Scheduler periodically queues runs for jobs whose next_run_at is due, and
// reaps runs that a device claimed but then went silent on.
//
// Single-instance only: it re-reads and updates each due job sequentially
// within one goroutine, which is race-free as long as exactly one
// seshat-server process runs the scheduler. Running multiple instances of
// the scheduler concurrently (multi-instance HA) could double-queue a run —
// out of scope for now (see helps/seshat-architecture-target.md, this is a
// deliberately deferred "later" concern, not an oversight).
type Scheduler struct {
	service         *Service
	interval        time.Duration
	staleRunTimeout time.Duration
	stop            chan struct{}
	done            chan struct{}
}

func NewScheduler(service *Service, interval time.Duration) *Scheduler {
	if interval <= 0 {
		interval = 30 * time.Second
	}
	return &Scheduler{
		service:         service,
		interval:        interval,
		staleRunTimeout: defaultStaleRunTimeout,
		stop:            make(chan struct{}),
		done:            make(chan struct{}),
	}
}

// WithStaleRunTimeout overrides the default 10-minute silence threshold
// before a claimed/running run is reaped. Returns the scheduler for chaining.
func (sch *Scheduler) WithStaleRunTimeout(timeout time.Duration) *Scheduler {
	if timeout > 0 {
		sch.staleRunTimeout = timeout
	}
	return sch
}

// Start runs the tick loop in the background until Stop is called.
func (sch *Scheduler) Start() {
	go sch.loop()
}

// Stop signals the loop to exit and waits for it to finish.
func (sch *Scheduler) Stop() {
	close(sch.stop)
	<-sch.done
}

func (sch *Scheduler) loop() {
	defer close(sch.done)
	ticker := time.NewTicker(sch.interval)
	defer ticker.Stop()
	for {
		select {
		case <-sch.stop:
			return
		case <-ticker.C:
			if err := sch.tick(context.Background()); err != nil {
				log.Printf("[automation] scheduler tick error: %v", err)
			}
		}
	}
}

func (sch *Scheduler) tick(ctx context.Context) error {
	now := time.Now().UTC()

	if err := sch.reapStaleRuns(ctx, now); err != nil {
		log.Printf("[automation] reap stale runs error: %v", err)
	}

	var due []sdb.ScheduledJob
	err := sch.service.db.Gorm().WithContext(ctx).
		Where("status = ? AND next_run_at IS NOT NULL AND next_run_at <= ?", JobStatusActive, now).
		Find(&due).Error
	if err != nil {
		return err
	}
	for _, job := range due {
		if err := sch.queueAndReschedule(ctx, job, now); err != nil {
			log.Printf("[automation] failed to queue run for job %s (%s): %v", job.ID, job.Name, err)
		}
	}

	if err := sch.executeQueuedCloudRuns(ctx); err != nil {
		log.Printf("[automation] execute queued cloud runs error: %v", err)
	}
	return nil
}

// executeQueuedCloudRuns runs every queued cloud-targeted run sequentially.
// Picks up runs freshly queued above and any left over from a previous tick
// (e.g. the process restarted between queueing and execution). Sequential
// on purpose — this is background automation, not a request path, and a
// single in-process worker keeps this MVP simple; revisit with a bounded
// worker pool if cloud job volume ever makes 30s-tick-serial too slow.
func (sch *Scheduler) executeQueuedCloudRuns(ctx context.Context) error {
	var runs []sdb.JobRun
	err := sch.service.db.Gorm().WithContext(ctx).
		Where("status = ? AND execution_target = ?", RunStatusQueued, ExecutionTargetCloud).
		Order("queued_at asc").
		Find(&runs).Error
	if err != nil {
		return err
	}
	for _, run := range runs {
		if err := sch.service.executeCloudRun(ctx, run.ID); err != nil {
			log.Printf("[automation] cloud run %s execution error: %v", run.ID, err)
		}
	}
	return nil
}

// reapStaleRuns fails any claimed/running run whose most recent activity
// (heartbeat, or start/claim if it never got a heartbeat) is older than
// staleRunTimeout — the device-side counterpart of a device crashing mid-run
// without ever calling /complete or /fail.
func (sch *Scheduler) reapStaleRuns(ctx context.Context, now time.Time) error {
	threshold := now.Add(-sch.staleRunTimeout)
	var stale []sdb.JobRun
	err := sch.service.db.Gorm().WithContext(ctx).
		Where("status IN ?", []string{RunStatusClaimed, RunStatusRunning}).
		Find(&stale).Error
	if err != nil {
		return err
	}
	for _, run := range stale {
		lastActivity := run.ClaimedAt
		if run.StartedAt != nil {
			lastActivity = run.StartedAt
		}
		if run.LastHeartbeatAt != nil {
			lastActivity = run.LastHeartbeatAt
		}
		if lastActivity == nil || lastActivity.After(threshold) {
			continue
		}
		if err := sch.failStaleRun(ctx, run.ID); err != nil {
			log.Printf("[automation] failed to reap stale run %s: %v", run.ID, err)
		}
	}
	return nil
}

func (sch *Scheduler) failStaleRun(ctx context.Context, runID string) error {
	return sch.service.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.JobRun
		if err := tx.First(&record, "id = ?", runID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}
		switch record.Status {
		case RunStatusClaimed, RunStatusRunning:
			// Still stale and in-flight.
		default:
			return nil // resolved by the device (or a previous reap) since we listed it
		}
		expectedStatus := record.Status
		now := time.Now().UTC()
		record.Status = RunStatusFailed
		record.FinishedAt = &now
		record.ExitReason = "device went silent: no heartbeat received within the stale-run timeout"
		record.ErrorText = record.ExitReason
		result := tx.Model(&sdb.JobRun{}).
			Where("id = ? AND status = ?", record.ID, expectedStatus).
			Updates(map[string]any{"status": record.Status, "finished_at": record.FinishedAt, "exit_reason": record.ExitReason, "error_text": record.ErrorText})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return nil
		}
		return reflectRunOutcomeOnJob(tx, record)
	})
}

func (sch *Scheduler) queueAndReschedule(ctx context.Context, job sdb.ScheduledJob, now time.Time) error {
	return sch.service.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if _, err := queueRunForJob(tx, job, now); err != nil {
			return err
		}
		trigger := jobTriggerParams{
			TriggerType:     job.TriggerType,
			CronExpr:        job.CronExpr,
			IntervalSeconds: job.IntervalSeconds,
			RunAt:           job.RunAt,
		}
		next, err := computeNextRunAt(trigger, now)
		if err != nil {
			return err
		}
		return tx.Model(&sdb.ScheduledJob{}).Where("id = ?", job.ID).
			Updates(map[string]any{"next_run_at": next, "updated_at": now}).Error
	})
}
