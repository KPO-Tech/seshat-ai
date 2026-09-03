package connectors

import (
	"context"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func TestCreateStaticAgentAccountRejectsUnsupportedKind(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)
	if _, err := env.connectors.CreateStaticAgentAccount(context.Background(), member, CreateStaticAgentAccountParams{
		OrganizationID: env.orgID, Kind: "not-a-real-kind", Secret: "secret-1",
	}); err == nil {
		t.Fatal("expected an unsupported kind to be rejected")
	}
}

func TestCreateStaticAgentAccountRequiresSecret(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)
	if _, err := env.connectors.CreateStaticAgentAccount(context.Background(), member, CreateStaticAgentAccountParams{
		OrganizationID: env.orgID, Kind: "stripe",
	}); err == nil {
		t.Fatal("expected a missing secret to be rejected")
	}
}

// TestCreateStaticAgentAccountIsSelfService proves a plain member (no
// knowledge.manage/organization.manage) can self-service a static-credential
// agent_action connect - same membership-only bar as
// TestBeginConnectorOAuthAgentActionIsSelfService, and a total outsider is
// still rejected.
func TestCreateStaticAgentAccountIsSelfService(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)

	account, err := env.connectors.CreateStaticAgentAccount(context.Background(), member, CreateStaticAgentAccountParams{
		OrganizationID: env.orgID, Kind: "stripe", Secret: "sk_test_fake",
	})
	if err != nil {
		t.Fatalf("expected a plain member to self-service a static agent_action connect, got: %v", err)
	}
	if account.Purpose != PurposeAgentAction || account.Kind != "stripe" || account.Status != StatusConnected {
		t.Fatalf("unexpected account: %+v", account)
	}

	otherOrg, err := env.iam.CreateOrganization(context.Background(), env.adminPrincipal, iam.CreateOrganizationParams{
		Name: "Other Org", Slug: "other-org",
	})
	if err != nil {
		t.Fatalf("create other org: %v", err)
	}
	outsiderUser, err := env.iam.CreateUser(context.Background(), env.adminPrincipal, iam.CreateUserParams{
		Email: "outsider@example.com", Password: "password123", DisplayName: "Outsider",
		OrganizationID: otherOrg.ID, Role: "member",
	})
	if err != nil {
		t.Fatalf("create outsider: %v", err)
	}
	login, err := env.iam.Login(context.Background(), outsiderUser.Email, "password123")
	if err != nil {
		t.Fatalf("login outsider: %v", err)
	}
	outsider, err := env.iam.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve outsider principal: %v", err)
	}
	if _, err := env.connectors.CreateStaticAgentAccount(context.Background(), outsider, CreateStaticAgentAccountParams{
		OrganizationID: env.orgID, Kind: "stripe", Secret: "sk_test_fake",
	}); err == nil {
		t.Fatal("expected a non-member to be rejected from a static agent_action connect")
	}
}

// TestCreateStaticAgentAccountResubmitUpdatesInPlace proves rotating a
// secret (re-submitting the paste form) updates the existing row rather
// than inserting a duplicate - the find-or-update semantics mirroring
// CompleteConnectorOAuth's own hasExisting branch.
func TestCreateStaticAgentAccountResubmitUpdatesInPlace(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)

	first, err := env.connectors.CreateStaticAgentAccount(context.Background(), member, CreateStaticAgentAccountParams{
		OrganizationID: env.orgID, Kind: "stripe", Secret: "sk_test_old",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	second, err := env.connectors.CreateStaticAgentAccount(context.Background(), member, CreateStaticAgentAccountParams{
		OrganizationID: env.orgID, Kind: "stripe", DisplayName: "Rotated Key", Secret: "sk_test_new",
	})
	if err != nil {
		t.Fatalf("resubmit: %v", err)
	}
	if second.ID != first.ID {
		t.Fatalf("expected resubmit to update the same row, got a new id %q (was %q)", second.ID, first.ID)
	}
	if second.DisplayName != "Rotated Key" {
		t.Fatalf("expected display name to be updated, got %q", second.DisplayName)
	}

	secret, ok, err := env.connectors.StaticSecretForUser(context.Background(), env.orgID, "stripe", member.User.ID)
	if err != nil {
		t.Fatalf("StaticSecretForUser: %v", err)
	}
	if !ok || secret != "sk_test_new" {
		t.Fatalf("expected the rotated secret sk_test_new, got %q (ok=%v)", secret, ok)
	}
}

// TestStaticSecretForUserIsScopedPerUser proves two different users'
// secrets for the same org+kind never collide - the created_by_user_id
// filter is not optional, it's what keeps StaticSecretForUser from
// resolving the wrong employee's key.
func TestStaticSecretForUserIsScopedPerUser(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)

	if _, err := env.connectors.CreateStaticAgentAccount(context.Background(), env.adminPrincipal, CreateStaticAgentAccountParams{
		OrganizationID: env.orgID, Kind: "stripe", Secret: "sk_test_admin",
	}); err != nil {
		t.Fatalf("create admin account: %v", err)
	}
	if _, err := env.connectors.CreateStaticAgentAccount(context.Background(), member, CreateStaticAgentAccountParams{
		OrganizationID: env.orgID, Kind: "stripe", Secret: "sk_test_member",
	}); err != nil {
		t.Fatalf("create member account: %v", err)
	}

	adminSecret, ok, err := env.connectors.StaticSecretForUser(context.Background(), env.orgID, "stripe", env.adminPrincipal.User.ID)
	if err != nil || !ok || adminSecret != "sk_test_admin" {
		t.Fatalf("expected admin's own secret, got %q ok=%v err=%v", adminSecret, ok, err)
	}
	memberSecret, ok, err := env.connectors.StaticSecretForUser(context.Background(), env.orgID, "stripe", member.User.ID)
	if err != nil || !ok || memberSecret != "sk_test_member" {
		t.Fatalf("expected member's own secret, got %q ok=%v err=%v", memberSecret, ok, err)
	}
}

func TestStaticSecretForUserNoAccount(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)
	secret, ok, err := env.connectors.StaticSecretForUser(context.Background(), env.orgID, "stripe", member.User.ID)
	if err != nil {
		t.Fatalf("StaticSecretForUser: %v", err)
	}
	if ok || secret != "" {
		t.Fatalf("expected no secret for a user with no connected account, got %q ok=%v", secret, ok)
	}
}
