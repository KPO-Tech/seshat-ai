package iam

import (
	"context"
	"errors"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func TestRequireFreshAuthRejectsNilPrincipal(t *testing.T) {
	service := newTestService(t)
	if err := service.RequireFreshAuth(nil); err == nil {
		t.Fatal("expected an error for a nil principal")
	}
}

func TestRequireFreshAuthPassesJustAfterLogin(t *testing.T) {
	service, admin, _, _ := bootstrapWithMember(t, "member")
	if err := service.RequireFreshAuth(admin); err != nil {
		t.Fatalf("expected a just-created session to already count as fresh, got: %v", err)
	}
}

// backdateSessionFreshness simulates time passing on a session without
// actually sleeping in the test - directly rewrites ReauthenticatedAt to
// look older than stepUpFreshnessTTL.
func backdateSessionFreshness(t *testing.T, service *Service, sessionID string) {
	t.Helper()
	stale := time.Now().UTC().Add(-stepUpFreshnessTTL - time.Minute)
	if err := service.db.Gorm().Model(&sdb.Session{}).Where("id = ?", sessionID).Update("reauthenticated_at", stale).Error; err != nil {
		t.Fatalf("backdate session: %v", err)
	}
}

func TestRequireFreshAuthFailsForStaleSession(t *testing.T) {
	service, admin, _, _ := bootstrapWithMember(t, "member")
	// RequireFreshAuth only ever reads the in-memory Session already
	// attached to the Principal (see its own doc comment - no DB round
	// trip), so backdating that in-memory field directly is enough here;
	// no need to round-trip through the database or a raw session token.
	admin.Session.ReauthenticatedAt = time.Now().UTC().Add(-stepUpFreshnessTTL - time.Minute)

	err := service.RequireFreshAuth(admin)
	if err == nil {
		t.Fatal("expected a stale session to require step-up")
	}
	if !errors.Is(err, ErrStepUpRequired("")) {
		t.Fatalf("expected a step_up_required error, got: %v", err)
	}
}

func TestStepUpWithPasswordRejectsWrongPassword(t *testing.T) {
	service, admin, _, _ := bootstrapWithMember(t, "member")
	err := service.StepUpWithPassword(context.Background(), admin, StepUpParams{CurrentPassword: "not-the-password"})
	if err == nil {
		t.Fatal("expected an error for the wrong password")
	}
}

func TestStepUpWithPasswordRejectsMissingPassword(t *testing.T) {
	service, admin, _, _ := bootstrapWithMember(t, "member")
	if err := service.StepUpWithPassword(context.Background(), admin, StepUpParams{}); err == nil {
		t.Fatal("expected an error for an empty current_password")
	}
}

func TestStepUpWithPasswordRestoresFreshness(t *testing.T) {
	service, admin, _, _ := bootstrapWithMember(t, "member")
	backdateSessionFreshness(t, service, admin.Session.ID)

	if err := service.StepUpWithPassword(context.Background(), admin, StepUpParams{CurrentPassword: "password123"}); err != nil {
		t.Fatalf("step up with the correct password: %v", err)
	}

	var record sdb.Session
	if err := service.db.Gorm().First(&record, "id = ?", admin.Session.ID).Error; err != nil {
		t.Fatalf("reload session: %v", err)
	}
	if time.Since(record.ReauthenticatedAt) > time.Minute {
		t.Fatalf("expected reauthenticated_at to be freshly updated, got %v", record.ReauthenticatedAt)
	}

	principal := &Principal{User: admin.User, Session: Session{ID: admin.Session.ID, ReauthenticatedAt: record.ReauthenticatedAt}}
	if err := service.RequireFreshAuth(principal); err != nil {
		t.Fatalf("expected freshness to be restored after step-up, got: %v", err)
	}
}
