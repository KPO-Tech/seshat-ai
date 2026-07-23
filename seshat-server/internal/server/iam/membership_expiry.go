package iam

import (
	"context"
	"log"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// BlockExpiredPendingMemberships bulk-blocks every "pending" membership
// (see Register) whose PendingSince is older than window and was never
// confirmed by an org admin (see ConfirmMembership). Best-effort - logs and
// returns its own error rather than being wrapped, matching
// workspacechat.Service's purgeExpiredSessions.
func (s *Service) BlockExpiredPendingMemberships(ctx context.Context, window time.Duration) error {
	cutoff := time.Now().UTC().Add(-window)
	return s.db.Gorm().WithContext(ctx).
		Model(&sdb.Membership{}).
		Where("status = ? AND pending_since <= ?", "pending", cutoff).
		Updates(map[string]any{"status": "blocked"}).Error
}

// MembershipExpiry periodically blocks pending memberships past their
// confirmation window. Same Start/Stop/loop shape as
// workspacechat.Cleanup - single-instance only, a sweep every interval plus
// one immediate pass so a short-lived process still gets one sweep.
type MembershipExpiry struct {
	service  *Service
	window   time.Duration
	interval time.Duration
	stop     chan struct{}
	done     chan struct{}
}

func NewMembershipExpiry(service *Service, window, interval time.Duration) *MembershipExpiry {
	if interval <= 0 {
		interval = time.Hour
	}
	return &MembershipExpiry{service: service, window: window, interval: interval, stop: make(chan struct{}), done: make(chan struct{})}
}

func (m *MembershipExpiry) Start() {
	go m.loop()
}

func (m *MembershipExpiry) Stop() {
	close(m.stop)
	<-m.done
}

func (m *MembershipExpiry) loop() {
	defer close(m.done)
	m.sweep()

	ticker := time.NewTicker(m.interval)
	defer ticker.Stop()
	for {
		select {
		case <-m.stop:
			return
		case <-ticker.C:
			m.sweep()
		}
	}
}

func (m *MembershipExpiry) sweep() {
	if err := m.service.BlockExpiredPendingMemberships(context.Background(), m.window); err != nil {
		log.Printf("[iam] membership expiry sweep failed: %v", err)
	}
}
