package dataflowvariables

import (
	"context"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

type testEnv struct {
	svc            *Service
	iam            *iam.Service
	adminPrincipal *iam.Principal
	orgID          string
}

func newTestEnv(t *testing.T) testEnv {
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
	svc := New(database, iamService)

	boot, err := iamService.Bootstrap(context.Background(), iam.BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	principal, err := iamService.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve admin principal: %v", err)
	}

	return testEnv{svc: svc, iam: iamService, adminPrincipal: principal, orgID: boot.Organizations[0].ID}
}

func TestSetCreatesVariableAndListReturnsItsValue(t *testing.T) {
	env := newTestEnv(t)
	created, err := env.svc.Set(context.Background(), env.adminPrincipal, SetParams{
		OrganizationID: env.orgID, Name: "API_BASE", Value: "https://api.example.com",
	})
	if err != nil {
		t.Fatalf("set: %v", err)
	}
	if created.Name != "API_BASE" || created.Value != "https://api.example.com" {
		t.Fatalf("unexpected variable: %#v", created)
	}

	variables, err := env.svc.List(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(variables) != 1 || variables[0].Name != "API_BASE" || variables[0].Value != "https://api.example.com" {
		t.Fatalf("expected List to include the real value (unlike dataflowsecrets), got %#v", variables)
	}
}

func TestSetRejectsDuplicateName(t *testing.T) {
	env := newTestEnv(t)
	params := SetParams{OrganizationID: env.orgID, Name: "DUP", Value: "v1"}
	if _, err := env.svc.Set(context.Background(), env.adminPrincipal, params); err != nil {
		t.Fatalf("first set: %v", err)
	}
	if _, err := env.svc.Set(context.Background(), env.adminPrincipal, params); err == nil {
		t.Fatal("expected conflict error for duplicate name")
	}
}

func TestSetValidatesRequiredFields(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.svc.Set(context.Background(), env.adminPrincipal, SetParams{OrganizationID: env.orgID}); err == nil {
		t.Fatal("expected error for missing name/value")
	}
}

func TestSetRejectsAnInvalidJSIdentifierName(t *testing.T) {
	env := newTestEnv(t)
	cases := []string{"has space", "1LEADING_DIGIT", "has-dash", ""}
	for _, name := range cases {
		if _, err := env.svc.Set(context.Background(), env.adminPrincipal, SetParams{
			OrganizationID: env.orgID, Name: name, Value: "v",
		}); err == nil {
			t.Fatalf("expected %q to be rejected as an invalid $vars property name", name)
		}
	}
}

func TestSetRequiresAuthentication(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.svc.Set(context.Background(), nil, SetParams{OrganizationID: env.orgID, Name: "X", Value: "v"}); err == nil {
		t.Fatal("expected error for nil principal")
	}
}

// TestUpdateChangesNameAndValue is the real difference from dataflowsecrets
// (delete+recreate only) - a settings page's values change over time.
func TestUpdateChangesNameAndValue(t *testing.T) {
	env := newTestEnv(t)
	created, err := env.svc.Set(context.Background(), env.adminPrincipal, SetParams{
		OrganizationID: env.orgID, Name: "OLD_NAME", Value: "old",
	})
	if err != nil {
		t.Fatalf("set: %v", err)
	}
	updated, err := env.svc.Update(context.Background(), env.adminPrincipal, created.ID, UpdateParams{Name: "NEW_NAME", Value: "new"})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Name != "NEW_NAME" || updated.Value != "new" {
		t.Fatalf("unexpected updated variable: %#v", updated)
	}
}

func TestUpdateRejectsRenamingToAnExistingName(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.svc.Set(context.Background(), env.adminPrincipal, SetParams{OrganizationID: env.orgID, Name: "TAKEN", Value: "v"}); err != nil {
		t.Fatalf("set taken: %v", err)
	}
	created, err := env.svc.Set(context.Background(), env.adminPrincipal, SetParams{OrganizationID: env.orgID, Name: "FREE", Value: "v"})
	if err != nil {
		t.Fatalf("set free: %v", err)
	}
	if _, err := env.svc.Update(context.Background(), env.adminPrincipal, created.ID, UpdateParams{Name: "TAKEN", Value: "v2"}); err == nil {
		t.Fatal("expected conflict error when renaming onto an existing name")
	}
}

func TestUpdateFailsForUnknownID(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.svc.Update(context.Background(), env.adminPrincipal, "nope", UpdateParams{Name: "X", Value: "v"}); err == nil {
		t.Fatal("expected not-found error for unknown id")
	}
}

func TestDeleteRemovesVariable(t *testing.T) {
	env := newTestEnv(t)
	created, err := env.svc.Set(context.Background(), env.adminPrincipal, SetParams{
		OrganizationID: env.orgID, Name: "TEMP", Value: "v",
	})
	if err != nil {
		t.Fatalf("set: %v", err)
	}
	if err := env.svc.Delete(context.Background(), env.adminPrincipal, created.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	variables, err := env.svc.List(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(variables) != 0 {
		t.Fatalf("expected no variables after delete, got %#v", variables)
	}
}

// TestResolveAllReturnsEveryVariableAsAPlainMap is what feeds
// automation.DataflowVariableResolver / pkg/dataflow's Runtime.Vars - the
// whole set, resolved eagerly, unlike dataflowsecrets' lazy per-name
// resolve (see the doc comment on ResolveAll).
func TestResolveAllReturnsEveryVariableAsAPlainMap(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.svc.Set(context.Background(), env.adminPrincipal, SetParams{OrganizationID: env.orgID, Name: "A", Value: "1"}); err != nil {
		t.Fatalf("set A: %v", err)
	}
	if _, err := env.svc.Set(context.Background(), env.adminPrincipal, SetParams{OrganizationID: env.orgID, Name: "B", Value: "2"}); err != nil {
		t.Fatalf("set B: %v", err)
	}
	vars, err := env.svc.ResolveAll(context.Background(), env.orgID)
	if err != nil {
		t.Fatalf("resolve all: %v", err)
	}
	if vars["A"] != "1" || vars["B"] != "2" || len(vars) != 2 {
		t.Fatalf("unexpected resolved vars: %#v", vars)
	}
}

func TestResolveAllReturnsEmptyMapForAnOrganizationWithNoVariables(t *testing.T) {
	env := newTestEnv(t)
	vars, err := env.svc.ResolveAll(context.Background(), env.orgID)
	if err != nil {
		t.Fatalf("resolve all: %v", err)
	}
	if len(vars) != 0 {
		t.Fatalf("expected an empty map, got %#v", vars)
	}
}
