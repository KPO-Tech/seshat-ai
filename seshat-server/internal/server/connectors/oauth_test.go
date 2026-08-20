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

// TestListMyAccountsAndDeleteMyAccountAreSelfScoped verifies the self-
// service management fix: the connecting employee can list/delete their
// own agent_action account without knowledge.manage/organization.manage,
// a different employee sees none of it, and a non-member is rejected.
func TestListMyAccountsAndDeleteMyAccountAreSelfScoped(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)
	setIdentity := setUpFakeConnectorOAuth(t, env)
	setIdentity("carol@example.com")

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
	account, err := env.connectors.CompleteConnectorOAuth(context.Background(), "gdrive", "fake-code", mustParseState(t, authURL))
	if err != nil {
		t.Fatalf("complete oauth: %v", err)
	}

	// The connecting member sees exactly their own account.
	mine, err := env.connectors.ListMyAccounts(context.Background(), member, env.orgID)
	if err != nil {
		t.Fatalf("list my accounts: %v", err)
	}
	if len(mine) != 1 || mine[0].ID != account.ID {
		t.Fatalf("expected exactly the connecting member's own account, got %+v", mine)
	}

	// A different member (even the admin) sees none of it via ListMyAccounts.
	adminMine, err := env.connectors.ListMyAccounts(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list my accounts as admin: %v", err)
	}
	if len(adminMine) != 0 {
		t.Fatalf("expected the admin's own agent_action list to be empty, got %+v", adminMine)
	}
	// ...but the admin's org-wide ListAccounts still sees it (unchanged
	// visibility - see helps/roadmap.md's note on this being intentional).
	all, err := env.connectors.ListAccounts(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list all accounts as admin: %v", err)
	}
	if len(all) != 1 {
		t.Fatalf("expected the admin's org-wide list to still include the agent_action account, got %+v", all)
	}

	// The admin cannot delete someone else's agent_action account through
	// the self-service path (not found, not forbidden).
	if err := env.connectors.DeleteMyAccount(context.Background(), env.adminPrincipal, account.ID); err == nil {
		t.Fatal("expected the admin to be rejected deleting another member's agent_action account via DeleteMyAccount")
	}
	// A non-member is rejected from listing entirely.
	otherOrg, err := env.iam.CreateOrganization(context.Background(), env.adminPrincipal, iam.CreateOrganizationParams{Name: "Other", Slug: "other-org-2"})
	if err != nil {
		t.Fatalf("create other org: %v", err)
	}
	outsiderUser, err := env.iam.CreateUser(context.Background(), env.adminPrincipal, iam.CreateUserParams{
		Email: "outsider2@example.com", Password: "password123", DisplayName: "Outsider", OrganizationID: otherOrg.ID, Role: "member",
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
		t.Fatalf("resolve outsider: %v", err)
	}
	if _, err := env.connectors.ListMyAccounts(context.Background(), outsider, env.orgID); err == nil {
		t.Fatal("expected a non-member to be rejected from ListMyAccounts")
	}

	// The connecting member can delete their own account.
	if err := env.connectors.DeleteMyAccount(context.Background(), member, account.ID); err != nil {
		t.Fatalf("delete my account: %v", err)
	}
	mineAfterDelete, err := env.connectors.ListMyAccounts(context.Background(), member, env.orgID)
	if err != nil {
		t.Fatalf("list my accounts after delete: %v", err)
	}
	if len(mineAfterDelete) != 0 {
		t.Fatalf("expected no accounts left after self-delete, got %+v", mineAfterDelete)
	}
}

// TestBeginConnectorOAuthSlackIsAgentActionOnly verifies the restriction
// added for kinds with no Discover/Sync: slack can self-service an
// agent_action connect exactly like gdrive/sharepoint, but a knowledge_sync
// attempt is rejected outright, even from an admin with a corpus in hand.
func TestBeginConnectorOAuthSlackIsAgentActionOnly(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)
	env.connectors.SetPublicAPIURL("http://localhost:8080")
	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "slack", ClientID: "client-1", ClientSecret: "secret-1",
	}); err != nil {
		t.Fatalf("register slack app: %v", err)
	}

	authURL, err := env.connectors.BeginConnectorOAuth(context.Background(), member, "slack", BeginOAuthParams{
		OrganizationID: env.orgID, Purpose: PurposeAgentAction,
	})
	if err != nil {
		t.Fatalf("expected a plain member to self-service a slack agent_action connect, got: %v", err)
	}
	if _, err := url.Parse(authURL); err != nil {
		t.Fatalf("expected a valid authorization url, got %q: %v", authURL, err)
	}

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, knowledge.CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Docs",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}
	// Even an admin, with a real corpus, cannot start a knowledge_sync
	// connect for slack - it only supports agent_action.
	if _, err := env.connectors.BeginConnectorOAuth(context.Background(), env.adminPrincipal, "slack", BeginOAuthParams{
		OrganizationID: env.orgID, CorpusID: corpus.ID,
	}); err == nil {
		t.Fatal("expected a knowledge_sync connect for slack to be rejected")
	}
	// Purpose defaults to knowledge_sync when unset - must still be rejected.
	if _, err := env.connectors.BeginConnectorOAuth(context.Background(), env.adminPrincipal, "slack", BeginOAuthParams{
		OrganizationID: env.orgID,
	}); err == nil {
		t.Fatal("expected an unspecified-purpose slack connect to default to knowledge_sync and be rejected")
	}
}

// TestCompleteConnectorOAuthSlackResolvesIdentityAndToken proves the full
// slack path end to end: connecting stores a team_id:user_id identity and
// AccessTokenForUser resolves a live token for exactly that employee -
// slack rides AccessTokenForUser/oauthConfigFor entirely unchanged, so this
// is really a test that the switch-statement wiring (endpoint/scopes/
// identity) is correct, not new self-service logic.
func TestCompleteConnectorOAuthSlackResolvesIdentityAndToken(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)
	tokenServer := fakeOAuthTokenServer(t)
	env.connectors.oauthEndpointOverride = func(kind string) oauth2.Endpoint {
		return oauth2.Endpoint{AuthURL: tokenServer.URL + "/authorize", TokenURL: tokenServer.URL + "/token"}
	}
	env.connectors.identityOverride = func(ctx context.Context, kind string, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
		return "T123:U456", nil
	}
	env.connectors.SetPublicAPIURL("http://localhost:8080")

	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "slack", ClientID: "client-1", ClientSecret: "secret-1",
	}); err != nil {
		t.Fatalf("register slack app: %v", err)
	}
	authURL, err := env.connectors.BeginConnectorOAuth(context.Background(), member, "slack", BeginOAuthParams{
		OrganizationID: env.orgID, Purpose: PurposeAgentAction,
	})
	if err != nil {
		t.Fatalf("begin slack agent_action oauth: %v", err)
	}
	account, err := env.connectors.CompleteConnectorOAuth(context.Background(), "slack", "fake-code", mustParseState(t, authURL))
	if err != nil {
		t.Fatalf("complete slack oauth: %v", err)
	}
	if account.Purpose != PurposeAgentAction || account.CorpusID != "" {
		t.Fatalf("expected an agent_action account with no corpus, got %+v", account)
	}
	if account.ExternalAccountID != "T123:U456" {
		t.Fatalf("expected external_account_id %q, got %q", "T123:U456", account.ExternalAccountID)
	}

	token, connected, err := env.connectors.AccessTokenForUser(context.Background(), env.orgID, "slack", member.User.ID)
	if err != nil {
		t.Fatalf("AccessTokenForUser: %v", err)
	}
	if !connected || token == "" {
		t.Fatalf("expected a live token for the connecting employee, got connected=%v token=%q", connected, token)
	}
}

// TestBeginConnectorOAuthOutlookAndTeamsAreAgentActionOnly mirrors
// TestBeginConnectorOAuthSlackIsAgentActionOnly for both new Microsoft
// kinds - neither has Discover/Sync (see outlook.go/teams.go), so both
// should be rejected for knowledge_sync the same way slack is.
func TestBeginConnectorOAuthOutlookAndTeamsAreAgentActionOnly(t *testing.T) {
	for _, kind := range []string{"outlook", "teams"} {
		t.Run(kind, func(t *testing.T) {
			env := newTestEnv(t)
			member := env.addMember(t)
			env.connectors.SetPublicAPIURL("http://localhost:8080")
			if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
				OrganizationID: env.orgID, Kind: kind, ClientID: "client-1", ClientSecret: "secret-1",
			}); err != nil {
				t.Fatalf("register %s app: %v", kind, err)
			}

			authURL, err := env.connectors.BeginConnectorOAuth(context.Background(), member, kind, BeginOAuthParams{
				OrganizationID: env.orgID, Purpose: PurposeAgentAction,
			})
			if err != nil {
				t.Fatalf("expected a plain member to self-service a %s agent_action connect, got: %v", kind, err)
			}
			if _, err := url.Parse(authURL); err != nil {
				t.Fatalf("expected a valid authorization url, got %q: %v", authURL, err)
			}

			corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, knowledge.CreateCorpusParams{
				OrganizationID: env.orgID, Name: "Docs",
			})
			if err != nil {
				t.Fatalf("create corpus: %v", err)
			}
			if _, err := env.connectors.BeginConnectorOAuth(context.Background(), env.adminPrincipal, kind, BeginOAuthParams{
				OrganizationID: env.orgID, CorpusID: corpus.ID,
			}); err == nil {
				t.Fatalf("expected a knowledge_sync connect for %s to be rejected", kind)
			}
		})
	}
}

// TestCompleteConnectorOAuthOutlookAndTeamsResolveIdentityAndToken mirrors
// TestCompleteConnectorOAuthSlackResolvesIdentityAndToken - both route
// through the same fetchMicrosoftAccountUPN identity lookup sharepoint
// already uses, so this also proves that reuse is wired correctly for the
// two new kinds.
func TestCompleteConnectorOAuthOutlookAndTeamsResolveIdentityAndToken(t *testing.T) {
	for _, kind := range []string{"outlook", "teams"} {
		t.Run(kind, func(t *testing.T) {
			env := newTestEnv(t)
			member := env.addMember(t)
			setIdentity := setUpFakeConnectorOAuth(t, env)
			setIdentity("employee@contoso.com")

			if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
				OrganizationID: env.orgID, Kind: kind, ClientID: "client-1", ClientSecret: "secret-1",
			}); err != nil {
				t.Fatalf("register %s app: %v", kind, err)
			}
			authURL, err := env.connectors.BeginConnectorOAuth(context.Background(), member, kind, BeginOAuthParams{
				OrganizationID: env.orgID, Purpose: PurposeAgentAction,
			})
			if err != nil {
				t.Fatalf("begin %s agent_action oauth: %v", kind, err)
			}
			account, err := env.connectors.CompleteConnectorOAuth(context.Background(), kind, "fake-code", mustParseState(t, authURL))
			if err != nil {
				t.Fatalf("complete %s oauth: %v", kind, err)
			}
			if account.Purpose != PurposeAgentAction || account.CorpusID != "" {
				t.Fatalf("expected an agent_action account with no corpus, got %+v", account)
			}
			if account.ExternalAccountID != "employee@contoso.com" {
				t.Fatalf("expected external_account_id %q, got %q", "employee@contoso.com", account.ExternalAccountID)
			}

			token, connected, err := env.connectors.AccessTokenForUser(context.Background(), env.orgID, kind, member.User.ID)
			if err != nil {
				t.Fatalf("AccessTokenForUser: %v", err)
			}
			if !connected || token == "" {
				t.Fatalf("expected a live token for the connecting employee, got connected=%v token=%q", connected, token)
			}
		})
	}
}

// TestBeginConnectorOAuthGmailIsAgentActionOnly mirrors
// TestBeginConnectorOAuthSlackIsAgentActionOnly - gmail has no
// Discover/Sync in this package either (unlike gdrive), so it's
// agent_action-only the same way.
func TestBeginConnectorOAuthGmailIsAgentActionOnly(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)
	env.connectors.SetPublicAPIURL("http://localhost:8080")
	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "gmail", ClientID: "client-1", ClientSecret: "secret-1",
	}); err != nil {
		t.Fatalf("register gmail app: %v", err)
	}

	authURL, err := env.connectors.BeginConnectorOAuth(context.Background(), member, "gmail", BeginOAuthParams{
		OrganizationID: env.orgID, Purpose: PurposeAgentAction,
	})
	if err != nil {
		t.Fatalf("expected a plain member to self-service a gmail agent_action connect, got: %v", err)
	}
	if _, err := url.Parse(authURL); err != nil {
		t.Fatalf("expected a valid authorization url, got %q: %v", authURL, err)
	}

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, knowledge.CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Docs",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}
	if _, err := env.connectors.BeginConnectorOAuth(context.Background(), env.adminPrincipal, "gmail", BeginOAuthParams{
		OrganizationID: env.orgID, CorpusID: corpus.ID,
	}); err == nil {
		t.Fatal("expected a knowledge_sync connect for gmail to be rejected")
	}
}

// TestCompleteConnectorOAuthGmailResolvesIdentityAndToken mirrors
// TestCompleteConnectorOAuthSlackResolvesIdentityAndToken - gmail routes
// through the same fetchGoogleAccountEmail identity lookup gdrive already
// uses, so this also proves that reuse is wired correctly.
func TestCompleteConnectorOAuthGmailResolvesIdentityAndToken(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)
	setIdentity := setUpFakeConnectorOAuth(t, env)
	setIdentity("employee@example.com")

	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "gmail", ClientID: "client-1", ClientSecret: "secret-1",
	}); err != nil {
		t.Fatalf("register gmail app: %v", err)
	}
	authURL, err := env.connectors.BeginConnectorOAuth(context.Background(), member, "gmail", BeginOAuthParams{
		OrganizationID: env.orgID, Purpose: PurposeAgentAction,
	})
	if err != nil {
		t.Fatalf("begin gmail agent_action oauth: %v", err)
	}
	account, err := env.connectors.CompleteConnectorOAuth(context.Background(), "gmail", "fake-code", mustParseState(t, authURL))
	if err != nil {
		t.Fatalf("complete gmail oauth: %v", err)
	}
	if account.Purpose != PurposeAgentAction || account.CorpusID != "" {
		t.Fatalf("expected an agent_action account with no corpus, got %+v", account)
	}
	if account.ExternalAccountID != "employee@example.com" {
		t.Fatalf("expected external_account_id %q, got %q", "employee@example.com", account.ExternalAccountID)
	}

	token, connected, err := env.connectors.AccessTokenForUser(context.Background(), env.orgID, "gmail", member.User.ID)
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
