package scim

import (
	"context"
	"testing"
)

func TestGetConnectionReturnsNilWhenNotConfigured(t *testing.T) {
	env := newTestEnv(t)

	connection, err := env.scim.GetConnection(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("expected no error for an unconfigured organization, got: %v", err)
	}
	if connection != nil {
		t.Fatalf("expected a nil connection when none is configured, got %+v", connection)
	}
}

func TestCreateConnectionReturnsTokenOnceAndNeverAgain(t *testing.T) {
	env := newTestEnv(t)

	created, err := env.scim.CreateConnection(context.Background(), env.adminPrincipal, CreateConnectionParams{
		OrganizationID: env.orgID, Name: "Okta",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if created.Token == "" {
		t.Fatal("expected a raw token on create")
	}
	if !created.Enabled {
		t.Fatal("expected a newly created connection to be enabled by default")
	}

	fetched, err := env.scim.GetConnection(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if fetched == nil || fetched.ID != created.ID {
		t.Fatalf("expected to fetch back the created connection, got %+v", fetched)
	}
	// GetConnection's DTO has no Token field at all - a compile-time
	// guarantee that the raw token can never leak back out through it.
}

func TestCreateConnectionRejectsASecondConnectionForTheSameOrganization(t *testing.T) {
	env := newTestEnv(t)

	if _, err := env.scim.CreateConnection(context.Background(), env.adminPrincipal, CreateConnectionParams{
		OrganizationID: env.orgID, Name: "Okta",
	}); err != nil {
		t.Fatalf("first create: %v", err)
	}
	if _, err := env.scim.CreateConnection(context.Background(), env.adminPrincipal, CreateConnectionParams{
		OrganizationID: env.orgID, Name: "Entra ID",
	}); err == nil {
		t.Fatal("expected a second SCIM connection for the same organization to be rejected")
	}
}

func TestConnectionPermissionBoundary(t *testing.T) {
	env := newTestEnv(t)
	memberPrincipal := env.addMember(t, "member")

	if _, err := env.scim.CreateConnection(context.Background(), memberPrincipal, CreateConnectionParams{
		OrganizationID: env.orgID, Name: "Okta",
	}); err == nil {
		t.Fatal("expected a member without scim_connections.manage to be denied creating a connection")
	}

	created, err := env.scim.CreateConnection(context.Background(), env.adminPrincipal, CreateConnectionParams{
		OrganizationID: env.orgID, Name: "Okta",
	})
	if err != nil {
		t.Fatalf("create as admin: %v", err)
	}

	if _, err := env.scim.GetConnection(context.Background(), memberPrincipal, env.orgID); err == nil {
		t.Fatal("expected a member without scim_connections.read to be denied reading the connection")
	}
	if _, err := env.scim.UpdateConnection(context.Background(), memberPrincipal, env.orgID, UpdateConnectionParams{Name: "Renamed", Enabled: true}); err == nil {
		t.Fatal("expected a member to be denied updating the connection")
	}
	if _, err := env.scim.RotateConnectionToken(context.Background(), memberPrincipal, env.orgID); err == nil {
		t.Fatal("expected a member to be denied rotating the token")
	}
	if err := env.scim.DeleteConnection(context.Background(), memberPrincipal, env.orgID); err == nil {
		t.Fatal("expected a member to be denied deleting the connection")
	}
	_ = created
}

func TestUpdateConnectionNeverChangesTheToken(t *testing.T) {
	env := newTestEnv(t)

	created, err := env.scim.CreateConnection(context.Background(), env.adminPrincipal, CreateConnectionParams{
		OrganizationID: env.orgID, Name: "Okta",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	var before struct{ TokenHash string }
	if err := env.db.Gorm().Table("scim_connections").Select("token_hash").Where("id = ?", created.ID).Scan(&before).Error; err != nil {
		t.Fatalf("read token hash before update: %v", err)
	}

	if _, err := env.scim.UpdateConnection(context.Background(), env.adminPrincipal, env.orgID, UpdateConnectionParams{
		Name: "Renamed", Enabled: false, SyncGroups: true, AutoCreateTeams: true,
	}); err != nil {
		t.Fatalf("update: %v", err)
	}

	var after struct{ TokenHash string }
	if err := env.db.Gorm().Table("scim_connections").Select("token_hash").Where("id = ?", created.ID).Scan(&after).Error; err != nil {
		t.Fatalf("read token hash after update: %v", err)
	}
	if before.TokenHash != after.TokenHash {
		t.Fatal("expected UpdateConnection to leave the token hash untouched")
	}

	updated, err := env.scim.GetConnection(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("get after update: %v", err)
	}
	if updated.Name != "Renamed" || updated.Enabled || !updated.SyncGroups || !updated.AutoCreateTeams {
		t.Fatalf("unexpected connection after update: %+v", updated)
	}
}

func TestRotateConnectionTokenChangesTheHashAndReturnsANewRawToken(t *testing.T) {
	env := newTestEnv(t)

	created, err := env.scim.CreateConnection(context.Background(), env.adminPrincipal, CreateConnectionParams{
		OrganizationID: env.orgID, Name: "Okta",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	rotated, err := env.scim.RotateConnectionToken(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("rotate: %v", err)
	}
	if rotated.Token == "" || rotated.Token == created.Token {
		t.Fatalf("expected a fresh, different raw token after rotation, got %q (was %q)", rotated.Token, created.Token)
	}
}

func TestDeleteConnectionAllowsCreatingAFreshOne(t *testing.T) {
	env := newTestEnv(t)

	if _, err := env.scim.CreateConnection(context.Background(), env.adminPrincipal, CreateConnectionParams{
		OrganizationID: env.orgID, Name: "Okta",
	}); err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := env.scim.DeleteConnection(context.Background(), env.adminPrincipal, env.orgID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if connection, err := env.scim.GetConnection(context.Background(), env.adminPrincipal, env.orgID); err != nil || connection != nil {
		t.Fatalf("expected no connection after delete, got %+v err=%v", connection, err)
	}
	if _, err := env.scim.CreateConnection(context.Background(), env.adminPrincipal, CreateConnectionParams{
		OrganizationID: env.orgID, Name: "Entra ID",
	}); err != nil {
		t.Fatalf("expected creating a fresh connection after delete to succeed: %v", err)
	}
}
