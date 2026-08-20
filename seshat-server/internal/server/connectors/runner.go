package connectors

import (
	"context"
	"log"
	"time"
)

// RunnerConfig controls how the connector-sync background worker polls and
// backs off. Mirrors knowledge.RunnerConfig's shape exactly.
type RunnerConfig struct {
	PollInterval    time.Duration
	MaxPollInterval time.Duration
	MaxPerTick      int
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

// Runner reaps due connector accounts into sync jobs, then polls and
// processes the sync job queue, backing off exponentially while idle. Safe
// to run on more than one seshat-server process concurrently.
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
	if err := r.service.ReapDueAccounts(ctx); err != nil {
		log.Printf("[connectors] reap due accounts error: %v", err)
	}
	n := 0
	for i := 0; i < r.config.MaxPerTick; i++ {
		processed, err := r.service.ProcessNextConnectorSyncJob(ctx)
		if err != nil {
			log.Printf("[connectors] sync runner error: %v", err)
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
