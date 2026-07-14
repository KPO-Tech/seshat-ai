package preferences

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

func TestGetMyPreferencesDefaultsBeforeAnyUpsert(t *testing.T) {
	svc, _, principal := newTestEnv(t)

	prefs, err := svc.GetMyPreferences(context.Background(), principal)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if prefs.UserID != principal.User.ID || prefs.PreferredName != "" {
		t.Fatalf("expected zero-value defaults, got %+v", prefs)
	}
}

func TestUpsertMyPreferencesRoundTrips(t *testing.T) {
	svc, _, principal := newTestEnv(t)

	saved, err := svc.UpsertMyPreferences(context.Background(), principal, UpsertParams{
		PreferredName: "Ada", ResponseStyle: "concise", MaxSubAgentDepth: 3,
	})
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if saved.PreferredName != "Ada" || saved.MaxSubAgentDepth != 3 {
		t.Fatalf("unexpected saved preferences: %+v", saved)
	}

	fetched, err := svc.GetMyPreferences(context.Background(), principal)
	if err != nil {
		t.Fatalf("get after upsert: %v", err)
	}
	if fetched.PreferredName != "Ada" || fetched.ResponseStyle != "concise" || fetched.MaxSubAgentDepth != 3 {
		t.Fatalf("round-trip mismatch: %+v", fetched)
	}

	// A second upsert must replace, not duplicate — one row per user.
	if _, err := svc.UpsertMyPreferences(context.Background(), principal, UpsertParams{PreferredName: "Ada Lovelace"}); err != nil {
		t.Fatalf("second upsert: %v", err)
	}
	refetched, err := svc.GetMyPreferences(context.Background(), principal)
	if err != nil {
		t.Fatalf("get after second upsert: %v", err)
	}
	if refetched.PreferredName != "Ada Lovelace" {
		t.Fatalf("expected the second upsert to replace the first, got %+v", refetched)
	}
}

func TestPreferencesAreIsolatedPerUser(t *testing.T) {
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

	if _, err := svc.UpsertMyPreferences(context.Background(), adminPrincipal, UpsertParams{PreferredName: "Admin Name"}); err != nil {
		t.Fatalf("upsert as admin: %v", err)
	}

	otherPrefs, err := svc.GetMyPreferences(context.Background(), otherPrincipal)
	if err != nil {
		t.Fatalf("get as other user: %v", err)
	}
	if otherPrefs.PreferredName != "" {
		t.Fatalf("expected the other user to see no preferences of their own, got %+v", otherPrefs)
	}
}

func TestGetMyPreferencesRequiresAuthentication(t *testing.T) {
	svc, _, _ := newTestEnv(t)
	if _, err := svc.GetMyPreferences(context.Background(), nil); err == nil {
		t.Fatal("expected an error without a principal")
	}
}
