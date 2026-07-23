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
	return New(database, iamService), iamService, principal
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

// newMember creates and logs in a plain "member" user in the given
// organization, returning their resolved principal.
func newMember(t *testing.T, iamService *iam.Service, adminPrincipal *iam.Principal, organizationID, email string) *iam.Principal {
	t.Helper()
	user, err := iamService.CreateUser(context.Background(), adminPrincipal, iam.CreateUserParams{
		Email: email, Password: "password123", DisplayName: "Member",
		OrganizationID: organizationID, Role: "member",
	})
	if err != nil {
		t.Fatalf("create member: %v", err)
	}
	login, err := iamService.Login(context.Background(), user.Email, "password123")
	if err != nil {
		t.Fatalf("login member: %v", err)
	}
	principal, err := iamService.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve member principal: %v", err)
	}
	return principal
}

func TestGetMyPreferencesFallsBackToOrganizationDefaults(t *testing.T) {
	svc, iamService, adminPrincipal := newTestEnv(t)
	orgs, _, err := iamService.ListOrganizations(context.Background(), adminPrincipal, sdb.ListParams{Sort: "name", Order: "asc", Limit: 10})
	if err != nil || len(orgs) == 0 {
		t.Fatalf("list organizations: %v (orgs=%d)", err, len(orgs))
	}
	orgID := orgs[0].ID

	if _, err := svc.UpsertOrganizationPreferences(context.Background(), adminPrincipal, orgID, UpsertOrganizationPreferencesParams{
		WorkingStyle: "org-working-style", AutomationPermissionMode: "never", MaxSubAgentDepth: 2,
	}); err != nil {
		t.Fatalf("upsert org preferences: %v", err)
	}

	member := newMember(t, iamService, adminPrincipal, orgID, "member1@example.com")
	prefs, err := svc.GetMyPreferences(context.Background(), member)
	if err != nil {
		t.Fatalf("get member preferences: %v", err)
	}
	if prefs.WorkingStyle != "org-working-style" || prefs.AutomationPermissionMode != "never" || prefs.MaxSubAgentDepth != 2 {
		t.Fatalf("expected member to inherit organization defaults, got %+v", prefs)
	}
}

func TestGetMyPreferencesPersonalValueWinsOverOrganizationDefault(t *testing.T) {
	svc, iamService, adminPrincipal := newTestEnv(t)
	orgs, _, err := iamService.ListOrganizations(context.Background(), adminPrincipal, sdb.ListParams{Sort: "name", Order: "asc", Limit: 10})
	if err != nil || len(orgs) == 0 {
		t.Fatalf("list organizations: %v (orgs=%d)", err, len(orgs))
	}
	orgID := orgs[0].ID

	if _, err := svc.UpsertOrganizationPreferences(context.Background(), adminPrincipal, orgID, UpsertOrganizationPreferencesParams{
		WorkingStyle: "org-working-style", ResponseStyle: "org-response-style",
	}); err != nil {
		t.Fatalf("upsert org preferences: %v", err)
	}

	member := newMember(t, iamService, adminPrincipal, orgID, "member2@example.com")
	if _, err := svc.UpsertMyPreferences(context.Background(), member, UpsertParams{ResponseStyle: "my-own-style"}); err != nil {
		t.Fatalf("upsert member preferences: %v", err)
	}

	prefs, err := svc.GetMyPreferences(context.Background(), member)
	if err != nil {
		t.Fatalf("get member preferences: %v", err)
	}
	if prefs.ResponseStyle != "my-own-style" {
		t.Fatalf("expected the member's own value to win, got %q", prefs.ResponseStyle)
	}
	if prefs.WorkingStyle != "org-working-style" {
		t.Fatalf("expected the org default to still fill the field the member left unset, got %q", prefs.WorkingStyle)
	}
}

func TestGetMyPreferencesFallsBackToPlatformDefaultOrganization(t *testing.T) {
	svc, iamService, adminPrincipal := newTestEnv(t)
	orgs, _, err := iamService.ListOrganizations(context.Background(), adminPrincipal, sdb.ListParams{Sort: "name", Order: "asc", Limit: 10})
	if err != nil || len(orgs) == 0 {
		t.Fatalf("list organizations: %v (orgs=%d)", err, len(orgs))
	}
	memberOrgID := orgs[0].ID

	// Super-admin callers skip the one-org-per-user membership attachment
	// entirely (see CreateOrganization), so this doesn't conflict with
	// adminPrincipal's existing bootstrap-org membership.
	platformOrg, err := iamService.CreateOrganization(context.Background(), adminPrincipal, iam.CreateOrganizationParams{
		Name: "Platform Default Org", Slug: "platform-default-org",
	})
	if err != nil {
		t.Fatalf("create platform default org: %v", err)
	}
	if _, err := iamService.SetOrganizationDefault(context.Background(), adminPrincipal, platformOrg.ID, true); err != nil {
		t.Fatalf("set organization default: %v", err)
	}
	if _, err := svc.UpsertOrganizationPreferences(context.Background(), adminPrincipal, platformOrg.ID, UpsertOrganizationPreferencesParams{
		ExtraContext: "platform-wide-context",
	}); err != nil {
		t.Fatalf("upsert platform org preferences: %v", err)
	}

	member := newMember(t, iamService, adminPrincipal, memberOrgID, "member3@example.com")
	prefs, err := svc.GetMyPreferences(context.Background(), member)
	if err != nil {
		t.Fatalf("get member preferences: %v", err)
	}
	if prefs.ExtraContext != "platform-wide-context" {
		t.Fatalf("expected the member to inherit the platform-default organization's preferences, got %+v", prefs)
	}
}

func TestOnlyOrganizationManagerCanSetOrganizationPreferences(t *testing.T) {
	svc, iamService, adminPrincipal := newTestEnv(t)
	orgs, _, err := iamService.ListOrganizations(context.Background(), adminPrincipal, sdb.ListParams{Sort: "name", Order: "asc", Limit: 10})
	if err != nil || len(orgs) == 0 {
		t.Fatalf("list organizations: %v (orgs=%d)", err, len(orgs))
	}
	orgID := orgs[0].ID

	member := newMember(t, iamService, adminPrincipal, orgID, "member4@example.com")
	if _, err := svc.UpsertOrganizationPreferences(context.Background(), member, orgID, UpsertOrganizationPreferencesParams{WorkingStyle: "sneaky"}); err == nil {
		t.Fatal("expected a plain member to be rejected from setting organization preferences")
	}
	if _, err := svc.GetOrganizationPreferences(context.Background(), member, orgID); err == nil {
		t.Fatal("expected a plain member to be rejected from reading organization preferences directly")
	}
}
