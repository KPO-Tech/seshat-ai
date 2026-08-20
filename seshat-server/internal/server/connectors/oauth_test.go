package connectors

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"golang.org/x/oauth2"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
)

func TestRegisterOAuthAppUpsertAndKeepsSecretWhenOmitted(t *testing.T) {
	env := newTestEnv(t)

	app, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "gdrive", ClientID: "client-1", ClientSecret: "secret-1",
	})
	if err != nil {
		t.Fatalf("register new app: %v", err)
	}
	if !app.Configured || app.ClientID != "client-1" {
		t.Fatalf("expected a configured app with client-1, got %+v", app)
	}

	// Updating with a new client_id but an empty client_secret must keep
	// the existing secret, not wipe it.
	updated, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "gdrive", ClientID: "client-2", ClientSecret: "",
	})
	if err != nil {
		t.Fatalf("update app without secret: %v", err)
	}
	if updated.ClientID != "client-2" || !updated.Configured {
		t.Fatalf("expected client_id updated and still configured, got %+v", updated)
	}

	// Verify against the raw DB row that the secret is still decryptable
	// and unchanged, not wiped or corrupted by the no-secret update.
	oauthCfg, err := env.connectors.oauthConfigFor(context.Background(), env.orgID, "gdrive")
	if err != nil {
		t.Fatalf("resolve oauth config: %v", err)
	}
	if oauthCfg.ClientSecret != "secret-1" {
		t.Fatalf("expected the original secret to survive a secret-less update, got %q", oauthCfg.ClientSecret)
	}

	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "sharepoint", ClientID: "c", ClientSecret: "",
	}); err == nil {
		t.Fatal("expected registering a fresh (never-before-registered) org+kind with an empty secret to fail")
	}
	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "not-a-real-kind", ClientID: "c", ClientSecret: "s",
	}); err == nil {
		t.Fatal("expected an unsupported kind to be rejected")
	}
}

func TestBeginConnectorOAuthRequiresRegisteredApp(t *testing.T) {
	env := newTestEnv(t)
	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, knowledge.CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Docs",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}
	env.connectors.SetPublicAPIURL("http://localhost:8080")

	if _, err := env.connectors.BeginConnectorOAuth(context.Background(), env.adminPrincipal, "sharepoint", BeginOAuthParams{
		OrganizationID: env.orgID, CorpusID: corpus.ID,
	}); err == nil {
		t.Fatal("expected begin to fail when no oauth app is registered for this org+kind")
	}

	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "sharepoint", ClientID: "c", ClientSecret: "s",
	}); err != nil {
		t.Fatalf("register app: %v", err)
	}

	authURL, err := env.connectors.BeginConnectorOAuth(context.Background(), env.adminPrincipal, "sharepoint", BeginOAuthParams{
		OrganizationID: env.orgID, CorpusID: corpus.ID,
	})
	if err != nil {
		t.Fatalf("begin oauth: %v", err)
	}
	if _, err := url.Parse(authURL); err != nil {
		t.Fatalf("expected a valid authorization URL, got %q: %v", authURL, err)
	}
}

// fakeOAuthTokenServer serves a minimal OAuth2 token endpoint - exercises
// the real oauth2.Config.Exchange code path (real HTTP call, real JSON
// parsing), same reasoning as iam's fakeIdP for OIDC.
func fakeOAuthTokenServer(t *testing.T) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token":  "fake-access-token",
			"refresh_token": "fake-refresh-token",
			"token_type":    "Bearer",
			"expires_in":    3600,
		})
	}))
	t.Cleanup(server.Close)
	return server
}

// setUpFakeConnectorOAuth wires env.connectors' test-only endpoint/identity
// overrides at a fake token server, returning a function that lets each
// test control what identity the "connect" flow resolves to.
func setUpFakeConnectorOAuth(t *testing.T, env testEnv) (setIdentity func(string)) {
	t.Helper()
	tokenServer := fakeOAuthTokenServer(t)
	identity := "unset@example.com"
	env.connectors.oauthEndpointOverride = func(kind string) oauth2.Endpoint {
		return oauth2.Endpoint{AuthURL: tokenServer.URL + "/authorize", TokenURL: tokenServer.URL + "/token"}
	}
	env.connectors.identityOverride = func(ctx context.Context, kind string, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
		return identity, nil
	}
	env.connectors.SetPublicAPIURL("http://localhost:8080")
	return func(id string) { identity = id }
}

func TestCompleteConnectorOAuthEndToEnd(t *testing.T) {
	env := newTestEnv(t)
	setIdentity := setUpFakeConnectorOAuth(t, env)
	setIdentity("alice@example.com")

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, knowledge.CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Docs",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}
	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "gdrive", ClientID: "client-1", ClientSecret: "secret-1",
	}); err != nil {
		t.Fatalf("register app: %v", err)
	}

	authURL, err := env.connectors.BeginConnectorOAuth(context.Background(), env.adminPrincipal, "gdrive", BeginOAuthParams{
		OrganizationID: env.orgID, CorpusID: corpus.ID, SyncIntervalSeconds: 1800,
	})
	if err != nil {
		t.Fatalf("begin oauth: %v", err)
	}
	parsed, err := url.Parse(authURL)
	if err != nil {
		t.Fatalf("parse authorization url: %v", err)
	}
	state := parsed.Query().Get("state")
	if state == "" {
		t.Fatal("expected a state query parameter in the authorization url")
	}

	account, err := env.connectors.CompleteConnectorOAuth(context.Background(), "gdrive", "fake-code", state)
	if err != nil {
		t.Fatalf("complete oauth: %v", err)
	}
	if account.DisplayName != "alice@example.com" || account.Status != StatusConnected || account.CorpusID != corpus.ID {
		t.Fatalf("unexpected account: %+v", account)
	}
	if account.SyncIntervalSeconds != 1800 {
		t.Fatalf("expected the begin-time sync interval to carry through, got %d", account.SyncIntervalSeconds)
	}

	// The state is single-use - completing again with the same state must fail.
	if _, err := env.connectors.CompleteConnectorOAuth(context.Background(), "gdrive", "fake-code", state); err == nil {
		t.Fatal("expected reusing a consumed state to fail")
	}

	accounts, err := env.connectors.ListAccounts(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list accounts: %v", err)
	}
	if len(accounts) != 1 {
		t.Fatalf("expected exactly one connector account, got %+v", accounts)
	}

	// Reconnecting the same external identity must update the existing
	// account in place, not create a second one.
	authURL2, err := env.connectors.BeginConnectorOAuth(context.Background(), env.adminPrincipal, "gdrive", BeginOAuthParams{
		OrganizationID: env.orgID, CorpusID: corpus.ID,
	})
	if err != nil {
		t.Fatalf("begin second oauth: %v", err)
	}
	state2 := mustParseState(t, authURL2)
	account2, err := env.connectors.CompleteConnectorOAuth(context.Background(), "gdrive", "fake-code", state2)
	if err != nil {
		t.Fatalf("complete second oauth: %v", err)
	}
	if account2.ID != account.ID {
		t.Fatalf("expected reconnecting the same identity to update the existing account %q, got a new one %q", account.ID, account2.ID)
	}
	accountsAfterReconnect, err := env.connectors.ListAccounts(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list accounts after reconnect: %v", err)
	}
	if len(accountsAfterReconnect) != 1 {
		t.Fatalf("expected reconnecting to still leave exactly one account, got %+v", accountsAfterReconnect)
	}
}

// TestBeginConnectorOAuthAgentActionIsSelfService verifies the fork added
// for per-employee accounts: a plain org member (no knowledge.manage/
// organization.manage) can start an agent_action connect for themselves,
// where a corpus_id would be rejected - unlike the admin-gated,
// corpus-required knowledge_sync flow.
func TestBeginConnectorOAuthAgentActionIsSelfService(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)
	env.connectors.SetPublicAPIURL("http://localhost:8080")
	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "gdrive", ClientID: "client-1", ClientSecret: "secret-1",
	}); err != nil {
		t.Fatalf("register app: %v", err)
	}

	// A plain member is rejected from the admin-only knowledge_sync flow...
	if _, err := env.connectors.BeginConnectorOAuth(context.Background(), member, "gdrive", BeginOAuthParams{
		OrganizationID: env.orgID, CorpusID: "some-corpus",
	}); err == nil {
		t.Fatal("expected a non-admin member to be rejected from a knowledge_sync connect")
	}

	// ...but can self-service an agent_action connect for their own use.
	authURL, err := env.connectors.BeginConnectorOAuth(context.Background(), member, "gdrive", BeginOAuthParams{
		OrganizationID: env.orgID, Purpose: PurposeAgentAction,
	})
	if err != nil {
		t.Fatalf("expected a plain member to self-service an agent_action connect, got: %v", err)
	}
	if _, err := url.Parse(authURL); err != nil {
		t.Fatalf("expected a valid authorization url, got %q: %v", authURL, err)
	}

	// A corpus_id doesn't belong on an agent_action connect - must be rejected.
	if _, err := env.connectors.BeginConnectorOAuth(context.Background(), member, "gdrive", BeginOAuthParams{
		OrganizationID: env.orgID, Purpose: PurposeAgentAction, CorpusID: "some-corpus",
	}); err == nil {
		t.Fatal("expected corpus_id on an agent_action connect to be rejected")
	}

	// A total outsider (no membership at all) must still be rejected.
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
	if _, err := env.connectors.BeginConnectorOAuth(context.Background(), outsider, "gdrive", BeginOAuthParams{
		OrganizationID: env.orgID, Purpose: PurposeAgentAction,
	}); err == nil {
		t.Fatal("expected a non-member to be rejected from an agent_action connect")
	}
}

// TestCompleteConnectorOAuthAgentActionEndToEnd proves the full self-service
// path end to end: a plain member connects their own account, gets a
// PurposeAgentAction row with no corpus and no sync schedule, and
// AccessTokenForUser resolves a live token for exactly that employee.
func TestCompleteConnectorOAuthAgentActionEndToEnd(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)
	setIdentity := setUpFakeConnectorOAuth(t, env)
	setIdentity("bob@example.com")

	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "gdrive", ClientID: "client-1", ClientSecret: "secret-1",
	}); err != nil {
		t.Fatalf("register app: %v", err)
	}

	authURL, err := env.connectors.BeginConnectorOAuth(context.Background(), member, "gdrive", BeginOAuthParams{
		OrganizationID: env.orgID, Purpose: PurposeAgentAction,
	})
	if err != nil {
		t.Fatalf("begin agent_action oauth: %v", err)
	}
	state := mustParseState(t, authURL)

	account, err := env.connectors.CompleteConnectorOAuth(context.Background(), "gdrive", "fake-code", state)
	if err != nil {
		t.Fatalf("complete oauth: %v", err)
	}
	if account.Purpose != PurposeAgentAction || account.CorpusID != "" {
		t.Fatalf("expected an agent_action account with no corpus, got %+v", account)
	}

	// Before connecting, a different employee has no token available.
	otherUserID := env.adminPrincipal.User.ID
	if _, connected, err := env.connectors.AccessTokenForUser(context.Background(), env.orgID, "gdrive", otherUserID); err != nil || connected {
		t.Fatalf("expected no account for a different employee, got connected=%v err=%v", connected, err)
	}

	token, connected, err := env.connectors.AccessTokenForUser(context.Background(), env.orgID, "gdrive", member.User.ID)
	if err != nil {
		t.Fatalf("AccessTokenForUser: %v", err)
	}
	if !connected || token == "" {
		t.Fatalf("expected a live token for the connecting employee, got connected=%v token=%q", connected, token)
	}
}

func mustParseState(t *testing.T, authURL string) string {
	t.Helper()
	parsed, err := url.Parse(authURL)
	if err != nil {
		t.Fatalf("parse authorization url: %v", err)
	}
	state := parsed.Query().Get("state")
	if state == "" {
		t.Fatal("expected a state query parameter in the authorization url")
	}
	return state
}
