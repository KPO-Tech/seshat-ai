package memories

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

func TestListEmptyBeforeAnyCreate(t *testing.T) {
	svc, _, principal := newTestEnv(t)
	rows, err := svc.List(context.Background(), principal)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("expected no memories yet, got %+v", rows)
	}
}

func TestCreateRequiresKey(t *testing.T) {
	svc, _, principal := newTestEnv(t)
	if _, err := svc.Create(context.Background(), principal, CreateParams{Value: "no key"}); err == nil {
		t.Fatal("expected an error when key is empty")
	}
}

func TestCreateListUpdateDeleteRoundTrip(t *testing.T) {
	svc, _, principal := newTestEnv(t)

	created, err := svc.Create(context.Background(), principal, CreateParams{
		Type: "fact", Key: "favorite_language", Value: "Go", Importance: 0.8, Source: "chat",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if created.Type != "fact" || created.Key != "favorite_language" || created.Importance != 0.8 {
		t.Fatalf("unexpected created memory: %+v", created)
	}

	rows, err := svc.List(context.Background(), principal)
	if err != nil || len(rows) != 1 {
		t.Fatalf("list after create: %v %+v", err, rows)
	}

	newValue := "Golang"
	updated, err := svc.Update(context.Background(), principal, created.ID, UpdateParams{Value: &newValue})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Value != "Golang" || updated.Key != "favorite_language" {
		t.Fatalf("unexpected updated memory: %+v", updated)
	}

	if err := svc.Delete(context.Background(), principal, created.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	rows, err = svc.List(context.Background(), principal)
	if err != nil || len(rows) != 0 {
		t.Fatalf("expected no memories after delete, got %v %+v", err, rows)
	}
}

func TestDeleteAllRemovesOnlyCallersMemories(t *testing.T) {
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

	if _, err := svc.Create(context.Background(), adminPrincipal, CreateParams{Key: "admin-memory", Value: "x"}); err != nil {
		t.Fatalf("create as admin: %v", err)
	}
	if _, err := svc.Create(context.Background(), otherPrincipal, CreateParams{Key: "other-memory", Value: "y"}); err != nil {
		t.Fatalf("create as other: %v", err)
	}

	n, err := svc.DeleteAll(context.Background(), adminPrincipal)
	if err != nil {
		t.Fatalf("delete all as admin: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected exactly 1 deleted (admin's own), got %d", n)
	}

	otherRows, err := svc.List(context.Background(), otherPrincipal)
	if err != nil || len(otherRows) != 1 {
		t.Fatalf("expected the other user's memory to survive, got %v %+v", err, otherRows)
	}
}

func TestUpdateRejectsOtherUsersMemory(t *testing.T) {
	svc, iamService, adminPrincipal := newTestEnv(t)

	orgs, _, err := iamService.ListOrganizations(context.Background(), adminPrincipal, sdb.ListParams{Sort: "name", Order: "asc", Limit: 10})
	if err != nil || len(orgs) == 0 {
		t.Fatalf("list organizations: %v (orgs=%d)", err, len(orgs))
	}
	otherUser, err := iamService.CreateUser(context.Background(), adminPrincipal, iam.CreateUserParams{
		Email: "other2@example.com", Password: "password123", DisplayName: "Other",
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

	created, err := svc.Create(context.Background(), adminPrincipal, CreateParams{Key: "secret", Value: "x"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	newValue := "tampered"
	if _, err := svc.Update(context.Background(), otherPrincipal, created.ID, UpdateParams{Value: &newValue}); err == nil {
		t.Fatal("expected the other user's update attempt to be rejected as not found")
	}
}

func TestListRequiresAuthentication(t *testing.T) {
	svc, _, _ := newTestEnv(t)
	if _, err := svc.List(context.Background(), nil); err == nil {
		t.Fatal("expected an error without a principal")
	}
}
