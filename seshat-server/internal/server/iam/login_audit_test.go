package iam

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func TestLoginSuccessAndFailureAreAudited(t *testing.T) {
	service := newLifecycleService(t)

	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	adminPrincipal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	orgID := boot.Organizations[0].ID

	if _, err := service.Login(context.Background(), "admin@example.com", "password123"); err != nil {
		t.Fatalf("expected login to succeed: %v", err)
	}
	if _, err := service.Login(context.Background(), "admin@example.com", "wrong-password"); err == nil {
		t.Fatal("expected wrong password login to fail")
	}
	if _, err := service.Login(context.Background(), "nobody@example.com", "password123"); err == nil {
		t.Fatal("expected unknown email login to fail")
	}

	succeeded, _, err := service.ListAuditEvents(context.Background(), adminPrincipal, ListAuditEventsParams{
		OrganizationID: orgID,
		Action:         "login.succeeded",
	}, sdb.ListParams{Sort: "created_at", Order: "desc", Limit: 200})
	if err != nil {
		t.Fatalf("list login.succeeded events: %v", err)
	}
	if len(succeeded) != 1 {
		t.Fatalf("expected one login.succeeded event, got %d", len(succeeded))
	}

	failedForKnownUser, _, err := service.ListAuditEvents(context.Background(), adminPrincipal, ListAuditEventsParams{
		OrganizationID: orgID,
		Action:         "login.failed",
	}, sdb.ListParams{Sort: "created_at", Order: "desc", Limit: 200})
	if err != nil {
		t.Fatalf("list login.failed events: %v", err)
	}
	if len(failedForKnownUser) != 1 {
		t.Fatalf("expected one login.failed event scoped to the admin's organization, got %d", len(failedForKnownUser))
	}

	// The unknown-email attempt has no organization to scope to, so only a
	// platform admin querying without an organization filter can see it.
	allFailed, _, err := service.ListAuditEvents(context.Background(), adminPrincipal, ListAuditEventsParams{Action: "login.failed"}, sdb.ListParams{Sort: "created_at", Order: "desc", Limit: 200})
	if err != nil {
		t.Fatalf("list all login.failed events: %v", err)
	}
	if len(allFailed) != 2 {
		t.Fatalf("expected two login.failed events in total, got %d", len(allFailed))
	}
}
