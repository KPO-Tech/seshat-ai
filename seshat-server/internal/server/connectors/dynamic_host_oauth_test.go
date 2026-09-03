package connectors

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"golang.org/x/oauth2"
)

// TestRegisterOAuthAppRequiresSubdomainForZendesk proves zendeskKind's
// special validation: no other kind requires this field, but registering
// a zendesk app without one is rejected outright, before ever touching the
// database.
func TestRegisterOAuthAppRequiresSubdomainForZendesk(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "zendesk", ClientID: "client-1", ClientSecret: "secret-1",
	}); err == nil {
		t.Fatal("expected registering a zendesk app with no subdomain to be rejected")
	}

	app, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "zendesk", ClientID: "client-1", ClientSecret: "secret-1", Subdomain: "Acme",
	})
	if err != nil {
		t.Fatalf("register zendesk app with subdomain: %v", err)
	}
	if app.Subdomain != "acme" {
		t.Fatalf("expected subdomain to be stored lowercased, got %q", app.Subdomain)
	}
}

// TestRegisterOAuthAppSubdomainNotRequiredForOtherKinds proves the
// subdomain requirement is zendesk-specific, not a generic new required
// field every kind must now supply.
func TestRegisterOAuthAppSubdomainNotRequiredForOtherKinds(t *testing.T) {
	env := newTestEnv(t)
	app, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "github", ClientID: "client-1", ClientSecret: "secret-1",
	})
	if err != nil {
		t.Fatalf("register github app with no subdomain: %v", err)
	}
	if app.Subdomain != "" {
		t.Fatalf("expected no subdomain for a non-zendesk kind, got %q", app.Subdomain)
	}
}

func TestOAuthAppSubdomainReturnsRegisteredValue(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "zendesk", ClientID: "client-1", ClientSecret: "secret-1", Subdomain: "acme",
	}); err != nil {
		t.Fatalf("register zendesk app: %v", err)
	}
	subdomain, err := env.connectors.OAuthAppSubdomain(context.Background(), env.orgID, "zendesk")
	if err != nil {
		t.Fatalf("OAuthAppSubdomain: %v", err)
	}
	if subdomain != "acme" {
		t.Fatalf("expected %q, got %q", "acme", subdomain)
	}
}

func TestOAuthAppSubdomainNoAppRegistered(t *testing.T) {
	env := newTestEnv(t)
	subdomain, err := env.connectors.OAuthAppSubdomain(context.Background(), env.orgID, "zendesk")
	if err != nil {
		t.Fatalf("OAuthAppSubdomain: %v", err)
	}
	if subdomain != "" {
		t.Fatalf("expected an empty subdomain when no app is registered, got %q", subdomain)
	}
}

// fakeOAuthTokenServerWithExtra mirrors fakeOAuthTokenServer but includes
// one extra top-level field in the token response, the way Pipedrive
// (api_domain) and Salesforce (instance_url) do - proves
// oauthAccountConfig actually reads it via oauth2.Token.Extra, not just
// unit-tested in isolation.
func fakeOAuthTokenServerWithExtra(t *testing.T, extraField, extraValue string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token":  "fake-access-token",
			"refresh_token": "fake-refresh-token",
			"token_type":    "Bearer",
			"expires_in":    3600,
			extraField:      extraValue,
		})
	}))
	t.Cleanup(server.Close)
	return server
}

// TestCompleteConnectorOAuthCapturesPipedriveAPIDomain proves
// oauthAccountConfig's pipedrive branch end to end: connect, then read the
// captured api_domain back via AccountConfigForUser.
func TestCompleteConnectorOAuthCapturesPipedriveAPIDomain(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)
	tokenServer := fakeOAuthTokenServerWithExtra(t, "api_domain", "https://acme.pipedrive.com")
	env.connectors.oauthEndpointOverride = func(kind, subdomain string) oauth2.Endpoint {
		return oauth2.Endpoint{AuthURL: tokenServer.URL + "/authorize", TokenURL: tokenServer.URL + "/token"}
	}
	env.connectors.identityOverride = func(ctx context.Context, kind string, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
		return "bob@example.com", nil
	}
	env.connectors.SetPublicAPIURL("http://localhost:8080")

	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "pipedrive", ClientID: "client-1", ClientSecret: "secret-1",
	}); err != nil {
		t.Fatalf("register app: %v", err)
	}
	authURL, err := env.connectors.BeginConnectorOAuth(context.Background(), member, "pipedrive", BeginOAuthParams{
		OrganizationID: env.orgID, Purpose: PurposeAgentAction,
	})
	if err != nil {
		t.Fatalf("begin oauth: %v", err)
	}
	state := mustParseState(t, authURL)

	if _, err := env.connectors.CompleteConnectorOAuth(context.Background(), "pipedrive", "fake-code", state); err != nil {
		t.Fatalf("complete oauth: %v", err)
	}

	config, ok, err := env.connectors.AccountConfigForUser(context.Background(), env.orgID, "pipedrive", member.User.ID)
	if err != nil {
		t.Fatalf("AccountConfigForUser: %v", err)
	}
	if !ok {
		t.Fatal("expected a captured config for the connected pipedrive account")
	}
	var decoded struct {
		APIDomain string `json:"api_domain"`
	}
	if err := json.Unmarshal([]byte(config), &decoded); err != nil {
		t.Fatalf("decode config: %v", err)
	}
	if decoded.APIDomain != "https://acme.pipedrive.com" {
		t.Fatalf("expected api_domain to be captured, got %+v", decoded)
	}
}

// TestCompleteConnectorOAuthCapturesSalesforceInstanceURL mirrors the
// Pipedrive test above for oauthAccountConfig's salesforce branch.
func TestCompleteConnectorOAuthCapturesSalesforceInstanceURL(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)
	tokenServer := fakeOAuthTokenServerWithExtra(t, "instance_url", "https://acme.my.salesforce.com")
	env.connectors.oauthEndpointOverride = func(kind, subdomain string) oauth2.Endpoint {
		return oauth2.Endpoint{AuthURL: tokenServer.URL + "/authorize", TokenURL: tokenServer.URL + "/token"}
	}
	env.connectors.identityOverride = func(ctx context.Context, kind string, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
		return "bob@example.com", nil
	}
	env.connectors.SetPublicAPIURL("http://localhost:8080")

	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "salesforce", ClientID: "client-1", ClientSecret: "secret-1",
	}); err != nil {
		t.Fatalf("register app: %v", err)
	}
	authURL, err := env.connectors.BeginConnectorOAuth(context.Background(), member, "salesforce", BeginOAuthParams{
		OrganizationID: env.orgID, Purpose: PurposeAgentAction,
	})
	if err != nil {
		t.Fatalf("begin oauth: %v", err)
	}
	state := mustParseState(t, authURL)

	if _, err := env.connectors.CompleteConnectorOAuth(context.Background(), "salesforce", "fake-code", state); err != nil {
		t.Fatalf("complete oauth: %v", err)
	}

	config, ok, err := env.connectors.AccountConfigForUser(context.Background(), env.orgID, "salesforce", member.User.ID)
	if err != nil {
		t.Fatalf("AccountConfigForUser: %v", err)
	}
	if !ok {
		t.Fatal("expected a captured config for the connected salesforce account")
	}
	var decoded struct {
		InstanceURL string `json:"instance_url"`
	}
	if err := json.Unmarshal([]byte(config), &decoded); err != nil {
		t.Fatalf("decode config: %v", err)
	}
	if decoded.InstanceURL != "https://acme.my.salesforce.com" {
		t.Fatalf("expected instance_url to be captured, got %+v", decoded)
	}
}

func TestAccountConfigForUserNoAccount(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t)
	config, ok, err := env.connectors.AccountConfigForUser(context.Background(), env.orgID, "pipedrive", member.User.ID)
	if err != nil {
		t.Fatalf("AccountConfigForUser: %v", err)
	}
	if ok || config != "" {
		t.Fatalf("expected no config for a user with no connected account, got %q ok=%v", config, ok)
	}
}
