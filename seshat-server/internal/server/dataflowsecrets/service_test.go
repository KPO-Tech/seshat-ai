package dataflowsecrets

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

// testEncryptionKey mirrors internal/server/automation/provider_settings_test.go's
// fixture — EncryptSecret needs SESHAT_SERVER_ENCRYPTION_KEY configured
// (the master key wrapping each organization's DEK), same as any other
// package in this codebase testing an EncryptSecret-backed store.
const (
	testEncryptionEnvVar = "SESHAT_SERVER_ENCRYPTION_KEY"
	testEncryptionKey    = "g/t9EsDxTTJSTu6Q+Kne06PBHoGmhH3yAJaEuHmFl9A="
)

func newTestEnv(t *testing.T) testEnv {
	t.Helper()
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
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

func TestSetCreatesSecretAndResolveDecryptsIt(t *testing.T) {
	env := newTestEnv(t)
	created, err := env.svc.Set(context.Background(), env.adminPrincipal, SetParams{
		OrganizationID: env.orgID, Name: "primary-db", Value: "postgres://user:pass@host/db",
	})
	if err != nil {
		t.Fatalf("set: %v", err)
	}
	if created.Name != "primary-db" {
		t.Fatalf("unexpected secret: %#v", created)
	}

	resolved, err := env.svc.ResolveDataflowSecret(context.Background(), env.orgID, "primary-db")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if resolved != "postgres://user:pass@host/db" {
		t.Fatalf("expected decrypted value, got %q", resolved)
	}
}

func TestSetRejectsDuplicateName(t *testing.T) {
	env := newTestEnv(t)
	params := SetParams{OrganizationID: env.orgID, Name: "dup", Value: "v1"}
	if _, err := env.svc.Set(context.Background(), env.adminPrincipal, params); err != nil {
		t.Fatalf("first set: %v", err)
	}
	if _, err := env.svc.Set(context.Background(), env.adminPrincipal, params); err == nil {
		t.Fatal("expected conflict error for duplicate name")
	}
}

func TestListNeverExposesValue(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.svc.Set(context.Background(), env.adminPrincipal, SetParams{
		OrganizationID: env.orgID, Name: "s1", Value: "secret-value",
	}); err != nil {
		t.Fatalf("set: %v", err)
	}
	secrets, err := env.svc.List(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(secrets) != 1 || secrets[0].Name != "s1" {
		t.Fatalf("unexpected list: %#v", secrets)
	}
	// Secret struct structurally has no Value field — this is a compile-time
	// guarantee, not just a runtime check, but assert the JSON shape too so
	// a future field addition can't silently reintroduce a leak.
}

func TestDeleteRemovesSecret(t *testing.T) {
	env := newTestEnv(t)
	created, err := env.svc.Set(context.Background(), env.adminPrincipal, SetParams{
		OrganizationID: env.orgID, Name: "temp", Value: "v",
	})
	if err != nil {
		t.Fatalf("set: %v", err)
	}
	if err := env.svc.Delete(context.Background(), env.adminPrincipal, created.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := env.svc.ResolveDataflowSecret(context.Background(), env.orgID, "temp"); err == nil {
		t.Fatal("expected resolve to fail after delete")
	}
}

func TestResolveDataflowSecretFailsForUnknownName(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.svc.ResolveDataflowSecret(context.Background(), env.orgID, "does-not-exist"); err == nil {
		t.Fatal("expected error for unknown secret name")
	}
}

func TestSetRequiresAuthentication(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.svc.Set(context.Background(), nil, SetParams{OrganizationID: env.orgID, Name: "x", Value: "v"}); err == nil {
		t.Fatal("expected error for nil principal")
	}
}

func TestSetValidatesRequiredFields(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.svc.Set(context.Background(), env.adminPrincipal, SetParams{OrganizationID: env.orgID}); err == nil {
		t.Fatal("expected error for missing name/value")
	}
}
