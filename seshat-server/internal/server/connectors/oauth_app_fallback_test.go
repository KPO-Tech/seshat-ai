package connectors

import (
	"context"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// TestOAuthConfigForFallsBackToPlatformDefaultApp proves the core
// mechanism end to end: an organization with no ConnectorOAuthApp row of
// its own for a kind, but a platform-default organization that shares one,
// resolves through BeginConnectorOAuth using the platform's app - and
// CompleteConnectorOAuth decrypts its client secret with the *platform*
// organization's DEK, not the requesting organization's (see
// resolveOAuthApp/oauthConfigFor's doc comments on why that distinction
// matters - the wrong DEK would fail decryption outright, not silently
// misbehave, but it's exactly the kind of one-line regression this test
// exists to catch).
func TestOAuthConfigForFallsBackToPlatformDefaultApp(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)
	setIdentity := setUpFakeConnectorOAuth(t, env)
	setIdentity("bob@example.com")

	platformOrg, err := env.iam.CreateOrganization(context.Background(), env.adminPrincipal, iam.CreateOrganizationParams{
		Name: "Platform Default", Slug: "platform-default",
	})
	if err != nil {
		t.Fatalf("create platform org: %v", err)
	}
	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: platformOrg.ID, Kind: "github", ClientID: "platform-client", ClientSecret: "platform-secret",
	}); err != nil {
		t.Fatalf("register platform app: %v", err)
	}
	if _, err := env.iam.SetOrganizationDefault(context.Background(), env.adminPrincipal, platformOrg.ID, true); err != nil {
		t.Fatalf("set platform org default: %v", err)
	}

	// env.orgID (member's own org) has never registered a "github" app of
	// its own - this must still work by falling back to platformOrg's.
	authURL, err := env.connectors.BeginConnectorOAuth(context.Background(), member, "github", BeginOAuthParams{
		OrganizationID: env.orgID, Purpose: PurposeAgentAction,
	})
	if err != nil {
		t.Fatalf("expected begin oauth to fall back to the platform default app, got: %v", err)
	}
	state := mustParseState(t, authURL)

	account, err := env.connectors.CompleteConnectorOAuth(context.Background(), "github", "fake-code", state)
	if err != nil {
		t.Fatalf("expected complete oauth to succeed via the platform default app, got: %v", err)
	}
	if account.OrganizationID != env.orgID {
		t.Fatalf("expected the connected account to belong to the requesting org %q, got %q", env.orgID, account.OrganizationID)
	}

	token, connected, err := env.connectors.AccessTokenForUser(context.Background(), env.orgID, "github", member.User.ID)
	if err != nil || !connected || token == "" {
		t.Fatalf("expected a live token for the connecting employee, got connected=%v token=%q err=%v", connected, token, err)
	}
}

// TestOAuthConfigForPrefersOrgsOwnAppOverPlatformDefault proves the
// fallback never overrides an organization's own registered app, even
// when a platform default also exists for the same kind.
func TestOAuthConfigForPrefersOrgsOwnAppOverPlatformDefault(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)
	setIdentity := setUpFakeConnectorOAuth(t, env)
	setIdentity("bob@example.com")

	platformOrg, err := env.iam.CreateOrganization(context.Background(), env.adminPrincipal, iam.CreateOrganizationParams{
		Name: "Platform Default", Slug: "platform-default-2",
	})
	if err != nil {
		t.Fatalf("create platform org: %v", err)
	}
	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: platformOrg.ID, Kind: "github", ClientID: "platform-client", ClientSecret: "platform-secret",
	}); err != nil {
		t.Fatalf("register platform app: %v", err)
	}
	if _, err := env.iam.SetOrganizationDefault(context.Background(), env.adminPrincipal, platformOrg.ID, true); err != nil {
		t.Fatalf("set platform org default: %v", err)
	}
	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "github", ClientID: "own-client", ClientSecret: "own-secret",
	}); err != nil {
		t.Fatalf("register org's own app: %v", err)
	}

	authURL, err := env.connectors.BeginConnectorOAuth(context.Background(), member, "github", BeginOAuthParams{
		OrganizationID: env.orgID, Purpose: PurposeAgentAction,
	})
	if err != nil {
		t.Fatalf("begin oauth: %v", err)
	}
	state := mustParseState(t, authURL)
	if _, err := env.connectors.CompleteConnectorOAuth(context.Background(), "github", "fake-code", state); err != nil {
		t.Fatalf("expected complete oauth to succeed using the org's own app, got: %v", err)
	}
}

// TestOAuthConfigForNoFallbackWhenShareConnectorAppsDisabled proves an
// admin can opt the connector_apps domain out of sharing independently of
// IsDefault itself, mirroring the existing per-domain opt-out already
// proven for MCP servers/embedder settings.
func TestOAuthConfigForNoFallbackWhenShareConnectorAppsDisabled(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)

	platformOrg, err := env.iam.CreateOrganization(context.Background(), env.adminPrincipal, iam.CreateOrganizationParams{
		Name: "Platform Default", Slug: "platform-default-3",
	})
	if err != nil {
		t.Fatalf("create platform org: %v", err)
	}
	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: platformOrg.ID, Kind: "github", ClientID: "platform-client", ClientSecret: "platform-secret",
	}); err != nil {
		t.Fatalf("register platform app: %v", err)
	}
	if _, err := env.iam.SetOrganizationDefault(context.Background(), env.adminPrincipal, platformOrg.ID, true); err != nil {
		t.Fatalf("set platform org default: %v", err)
	}
	shareConnectorApps := false
	if _, err := env.iam.SetOrganizationSharedDomains(context.Background(), env.adminPrincipal, platformOrg.ID,
		nil, nil, nil, nil, nil, nil, &shareConnectorApps); err != nil {
		t.Fatalf("opt out of sharing connector apps: %v", err)
	}

	if _, err := env.connectors.BeginConnectorOAuth(context.Background(), member, "github", BeginOAuthParams{
		OrganizationID: env.orgID, Purpose: PurposeAgentAction,
	}); err == nil {
		t.Fatal("expected begin oauth to fail - the platform default org opted out of sharing connector apps")
	}
}
