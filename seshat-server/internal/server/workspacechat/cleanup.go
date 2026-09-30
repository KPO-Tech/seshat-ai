package workspacechat

import (
	"context"
	"time"
)

// Cleanup periodically purges chat sessions past sessionRetention. Mirrors
// automation.Scheduler's Start/Stop tick-loop shape for consistency. Safe to
// run on more than one seshat-server process concurrently: purgeExpiredSessions
// is a plain DELETE ... WHERE created_at < threshold, naturally idempotent
// under duplicate concurrent execution (a second instance's identical
// DELETE just matches the rows the first one already removed) — unlike
// automation.Scheduler, there's no create-a-side-effect step here to guard
// with a claim.
type Cleanup struct {
	service  *Service
	interval time.Duration
	stop     chan struct{}
	done     chan struct{}
}

func NewCleanup(service *Service, interval time.Duration) *Cleanup {
	if interval <= 0 {
		interval = time.Hour
	}
	return &Cleanup{service: service, interval: interval, stop: make(chan struct{}), done: make(chan struct{})}
}

// Start runs the tick loop in the background until Stop is called. Sweeps
// once immediately too, so a short-lived process still gets one pass.
func (c *Cleanup) Start() {
	go c.loop()
}

// Stop signals the loop to exit and waits for it to finish.
func (c *Cleanup) Stop() {
	close(c.stop)
	<-c.done
}

func (c *Cleanup) loop() {
	defer close(c.done)
	c.service.purgeExpiredSessions(context.Background())

	ticker := time.NewTicker(c.interval)
	defer ticker.Stop()
	for {
		select {
		case <-c.stop:
			return
		case <-ticker.C:
			c.service.purgeExpiredSessions(context.Background())
		}
	}
}
