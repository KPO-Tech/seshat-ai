package scim

import (
	"context"
	"testing"
)

func TestResolveConnectionByTokenSucceedsForAValidEnabledToken(t *testing.T) {
	env := newTestEnv(t)

	created, err := env.scim.CreateConnection(context.Background(), env.adminPrincipal, CreateConnectionParams{
		OrganizationID: env.orgID, Name: "Okta",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	resolved, err := env.scim.ResolveConnectionByToken(context.Background(), created.Token)
	if err != nil {
		t.Fatalf("expected a valid token to resolve, got: %v", err)
	}
	if resolved.ID != created.ID || resolved.OrganizationID != env.orgID {
		t.Fatalf("unexpected resolved connection: %+v", resolved)
	}
}

func TestResolveConnectionByTokenRejectsUnknownToken(t *testing.T) {
	env := newTestEnv(t)

	if _, err := env.scim.ResolveConnectionByToken(context.Background(), "not-a-real-token"); err == nil {
		t.Fatal("expected an unknown token to be rejected")
	}
}

func TestResolveConnectionByTokenRejectsEmptyToken(t *testing.T) {
	env := newTestEnv(t)

	if _, err := env.scim.ResolveConnectionByToken(context.Background(), ""); err == nil {
		t.Fatal("expected an empty token to be rejected")
	}
}

func TestResolveConnectionByTokenRejectsDisabledConnection(t *testing.T) {
	env := newTestEnv(t)

	created, err := env.scim.CreateConnection(context.Background(), env.adminPrincipal, CreateConnectionParams{
		OrganizationID: env.orgID, Name: "Okta",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := env.scim.UpdateConnection(context.Background(), env.adminPrincipal, env.orgID, UpdateConnectionParams{
		Name: "Okta", Enabled: false,
	}); err != nil {
		t.Fatalf("disable: %v", err)
	}

	if _, err := env.scim.ResolveConnectionByToken(context.Background(), created.Token); err == nil {
		t.Fatal("expected a disabled connection's token to be rejected")
	}
}

func TestResolveConnectionByTokenRejectsTokenAfterRotation(t *testing.T) {
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

	if _, err := env.scim.ResolveConnectionByToken(context.Background(), created.Token); err == nil {
		t.Fatal("expected the old, pre-rotation token to stop working immediately")
	}
	if _, err := env.scim.ResolveConnectionByToken(context.Background(), rotated.Token); err != nil {
		t.Fatalf("expected the new, post-rotation token to work: %v", err)
	}
}
