package iam

import (
	"context"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// newTestService opens a throwaway in-memory SQLite database, migrates it,
// and returns a Service backed by it. Every iam test exercises the real
// GORM/SQL path rather than a mock, since that's the code that actually
// needs coverage now that the control plane runs on SQL; in-memory keeps
// that realism without the disk I/O cost of a temp-file database per test.
func newTestService(t *testing.T) *Service {
	t.Helper()
	t.Setenv("SESHAT_SERVER_ENCRYPTION_KEY", "g/t9EsDxTTJSTu6Q+Kne06PBHoGmhH3yAJaEuHmFl9A=")
	database, err := sdb.Open(sdb.Config{Driver: sdb.DriverSQLite, DSN: ":memory:"})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	return New(database, time.Hour)
}

// bootstrapWithMember spins up a fresh service, bootstraps the platform
// admin/owner, and attaches a second user to the same organization under the
// given role (e.g. "member" or "viewer"). It returns both principals plus the
// organization id, for tests that assert a lower-privileged role is denied
// an action the owner/admin is allowed to perform.
func bootstrapWithMember(t *testing.T, role string) (service *Service, adminPrincipal *Principal, memberPrincipal *Principal, organizationID string) {
	t.Helper()
	service = newTestService(t)

	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email:            "admin@example.com",
		Password:         "password123",
		DisplayName:      "Admin",
		OrganizationName: "Seshat",
		OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	adminPrincipal, err = service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve admin principal: %v", err)
	}
	organizationID = boot.Organizations[0].ID

	email := role + "@example.com"
	member, err := service.CreateUser(context.Background(), adminPrincipal, CreateUserParams{
		Email:          email,
		Password:       "password123",
		DisplayName:    role,
		OrganizationID: organizationID,
		Role:           role,
	})
	if err != nil {
		t.Fatalf("create %s user: %v", role, err)
	}
	login, err := service.Login(context.Background(), member.Email, "password123")
	if err != nil {
		t.Fatalf("login %s: %v", role, err)
	}
	memberPrincipal, err = service.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve %s principal: %v", role, err)
	}
	return service, adminPrincipal, memberPrincipal, organizationID
}
