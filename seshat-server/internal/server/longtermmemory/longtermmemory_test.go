package longtermmemory

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

func TestUpsertEntitiesDeduplicatesByName(t *testing.T) {
	svc, _, principal := newTestEnv(t)

	created, err := svc.UpsertEntities(context.Background(), principal, []EntityInput{
		{Name: "Ada Lovelace", EntityType: "person", Observations: []string{"loves math"}},
	})
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if len(created) != 1 || created[0].Name != "Ada Lovelace" || len(created[0].Observations) != 1 {
		t.Fatalf("unexpected first upsert result: %+v", created)
	}

	// Upserting the same name again must be a no-op (skip, not update) —
	// matches the reference implementation's stated behavior.
	second, err := svc.UpsertEntities(context.Background(), principal, []EntityInput{
		{Name: "Ada Lovelace", EntityType: "person", Observations: []string{"different observation"}},
	})
	if err != nil {
		t.Fatalf("second upsert: %v", err)
	}
	if len(second) != 0 {
		t.Fatalf("expected no new entities created for an existing name, got %+v", second)
	}
}

func TestAddObservationsDeduplicatesContent(t *testing.T) {
	svc, _, principal := newTestEnv(t)

	if _, err := svc.UpsertEntities(context.Background(), principal, []EntityInput{
		{Name: "Go", EntityType: "language", Observations: []string{"is fast"}},
	}); err != nil {
		t.Fatalf("upsert: %v", err)
	}

	results, err := svc.AddObservations(context.Background(), principal, []ObservationInput{
		{EntityName: "Go", Contents: []string{"is fast", "has goroutines"}},
	})
	if err != nil {
		t.Fatalf("add observations: %v", err)
	}
	if len(results) != 1 || len(results[0].AddedObservations) != 1 || results[0].AddedObservations[0] != "has goroutines" {
		t.Fatalf("expected only the new, non-duplicate observation to be added, got %+v", results)
	}
}

func TestAddObservationsRejectsUnknownEntity(t *testing.T) {
	svc, _, principal := newTestEnv(t)
	if _, err := svc.AddObservations(context.Background(), principal, []ObservationInput{
		{EntityName: "does-not-exist", Contents: []string{"x"}},
	}); err == nil {
		t.Fatal("expected an error for an unknown entity name")
	}
}

func TestSearchNodesCaseInsensitiveSubstringMatch(t *testing.T) {
	svc, _, principal := newTestEnv(t)
	if _, err := svc.UpsertEntities(context.Background(), principal, []EntityInput{
		{Name: "Ada Lovelace", EntityType: "person", Observations: []string{"Pioneered computer programming"}},
		{Name: "Go", EntityType: "language", Observations: []string{"Compiled and fast"}},
	}); err != nil {
		t.Fatalf("upsert: %v", err)
	}

	graph, err := svc.SearchNodes(context.Background(), principal, "PROGRAMMING")
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(graph.Entities) != 1 || graph.Entities[0].Name != "Ada Lovelace" {
		t.Fatalf("expected a case-insensitive substring match on observation content, got %+v", graph.Entities)
	}

	graph, err = svc.SearchNodes(context.Background(), principal, "go")
	if err != nil {
		t.Fatalf("search go: %v", err)
	}
	if len(graph.Entities) != 1 || graph.Entities[0].Name != "Go" {
		t.Fatalf("expected a name match for 'go', got %+v", graph.Entities)
	}
}

func TestSearchNodesIsolatedPerUser(t *testing.T) {
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

	if _, err := svc.UpsertEntities(context.Background(), adminPrincipal, []EntityInput{{Name: "Admin's Secret", EntityType: "fact"}}); err != nil {
		t.Fatalf("upsert as admin: %v", err)
	}

	graph, err := svc.SearchNodes(context.Background(), otherPrincipal, "")
	if err != nil {
		t.Fatalf("search as other user: %v", err)
	}
	if len(graph.Entities) != 0 {
		t.Fatalf("expected the other user to see no entities, got %+v", graph.Entities)
	}
}

func TestRetrieveForContextFormatsAndTruncates(t *testing.T) {
	svc, _, principal := newTestEnv(t)
	if _, err := svc.UpsertEntities(context.Background(), principal, []EntityInput{
		{Name: "Ada Lovelace", EntityType: "person", Observations: []string{"Pioneered computer programming"}},
	}); err != nil {
		t.Fatalf("upsert: %v", err)
	}

	block, err := svc.RetrieveForContext(context.Background(), principal, "Ada", 500)
	if err != nil {
		t.Fatalf("retrieve: %v", err)
	}
	if block == "" {
		t.Fatal("expected a non-empty context block")
	}

	empty, err := svc.RetrieveForContext(context.Background(), principal, "no-such-thing-at-all", 500)
	if err != nil {
		t.Fatalf("retrieve no match: %v", err)
	}
	if empty != "" {
		t.Fatalf("expected an empty block for no matches, got %q", empty)
	}
}

func TestOpenNodesExactNameMatch(t *testing.T) {
	svc, _, principal := newTestEnv(t)
	if _, err := svc.UpsertEntities(context.Background(), principal, []EntityInput{
		{Name: "Ada Lovelace", EntityType: "person"},
		{Name: "Charles Babbage", EntityType: "person"},
	}); err != nil {
		t.Fatalf("upsert: %v", err)
	}

	graph, err := svc.OpenNodes(context.Background(), principal, []string{"Ada Lovelace"})
	if err != nil {
		t.Fatalf("open nodes: %v", err)
	}
	if len(graph.Entities) != 1 || graph.Entities[0].Name != "Ada Lovelace" {
		t.Fatalf("expected exactly Ada Lovelace, got %+v", graph.Entities)
	}
}

func TestUpsertEntitiesRequiresAuthentication(t *testing.T) {
	svc, _, _ := newTestEnv(t)
	if _, err := svc.UpsertEntities(context.Background(), nil, []EntityInput{{Name: "x"}}); err == nil {
		t.Fatal("expected an error without a principal")
	}
}
