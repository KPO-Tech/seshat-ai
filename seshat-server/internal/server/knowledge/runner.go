package knowledge

import (
	"context"
	"log"
	"time"
)

// RunnerConfig controls how the ingestion background worker polls and
// backs off. Mirrors seshat-backend/internal/knowledge's runner shape —
// same idle-backoff behavior, adapted to this package's Service.
type RunnerConfig struct {
	// PollInterval is the delay between ticks while jobs are being found.
	PollInterval time.Duration
	// MaxPollInterval caps the idle backoff applied when the queue is empty.
	MaxPollInterval time.Duration
	// MaxPerTick caps how many jobs are processed in a single wakeup.
	MaxPerTick int
}

func (c RunnerConfig) withDefaults() RunnerConfig {
	if c.PollInterval <= 0 {
		c.PollInterval = 500 * time.Millisecond
	}
	if c.MaxPollInterval <= 0 {
		c.MaxPollInterval = 5 * time.Second
	}
	if c.MaxPerTick <= 0 {
		c.MaxPerTick = 4
	}
	return c
}

// Runner polls the ingestion job queue and processes pending jobs,
// backing off exponentially while idle. Safe to run on more than one
// seshat-server process concurrently — see
// Service.ProcessNextIngestionJob's doc comment.
type Runner struct {
	service *Service
	config  RunnerConfig
	stop    chan struct{}
	done    chan struct{}
}

func NewRunner(service *Service, config RunnerConfig) *Runner {
	return &Runner{
		service: service,
		config:  config.withDefaults(),
		stop:    make(chan struct{}),
		done:    make(chan struct{}),
	}
}

// Start launches the runner goroutine.
func (r *Runner) Start() {
	go r.loop()
}

// Stop signals the loop to exit and waits for it to finish.
func (r *Runner) Stop() {
	close(r.stop)
	<-r.done
}

func (r *Runner) loop() {
	defer close(r.done)
	wait := r.config.PollInterval
	timer := time.NewTimer(wait)
	defer timer.Stop()

	for {
		select {
		case <-r.stop:
			return
		case <-timer.C:
			n := r.runTick(context.Background())
			if n > 0 {
				wait = r.config.PollInterval
			} else {
				wait = r.backoff(wait)
			}
			timer.Reset(wait)
		}
	}
}

func (r *Runner) runTick(ctx context.Context) int {
	n := 0
	for i := 0; i < r.config.MaxPerTick; i++ {
		processed, err := r.service.ProcessNextIngestionJob(ctx)
		if err != nil {
			log.Printf("[knowledge] ingestion runner error: %v", err)
			break
		}
		if !processed {
			break
		}
		n++
	}
	return n
}

func (r *Runner) backoff(current time.Duration) time.Duration {
	next := current * 2
	if next > r.config.MaxPollInterval {
		return r.config.MaxPollInterval
	}
	return next
}
