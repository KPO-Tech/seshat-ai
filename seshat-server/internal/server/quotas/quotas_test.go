package quotas

import (
	"context"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func newTestEnv(t *testing.T) (*Service, *iam.Service, *iam.Principal) {
	t.Helper()
	database, err := sdb.Open(sdb.Config{Driver: sdb.DriverSQLite, DSN: ":memory:"})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	iamService := iam.New(database, time.Hour)
	boot, err := iamService.Bootstrap(context.Background(), iam.BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	principal, err := iamService.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	return New(database), iamService, principal
}

func TestGetUsageEmptyBeforeAnyIncrement(t *testing.T) {
	svc, _, principal := newTestEnv(t)
	summary, err := svc.GetUsage(context.Background(), principal)
	if err != nil {
		t.Fatalf("get usage: %v", err)
	}
	if summary.UserID != principal.User.ID || len(summary.Entries) != 0 {
		t.Fatalf("expected no entries before any increment, got %+v", summary)
	}
}

func TestIncrementCreatesBothDayAndMonthBuckets(t *testing.T) {
	svc, _, principal := newTestEnv(t)
	if err := svc.Increment(context.Background(), principal, "queries", 1); err != nil {
		t.Fatalf("increment: %v", err)
	}
	summary, err := svc.GetUsage(context.Background(), principal)
	if err != nil {
		t.Fatalf("get usage: %v", err)
	}
	if len(summary.Entries) != 2 {
		t.Fatalf("expected one day entry and one month entry, got %+v", summary.Entries)
	}
	periods := map[string]bool{}
	for _, e := range summary.Entries {
		if e.Metric != "queries" || e.Count != 1 {
			t.Fatalf("unexpected entry: %+v", e)
		}
		periods[e.Period] = true
	}
	if !periods[PeriodDay] || !periods[PeriodMonth] {
		t.Fatalf("expected both day and month periods, got %+v", summary.Entries)
	}
}

func TestIncrementAccumulates(t *testing.T) {
	svc, _, principal := newTestEnv(t)
	for i := 0; i < 3; i++ {
		if err := svc.Increment(context.Background(), principal, "queries", 1); err != nil {
			t.Fatalf("increment %d: %v", i, err)
		}
	}
	summary, err := svc.GetUsage(context.Background(), principal)
	if err != nil {
		t.Fatalf("get usage: %v", err)
	}
	for _, e := range summary.Entries {
		if e.Count != 3 {
			t.Fatalf("expected count=3 after 3 increments, got %+v", e)
		}
	}
}

func TestIncrementDefaultsNonPositiveDeltaToOne(t *testing.T) {
	svc, _, principal := newTestEnv(t)
	if err := svc.Increment(context.Background(), principal, "files", 0); err != nil {
		t.Fatalf("increment: %v", err)
	}
	summary, err := svc.GetUsage(context.Background(), principal)
	if err != nil {
		t.Fatalf("get usage: %v", err)
	}
	if len(summary.Entries) != 2 || summary.Entries[0].Count != 1 {
		t.Fatalf("expected a delta of 0 to default to 1, got %+v", summary.Entries)
	}
}

func TestUsageIsIsolatedPerUser(t *testing.T) {
	svc, iamService, adminPrincipal := newTestEnv(t)

	orgs, _, err := iamService.ListOrganizations(context.Background(), adminPrincipal, sdb.ListParams{Sort: "name", Order: "asc", Limit: 10})
	if err != nil || len(orgs) == 0 {
		t.Fatalf("list organizations: %v (orgs=%d)", err, len(orgs))
	}
	otherUser, err := iamService.CreateUser(context.Background(), adminPrincipal, iam.CreateUserParams{
		Email: "other@example.com", Password: "password123", DisplayName: "Other",
		OrganizationID: orgs[0].ID, Role: "member",
	})
	if err != nil {
		t.Fatalf("create other user: %v", err)
	}
	login, err := iamService.Login(context.Background(), otherUser.Email, "password123")
	if err != nil {
		t.Fatalf("login other: %v", err)
	}
	otherPrincipal, err := iamService.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve other principal: %v", err)
	}

	if err := svc.Increment(context.Background(), adminPrincipal, "queries", 5); err != nil {
		t.Fatalf("increment as admin: %v", err)
	}

	otherSummary, err := svc.GetUsage(context.Background(), otherPrincipal)
	if err != nil {
		t.Fatalf("get usage as other user: %v", err)
	}
	if len(otherSummary.Entries) != 0 {
		t.Fatalf("expected the other user to see no usage of their own, got %+v", otherSummary.Entries)
	}
}

func TestGetUsageRequiresAuthentication(t *testing.T) {
	svc, _, _ := newTestEnv(t)
	if _, err := svc.GetUsage(context.Background(), nil); err == nil {
		t.Fatal("expected an error without a principal")
	}
}

func TestIncrementRequiresAuthentication(t *testing.T) {
	svc, _, _ := newTestEnv(t)
	if err := svc.Increment(context.Background(), nil, "queries", 1); err == nil {
		t.Fatal("expected an error without a principal")
	}
}

func TestIncrementRequiresMetric(t *testing.T) {
	svc, _, principal := newTestEnv(t)
	if err := svc.Increment(context.Background(), principal, "", 1); err == nil {
		t.Fatal("expected an error for an empty metric")
	}
}
