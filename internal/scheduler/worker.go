package scheduler

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/EngineerProjects/seshat-ai/internal/db"
)

const (
	// workerInterval is how often the worker checks for due jobs.
	// 30s ensures jobs fire within one minute of their scheduled time.
	workerInterval = 30 * time.Second

	// jobTimeout is the maximum time a single job execution may take.
	jobTimeout = 10 * time.Minute
)

// Worker is a background goroutine that polls for due scheduled jobs and
// executes them via the provided JobExecutor.
type Worker struct {
	store    *db.ScheduledJobStore
	executor JobExecutor
	quit     chan struct{}
	once     sync.Once
}

// NewWorker creates a Worker. Call Start to begin polling.
func NewWorker(store *db.ScheduledJobStore, executor JobExecutor) *Worker {
	return &Worker{
		store:    store,
		executor: executor,
		quit:     make(chan struct{}),
	}
}

// Start launches the background polling goroutine. Safe to call once.
func (w *Worker) Start() {
	w.once.Do(func() {
		go w.run()
	})
}

// Stop signals the worker to shut down. It does not wait for in-flight jobs.
func (w *Worker) Stop() {
	close(w.quit)
}

// TriggerNow runs a job immediately in its own goroutine, regardless of its
// scheduled time. Used by the manual-run endpoint.
func (w *Worker) TriggerNow(job Job) {
	go w.runJob(jobToDB(job))
}

func jobToDB(j Job) db.ScheduledJob {
	dbj := db.ScheduledJob{
		ID:           j.ID,
		UserID:       j.UserID,
		Name:         j.Name,
		CronExpr:     j.CronExpr,
		AgentSlug:    j.AgentSlug,
		Prompt:       j.Prompt,
		SessionTitle: j.SessionTitle,
		Enabled:      j.Enabled,
		NextRunAt:    j.NextRunAt,
		LastStatus:   j.LastStatus,
		LastError:    j.LastError,
		CreatedAt:    j.CreatedAt,
		UpdatedAt:    j.UpdatedAt,
	}
	if j.LastRunAt != nil {
		t := *j.LastRunAt
		dbj.LastRunAt = &t
	}
	return dbj
}

func (w *Worker) run() {
	// Fire immediately on startup so we pick up any jobs that fired while
	// the server was down, then tick every workerInterval.
	w.tick()
	ticker := time.NewTicker(workerInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			w.tick()
		case <-w.quit:
			return
		}
	}
}

func (w *Worker) tick() {
	ctx, cancel := context.WithTimeout(context.Background(), workerInterval)
	defer cancel()

	jobs, err := w.store.ListDue(ctx, time.Now())
	if err != nil {
		log.Printf("[scheduler] failed to list due jobs: %v", err)
		return
	}
	for _, job := range jobs {
		go w.runJob(job)
	}
}

func (w *Worker) runJob(job db.ScheduledJob) {
	// Mark as running before launching so a concurrent tick won't re-fire it.
	ctx := context.Background()
	if err := w.store.SetRunning(ctx, job.ID); err != nil {
		log.Printf("[scheduler] failed to mark job %s as running: %v", job.ID, err)
		return
	}

	startedAt := time.Now()
	execCtx, cancel := context.WithTimeout(ctx, jobTimeout)
	defer cancel()

	execErr := func() (err error) {
		defer func() {
			if rec := recover(); rec != nil {
				err = fmt.Errorf("panic: %v", rec)
			}
		}()
		return w.executor(execCtx, ExecParams{
			UserID:       job.UserID,
			JobID:        job.ID,
			JobName:      job.Name,
			Prompt:       job.Prompt,
			AgentSlug:    job.AgentSlug,
			SessionTitle: job.SessionTitle,
		})
	}()

	// Compute next run time.
	nextRun := startedAt.Add(time.Minute) // fallback
	if cron, parseErr := ParseCron(job.CronExpr); parseErr == nil {
		if t, nextErr := cron.Next(startedAt); nextErr == nil {
			nextRun = t
		}
	}

	status := "ok"
	errMsg := ""
	if execErr != nil {
		status = "error"
		errMsg = execErr.Error()
		log.Printf("[scheduler] job %s (%s) failed: %v", job.ID, job.Name, execErr)
	} else {
		log.Printf("[scheduler] job %s (%s) completed in %s, next: %s",
			job.ID, job.Name, time.Since(startedAt).Round(time.Millisecond), nextRun.Format(time.RFC3339))
	}

	if err := w.store.MarkCompleted(ctx, job.ID, startedAt, nextRun, status, errMsg); err != nil {
		log.Printf("[scheduler] failed to update job %s after run: %v", job.ID, err)
	}
}
