package iam

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// --- pure unit tests, no fake IdP needed ---

func TestRequireLoopbackRedirectURI(t *testing.T) {
	valid := []string{
		"http://localhost:9999/callback",
		"http://127.0.0.1:9999/callback",
		"http://localhost/callback",
	}
	for _, u := range valid {
		if err := requireLoopbackRedirectURI(u); err != nil {
			t.Errorf("expected %q to be accepted, got: %v", u, err)
		}
	}

	invalid := []string{
		"",
		"not-a-url",
		"https://localhost:9999/callback", // https, not http - loopback assumption is http only
		"http://evil.example.com/callback",
		"http://attacker.com/localhost",
	}
	for _, u := range invalid {
		if err := requireLoopbackRedirectURI(u); err == nil {
			t.Errorf("expected %q to be rejected", u)
		}
	}
}

func TestOIDCScopesAlwaysIncludesOpenID(t *testing.T) {
	scopes := oidcScopes(nil)
	if len(scopes) == 0 || scopes[0] != "openid" {
		t.Fatalf("expected openid as first scope, got %+v", scopes)
	}

	scopes = oidcScopes([]string{"openid", "custom"})
	found := map[string]bool{}
	for _, s := range scopes {
		found[s] = true
	}
	if !found["openid"] || !found["custom"] {
		t.Fatalf("expected configured scopes preserved, got %+v", scopes)
	}
	// openid must not be duplicated when the provider already configured it.
	count := 0
	for _, s := range scopes {
		if s == "openid" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("expected exactly one \"openid\" scope, got %d in %+v", count, scopes)
	}
}

// --- fake OIDC identity provider for end-to-end CompleteOIDCLogin coverage ---

// fakeIdP serves a minimal real OIDC discovery document + JWKS + token
// endpoint, RSA-signing genuine ID tokens with go-jose - this exercises
// oidc.go's actual discovery and signature verification path, not a mocked
// bypass of it, which is the entire point of using go-oidc in the first
// place instead of hand-rolling JWT verification.
type fakeIdP struct {
	server     *httptest.Server
	privateKey *rsa.PrivateKey
	nextClaims map[string]any // set per-test before completing the exchange
}

func newFakeIdP(t *testing.T) *fakeIdP {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate RSA key: %v", err)
	}
	idp := &fakeIdP{privateKey: key}

	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"issuer":                                idp.server.URL,
			"authorization_endpoint":                idp.server.URL + "/authorize",
			"token_endpoint":                        idp.server.URL + "/token",
			"jwks_uri":                              idp.server.URL + "/jwks",
			"id_token_signing_alg_values_supported": []string{"RS256"},
		})
	})
	mux.HandleFunc("/jwks", func(w http.ResponseWriter, r *http.Request) {
		set := jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{
			Key: &idp.privateKey.PublicKey, KeyID: "test-key", Algorithm: "RS256", Use: "sig",
		}}}
		_ = json.NewEncoder(w).Encode(set)
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		idToken := idp.signIDToken(t)
		// golang.org/x/oauth2 only parses the response body as JSON when
		// Content-Type says so - otherwise it falls back to form-encoded
		// parsing and silently finds no access_token.
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token": "fake-access-token",
			"id_token":     idToken,
			"token_type":   "Bearer",
			"expires_in":   3600,
		})
	})
	idp.server = httptest.NewServer(mux)
	t.Cleanup(idp.server.Close)
	return idp
}

// signIDToken builds a real RS256-signed JWT from idp.nextClaims, filling in
// iss/aud/exp/iat if the test didn't set them explicitly - callers only need
// to set the claims they're specifically testing (email, nonce, sub, ...).
func (idp *fakeIdP) signIDToken(t *testing.T) string {
	t.Helper()
	claims := map[string]any{}
	for k, v := range idp.nextClaims {
		claims[k] = v
	}
	if _, ok := claims["iss"]; !ok {
		claims["iss"] = idp.server.URL
	}
	if _, ok := claims["aud"]; !ok {
		claims["aud"] = "test-client-id"
	}
	if _, ok := claims["sub"]; !ok {
		claims["sub"] = "fake-subject"
	}
	now := time.Now().UTC()
	claims["iat"] = now.Unix()
	claims["exp"] = now.Add(time.Hour).Unix()

	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: idp.privateKey}, (&jose.SignerOptions{}).WithHeader("kid", "test-key"))
	if err != nil {
		t.Fatalf("create signer: %v", err)
	}
	token, err := jwt.Signed(signer).Claims(claims).Serialize()
	if err != nil {
		t.Fatalf("sign ID token: %v", err)
	}
	return token
}

// oidcTestEnv bootstraps a service + org + an OIDC Provider pointed at a
// fake IdP, ready for BeginOIDCLogin/CompleteOIDCLogin.
type oidcTestEnv struct {
	service        *Service
	adminPrincipal *Principal
	orgID          string
	providerID     string
	idp            *fakeIdP
}

func newOIDCTestEnv(t *testing.T, configure func(*CreateProviderParams)) oidcTestEnv {
	t.Helper()
	service := newTestService(t)
	service.SetPublicAPIURL("http://seshat-server.internal.test")

	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	adminPrincipal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve admin principal: %v", err)
	}
	orgID := boot.Organizations[0].ID

	idp := newFakeIdP(t)
	params := CreateProviderParams{
		OrganizationID: orgID,
		Name:           "Test IdP",
		Slug:           "test-idp",
		Kind:           "oidc",
		ClientID:       "test-client-id",
		ClientSecret:   "test-client-secret",
		IssuerURL:      idp.server.URL,
		AllowSignup:    true,
	}
	if configure != nil {
		configure(&params)
	}
	provider, err := service.CreateProvider(context.Background(), adminPrincipal, params)
	if err != nil {
		t.Fatalf("create provider: %v", err)
	}

	return oidcTestEnv{service: service, adminPrincipal: adminPrincipal, orgID: orgID, providerID: provider.ID, idp: idp}
}

// beginAndExtractStateParams calls BeginOIDCLogin for real (persisting a
// genuine OIDCLoginState row) and parses state/nonce back out of the
// returned authorize URL, so the fake IdP's next token response can embed
// the exact nonce this attempt expects - mirroring what a real IdP would
// echo back from the authorization request it received.
func (env oidcTestEnv) beginAndExtractStateParams(t *testing.T) (state, nonce string) {
	t.Helper()
	authorizeURL, err := env.service.BeginOIDCLogin(context.Background(), env.providerID, "http://localhost:9999/callback")
	if err != nil {
		t.Fatalf("BeginOIDCLogin: %v", err)
	}
	parsed, err := url.Parse(authorizeURL)
	if err != nil {
		t.Fatalf("parse authorize URL: %v", err)
	}
	return parsed.Query().Get("state"), parsed.Query().Get("nonce")
}

func TestBeginOIDCLoginRejectsNonLoopbackRedirect(t *testing.T) {
	env := newOIDCTestEnv(t, nil)
	if _, err := env.service.BeginOIDCLogin(context.Background(), env.providerID, "http://attacker.example.com/callback"); err == nil {
		t.Fatal("expected a non-loopback redirect_uri to be rejected")
	}
}

// TestBeginOIDCLoginAcceptsConsoleRedirectWhenConfigured proves § 9bis's
// change is purely additive: loopback still always works (see the test
// above, unaffected by this), and a redirect_uri matching the configured
// public app URL is now ALSO accepted - the web console's own login flow,
// not just the desktop app's.
func TestBeginOIDCLoginAcceptsConsoleRedirectWhenConfigured(t *testing.T) {
	env := newOIDCTestEnv(t, nil)
	const consoleOrigin = "https://console.internal.test"
	env.service.SetMailer(nil, consoleOrigin)

	if _, err := env.service.BeginOIDCLogin(context.Background(), env.providerID, consoleOrigin+"/auth/sso-callback"); err != nil {
		t.Fatalf("expected a redirect_uri matching the configured public app URL to be accepted, got: %v", err)
	}
	if _, err := env.service.BeginOIDCLogin(context.Background(), env.providerID, "https://attacker.example.com/callback"); err == nil {
		t.Fatal("expected a redirect_uri outside both loopback and the configured public app URL to still be rejected")
	}
}

func TestBeginOIDCLoginRejectsConsoleRedirectWhenNotConfigured(t *testing.T) {
	env := newOIDCTestEnv(t, nil)
	if _, err := env.service.BeginOIDCLogin(context.Background(), env.providerID, "https://console.internal.test/auth/sso-callback"); err == nil {
		t.Fatal("expected a console-style redirect_uri to be rejected when no public app URL is configured")
	}
}

func TestBeginOIDCLoginRejectsUnknownProvider(t *testing.T) {
	env := newOIDCTestEnv(t, nil)
	if _, err := env.service.BeginOIDCLogin(context.Background(), "does-not-exist", "http://localhost:9999/callback"); err == nil {
		t.Fatal("expected an unknown provider_id to be rejected")
	}
}

func TestCompleteOIDCLoginProvisionsNewUserAsPendingMember(t *testing.T) {
	env := newOIDCTestEnv(t, nil)
	state, nonce := env.beginAndExtractStateParams(t)
	env.idp.nextClaims = map[string]any{
		"email": "new-employee@example.com", "email_verified": true, "name": "New Employee", "nonce": nonce,
	}

	redirectURL, err := env.service.CompleteOIDCLogin(context.Background(), env.providerID, "fake-code", state)
	if err != nil {
		t.Fatalf("CompleteOIDCLogin: %v", err)
	}
	parsed, err := url.Parse(redirectURL)
	if err != nil {
		t.Fatalf("parse redirect URL: %v", err)
	}
	if parsed.Scheme != "http" || parsed.Host != "localhost:9999" || parsed.Path != "/callback" {
		t.Fatalf("expected redirect to the original redirect_uri, got %q", redirectURL)
	}
	token := parsed.Query().Get("token")
	if token == "" {
		t.Fatal("expected a session token in the redirect URL")
	}

	principal, err := env.service.ResolvePrincipal(context.Background(), token)
	if err != nil {
		t.Fatalf("resolve principal from issued token: %v", err)
	}
	if principal.User.Email != "new-employee@example.com" {
		t.Fatalf("unexpected user: %+v", principal.User)
	}
	if len(principal.Memberships) != 1 || principal.Memberships[0].OrganizationID != env.orgID || principal.Memberships[0].Status != "pending" {
		t.Fatalf("expected a pending membership in the provider's own organization, got %+v", principal.Memberships)
	}
}

func TestCompleteOIDCLoginRejectsUnverifiedEmail(t *testing.T) {
	env := newOIDCTestEnv(t, nil)
	state, nonce := env.beginAndExtractStateParams(t)
	env.idp.nextClaims = map[string]any{
		"email": "attacker@example.com", "email_verified": false, "nonce": nonce,
	}

	if _, err := env.service.CompleteOIDCLogin(context.Background(), env.providerID, "fake-code", state); err == nil {
		t.Fatal("expected email_verified=false to be rejected")
	}
}

func TestCompleteOIDCLoginRejectsNonceMismatch(t *testing.T) {
	env := newOIDCTestEnv(t, nil)
	state, _ := env.beginAndExtractStateParams(t)
	env.idp.nextClaims = map[string]any{
		"email": "someone@example.com", "email_verified": true, "nonce": "a-completely-different-nonce",
	}

	if _, err := env.service.CompleteOIDCLogin(context.Background(), env.providerID, "fake-code", state); err == nil {
		t.Fatal("expected a nonce mismatch to be rejected")
	}
}

func TestCompleteOIDCLoginStateIsSingleUse(t *testing.T) {
	env := newOIDCTestEnv(t, nil)
	state, nonce := env.beginAndExtractStateParams(t)
	env.idp.nextClaims = map[string]any{
		"email": "someone@example.com", "email_verified": true, "nonce": nonce,
	}

	if _, err := env.service.CompleteOIDCLogin(context.Background(), env.providerID, "fake-code", state); err != nil {
		t.Fatalf("expected the first completion to succeed: %v", err)
	}
	if _, err := env.service.CompleteOIDCLogin(context.Background(), env.providerID, "fake-code", state); err == nil {
		t.Fatal("expected replaying the same state to be rejected")
	}
}

func TestCompleteOIDCLoginRejectsSignupWhenDisabled(t *testing.T) {
	env := newOIDCTestEnv(t, func(p *CreateProviderParams) { p.AllowSignup = false })
	state, nonce := env.beginAndExtractStateParams(t)
	env.idp.nextClaims = map[string]any{
		"email": "nobody-yet@example.com", "email_verified": true, "nonce": nonce,
	}

	if _, err := env.service.CompleteOIDCLogin(context.Background(), env.providerID, "fake-code", state); err == nil {
		t.Fatal("expected signup to be rejected when AllowSignup is false")
	}
}

func TestCompleteOIDCLoginRecordsHealthOnSuccess(t *testing.T) {
	env := newOIDCTestEnv(t, nil)
	state, nonce := env.beginAndExtractStateParams(t)
	env.idp.nextClaims = map[string]any{
		"email": "healthy@example.com", "email_verified": true, "name": "Healthy", "nonce": nonce,
	}
	before := time.Now().UTC()
	if _, err := env.service.CompleteOIDCLogin(context.Background(), env.providerID, "fake-code", state); err != nil {
		t.Fatalf("CompleteOIDCLogin: %v", err)
	}

	provider, err := env.service.GetProvider(context.Background(), env.adminPrincipal, env.providerID)
	if err != nil {
		t.Fatalf("GetProvider: %v", err)
	}
	if provider.LastLoginSuccess == nil || !*provider.LastLoginSuccess {
		t.Fatalf("expected LastLoginSuccess=true, got %+v", provider.LastLoginSuccess)
	}
	if provider.LastLoginAt == nil || provider.LastLoginAt.Before(before) {
		t.Fatalf("expected LastLoginAt to be set to a recent time, got %+v", provider.LastLoginAt)
	}
	if provider.LastError != "" {
		t.Fatalf("expected no LastError after a successful login, got %q", provider.LastError)
	}
}

func TestCompleteOIDCLoginRecordsHealthOnFailure(t *testing.T) {
	env := newOIDCTestEnv(t, func(p *CreateProviderParams) { p.AllowSignup = false })
	state, nonce := env.beginAndExtractStateParams(t)
	env.idp.nextClaims = map[string]any{
		"email": "nobody-yet@example.com", "email_verified": true, "nonce": nonce,
	}
	if _, err := env.service.CompleteOIDCLogin(context.Background(), env.providerID, "fake-code", state); err == nil {
		t.Fatal("expected signup to be rejected when AllowSignup is false")
	}

	provider, err := env.service.GetProvider(context.Background(), env.adminPrincipal, env.providerID)
	if err != nil {
		t.Fatalf("GetProvider: %v", err)
	}
	if provider.LastLoginSuccess == nil || *provider.LastLoginSuccess {
		t.Fatalf("expected LastLoginSuccess=false, got %+v", provider.LastLoginSuccess)
	}
	if provider.LastError == "" {
		t.Fatal("expected a non-empty LastError after a failed login")
	}
}

func TestCompleteOIDCLoginAutoLinksExistingUserWhenAllowed(t *testing.T) {
	env := newOIDCTestEnv(t, func(p *CreateProviderParams) { p.AllowAutoLink = true })
	// Register a password account first, matching the email the fake IdP
	// will later assert.
	if _, err := env.service.Register(context.Background(), RegisterParams{
		Email: "existing@example.com", Password: "password123", DisplayName: "Existing User",
	}); err != nil {
		t.Fatalf("register existing user: %v", err)
	}

	state, nonce := env.beginAndExtractStateParams(t)
	env.idp.nextClaims = map[string]any{
		"email": "existing@example.com", "email_verified": true, "nonce": nonce,
	}
	redirectURL, err := env.service.CompleteOIDCLogin(context.Background(), env.providerID, "fake-code", state)
	if err != nil {
		t.Fatalf("CompleteOIDCLogin: %v", err)
	}

	var userCount int64
	if err := env.service.db.Gorm().Model(&sdb.User{}).Where("email = ?", "existing@example.com").Count(&userCount).Error; err != nil {
		t.Fatalf("count users: %v", err)
	}
	if userCount != 1 {
		t.Fatalf("expected exactly one user for the auto-linked email, got %d (a duplicate account was created instead of linking)", userCount)
	}
	if !strings.Contains(redirectURL, "token=") {
		t.Fatalf("expected a session token in the redirect URL, got %q", redirectURL)
	}
}

func TestCompleteOIDCLoginRejectsAutoLinkWhenDisabled(t *testing.T) {
	env := newOIDCTestEnv(t, func(p *CreateProviderParams) { p.AllowAutoLink = false })
	if _, err := env.service.Register(context.Background(), RegisterParams{
		Email: "existing@example.com", Password: "password123", DisplayName: "Existing User",
	}); err != nil {
		t.Fatalf("register existing user: %v", err)
	}

	state, nonce := env.beginAndExtractStateParams(t)
	env.idp.nextClaims = map[string]any{
		"email": "existing@example.com", "email_verified": true, "nonce": nonce,
	}
	if _, err := env.service.CompleteOIDCLogin(context.Background(), env.providerID, "fake-code", state); err == nil {
		t.Fatal("expected auto-link to be rejected when AllowAutoLink is false, not silently take over the existing password account")
	}
}
