package scim

import (
	"context"
	"testing"
)

func testConnection(t *testing.T, env testEnv) *Connection {
	t.Helper()
	created, err := env.scim.CreateConnection(context.Background(), env.adminPrincipal, CreateConnectionParams{
		OrganizationID: env.orgID, Name: "Okta",
	})
	if err != nil {
		t.Fatalf("create connection: %v", err)
	}
	return &created.Connection
}

func TestCreateScimUserProvisionsAnActiveMember(t *testing.T) {
	env := newTestEnv(t)
	connection := testConnection(t, env)

	resource, err := env.scim.CreateScimUser(context.Background(), connection, CreateUserRequest{
		UserName: "alice@example.com", DisplayName: "Alice", Active: true, ExternalID: "idp-1",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if !resource.Active || resource.UserName != "alice@example.com" || resource.ExternalID != "idp-1" {
		t.Fatalf("unexpected resource: %+v", resource)
	}
	if resource.ID == "" {
		t.Fatal("expected a resource id")
	}
}

func TestCreateScimUserFallsBackToEmailsWhenUserNameIsEmpty(t *testing.T) {
	env := newTestEnv(t)
	connection := testConnection(t, env)

	resource, err := env.scim.CreateScimUser(context.Background(), connection, CreateUserRequest{
		Emails: []ScimEmail{{Value: "bob@example.com", Primary: true}}, Active: true,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if resource.UserName != "bob@example.com" {
		t.Fatalf("expected the primary email to be used as userName, got %q", resource.UserName)
	}
}

func TestGetScimUserRoundTripsAfterCreate(t *testing.T) {
	env := newTestEnv(t)
	connection := testConnection(t, env)

	created, err := env.scim.CreateScimUser(context.Background(), connection, CreateUserRequest{
		UserName: "alice@example.com", DisplayName: "Alice", Active: true,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	fetched, err := env.scim.GetScimUser(context.Background(), connection, created.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if fetched.UserName != "alice@example.com" || !fetched.Active {
		t.Fatalf("unexpected fetched resource: %+v", fetched)
	}
}

func TestPatchScimUserActiveFalseDeactivatesAndTrueReactivates(t *testing.T) {
	env := newTestEnv(t)
	connection := testConnection(t, env)

	created, err := env.scim.CreateScimUser(context.Background(), connection, CreateUserRequest{
		UserName: "alice@example.com", DisplayName: "Alice", Active: true,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	deactivated, err := env.scim.PatchScimUser(context.Background(), connection, created.ID, []PatchOperation{
		{Op: "replace", Path: "active", Value: false},
	})
	if err != nil {
		t.Fatalf("patch deactivate: %v", err)
	}
	if deactivated.Active {
		t.Fatal("expected active:false to deactivate the user")
	}

	reactivated, err := env.scim.PatchScimUser(context.Background(), connection, created.ID, []PatchOperation{
		{Op: "replace", Value: map[string]any{"active": true}},
	})
	if err != nil {
		t.Fatalf("patch reactivate (object form): %v", err)
	}
	if !reactivated.Active {
		t.Fatal("expected the object-form replace to reactivate the user")
	}
}

func TestPatchScimUserReplaceDisplayName(t *testing.T) {
	env := newTestEnv(t)
	connection := testConnection(t, env)

	created, err := env.scim.CreateScimUser(context.Background(), connection, CreateUserRequest{
		UserName: "alice@example.com", DisplayName: "Alice", Active: true,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	updated, err := env.scim.PatchScimUser(context.Background(), connection, created.ID, []PatchOperation{
		{Op: "replace", Path: "displayName", Value: "Alice Renamed"},
	})
	if err != nil {
		t.Fatalf("patch: %v", err)
	}
	if updated.DisplayName != "Alice Renamed" {
		t.Fatalf("expected displayName to be updated, got %q", updated.DisplayName)
	}
	// active must be unaffected by a displayName-only patch.
	if !updated.Active {
		t.Fatal("expected active to remain true when only displayName is patched")
	}
}

func TestDeactivateScimUserBlocksTheMembership(t *testing.T) {
	env := newTestEnv(t)
	connection := testConnection(t, env)

	created, err := env.scim.CreateScimUser(context.Background(), connection, CreateUserRequest{
		UserName: "alice@example.com", DisplayName: "Alice", Active: true,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := env.scim.DeactivateScimUser(context.Background(), connection, created.ID); err != nil {
		t.Fatalf("deactivate: %v", err)
	}
	fetched, err := env.scim.GetScimUser(context.Background(), connection, created.ID)
	if err != nil {
		t.Fatalf("get after deactivate: %v", err)
	}
	if fetched.Active {
		t.Fatal("expected DELETE to deactivate rather than remove the resource")
	}
}

func TestListScimUsersPaginatesAndFilters(t *testing.T) {
	env := newTestEnv(t)
	connection := testConnection(t, env)

	for _, email := range []string{"alice@example.com", "bob@example.com"} {
		if _, err := env.scim.CreateScimUser(context.Background(), connection, CreateUserRequest{
			UserName: email, DisplayName: email, Active: true,
		}); err != nil {
			t.Fatalf("create %s: %v", email, err)
		}
	}

	// Unfiltered list includes the admin bootstrap user too (3 total).
	resources, total, err := env.scim.ListScimUsers(context.Background(), connection, 1, 100, "")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 3 || len(resources) != 3 {
		t.Fatalf("expected 3 total members, got total=%d len=%d", total, len(resources))
	}

	filtered, filteredTotal, err := env.scim.ListScimUsers(context.Background(), connection, 1, 100, `userName eq "alice@example.com"`)
	if err != nil {
		t.Fatalf("filtered list: %v", err)
	}
	if filteredTotal != 1 || len(filtered) != 1 || filtered[0].UserName != "alice@example.com" {
		t.Fatalf("unexpected filtered result: total=%d resources=%+v", filteredTotal, filtered)
	}

	noMatch, noMatchTotal, err := env.scim.ListScimUsers(context.Background(), connection, 1, 100, `emails.value eq "nobody@example.com"`)
	if err != nil {
		t.Fatalf("no-match filtered list: %v", err)
	}
	if noMatchTotal != 0 || len(noMatch) != 0 {
		t.Fatalf("expected an empty list for a filter with no match, got %+v", noMatch)
	}

	if _, _, err := env.scim.ListScimUsers(context.Background(), connection, 1, 100, `id eq "usr_x"`); err != ErrUnsupportedFilter {
		t.Fatalf("expected ErrUnsupportedFilter for an unsupported attribute, got: %v", err)
	}
}

func TestScimSyncEventsAreRecordedForUserOperations(t *testing.T) {
	env := newTestEnv(t)
	connection := testConnection(t, env)

	created, err := env.scim.CreateScimUser(context.Background(), connection, CreateUserRequest{
		UserName: "alice@example.com", DisplayName: "Alice", Active: true,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := env.scim.CreateScimUser(context.Background(), connection, CreateUserRequest{
		UserName: "alice@example.com", DisplayName: "Alice Dup", Active: true,
	}); err == nil {
		t.Fatal("expected a duplicate-email create to fail")
	}

	var events []struct {
		Operation string
		Success   bool
	}
	if err := env.db.Gorm().Table("scim_sync_events").Select("operation, success").
		Where("scim_connection_id = ?", connection.ID).Find(&events).Error; err != nil {
		t.Fatalf("query sync events: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("expected 2 recorded sync events (1 success, 1 failure), got %d: %+v", len(events), events)
	}
	successCount, failureCount := 0, 0
	for _, e := range events {
		if e.Success {
			successCount++
		} else {
			failureCount++
		}
	}
	if successCount != 1 || failureCount != 1 {
		t.Fatalf("expected exactly one success and one failure event, got success=%d failure=%d", successCount, failureCount)
	}
	_ = created
}
