package iam

import (
	"bytes"
	"compress/flate"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/pem"
	"encoding/xml"
	"html"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/crewjam/saml"
	"github.com/crewjam/saml/logger"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// generateSelfSignedCert produces a throwaway RSA key + self-signed
// certificate for tests, as both parsed Go values and PEM text - SAML
// providers require a real, parseable X.509 certificate (see
// provider_config.go's validation), so a placeholder string won't do, and
// the fake IdP harness below needs the raw key/cert to actually sign with.
func generateSelfSignedCert(t *testing.T) (*rsa.PrivateKey, *x509.Certificate, string) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate RSA key: %v", err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "test-idp"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(24 * time.Hour),
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create certificate: %v", err)
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse generated certificate: %v", err)
	}
	pemStr := string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
	return key, cert, pemStr
}

func selfSignedTestCertPEM(t *testing.T) string {
	t.Helper()
	_, _, pemStr := generateSelfSignedCert(t)
	return pemStr
}

// samlTestEnv bootstraps a service + org + a SAML Provider, ready for
// BeginSAMLLogin/SAMLServiceProviderMetadata.
type samlTestEnv struct {
	service        *Service
	adminPrincipal *Principal
	orgID          string
	providerID     string
	certPEM        string
}

func newSAMLTestEnv(t *testing.T, configure func(*CreateProviderParams)) samlTestEnv {
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

	certPEM := selfSignedTestCertPEM(t)
	params := CreateProviderParams{
		OrganizationID:  orgID,
		Name:            "Test IdP",
		Slug:            "test-idp",
		Kind:            "saml",
		EntityID:        "urn:test-idp:entity",
		SSOURL:          "https://idp.example.com/sso",
		X509Certificate: certPEM,
		AllowSignup:     true,
	}
	if configure != nil {
		configure(&params)
	}
	provider, err := service.CreateProvider(context.Background(), adminPrincipal, params)
	if err != nil {
		t.Fatalf("create provider: %v", err)
	}

	return samlTestEnv{service: service, adminPrincipal: adminPrincipal, orgID: orgID, providerID: provider.ID, certPEM: certPEM}
}

func TestParseCertificateDERAcceptsPEMAndBareBase64(t *testing.T) {
	pemCert := selfSignedTestCertPEM(t)
	derFromPEM, err := parseCertificateDER(pemCert)
	if err != nil {
		t.Fatalf("expected PEM certificate to parse, got: %v", err)
	}

	block, _ := pem.Decode([]byte(pemCert))
	bareBase64 := strings.TrimSpace(pemToBareBase64(t, block.Bytes))
	derFromBare, err := parseCertificateDER(bareBase64)
	if err != nil {
		t.Fatalf("expected bare base64 certificate to parse, got: %v", err)
	}
	if string(derFromPEM) != string(derFromBare) {
		t.Fatal("expected PEM and bare-base64 forms of the same certificate to decode to identical DER bytes")
	}

	if _, err := parseCertificateDER("not a certificate"); err == nil {
		t.Fatal("expected garbage input to be rejected")
	}
	if _, err := parseCertificateDER(""); err == nil {
		t.Fatal("expected empty input to be rejected")
	}
}

func pemToBareBase64(t *testing.T, der []byte) string {
	t.Helper()
	full := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	lines := strings.Split(strings.TrimSpace(string(full)), "\n")
	return strings.Join(lines[1:len(lines)-1], "")
}

func TestBeginSAMLLoginRejectsNonLoopbackRedirect(t *testing.T) {
	env := newSAMLTestEnv(t, nil)
	if _, err := env.service.BeginSAMLLogin(context.Background(), env.providerID, "http://attacker.example.com/callback"); err == nil {
		t.Fatal("expected a non-loopback redirect_uri to be rejected")
	}
}

// TestBeginSAMLLoginAcceptsConsoleRedirectWhenConfigured mirrors the OIDC
// equivalent - see docs/helps/audit-2026-08-29-openwork-den-comparison.md §
// 9bis.
func TestBeginSAMLLoginAcceptsConsoleRedirectWhenConfigured(t *testing.T) {
	env := newSAMLTestEnv(t, nil)
	const consoleOrigin = "https://console.internal.test"
	env.service.SetMailer(nil, consoleOrigin)

	if _, err := env.service.BeginSAMLLogin(context.Background(), env.providerID, consoleOrigin+"/auth/sso-callback"); err != nil {
		t.Fatalf("expected a redirect_uri matching the configured public app URL to be accepted, got: %v", err)
	}
	if _, err := env.service.BeginSAMLLogin(context.Background(), env.providerID, "https://attacker.example.com/callback"); err == nil {
		t.Fatal("expected a redirect_uri outside both loopback and the configured public app URL to still be rejected")
	}
}

func TestBeginSAMLLoginRejectsUnknownProvider(t *testing.T) {
	env := newSAMLTestEnv(t, nil)
	if _, err := env.service.BeginSAMLLogin(context.Background(), "does-not-exist", "http://localhost:9999/callback"); err == nil {
		t.Fatal("expected an unknown provider_id to be rejected")
	}
}

func TestBeginSAMLLoginRejectsDisabledProvider(t *testing.T) {
	env := newSAMLTestEnv(t, nil)
	env.disableProvider(t)
	if _, err := env.service.BeginSAMLLogin(context.Background(), env.providerID, "http://localhost:9999/callback"); err == nil {
		t.Fatal("expected a disabled provider to be rejected")
	}
}

// disableProvider flips env's SAML provider to Enabled=false. UpdateProvider
// replaces the whole record (not a partial patch, see catalog.go's
// UpdateProvider), so every SAML-required field must be resupplied here.
func (env samlTestEnv) disableProvider(t *testing.T) {
	t.Helper()
	disabled := false
	if _, err := env.service.UpdateProvider(context.Background(), env.adminPrincipal, env.providerID, UpdateProviderParams{
		Name: "Test IdP", Slug: "test-idp", Kind: "saml", Enabled: &disabled,
		EntityID: "urn:test-idp:entity", SSOURL: "https://idp.example.com/sso", X509Certificate: env.certPEM,
	}); err != nil {
		t.Fatalf("disable provider: %v", err)
	}
}

func TestBeginSAMLLoginRejectsNonSAMLProvider(t *testing.T) {
	env := newSAMLTestEnv(t, nil)
	oidcProvider, err := env.service.CreateProvider(context.Background(), env.adminPrincipal, CreateProviderParams{
		OrganizationID: env.orgID, Name: "OIDC IdP", Slug: "oidc-idp", Kind: "oidc",
		ClientID: "client", ClientSecret: "secret", IssuerURL: "https://issuer.example.com",
	})
	if err != nil {
		t.Fatalf("create oidc provider: %v", err)
	}
	if _, err := env.service.BeginSAMLLogin(context.Background(), oidcProvider.ID, "http://localhost:9999/callback"); err == nil {
		t.Fatal("expected an OIDC provider to be rejected by BeginSAMLLogin")
	}
}

// TestBeginSAMLLoginBuildsWellFormedRedirect exercises the real crewjam/saml
// AuthnRequest + HTTP-Redirect binding, then decodes SAMLRequest back out to
// confirm the persisted SAMLAuthRequestState.RequestID actually matches
// what was sent - the exact pairing CompleteSAMLLogin's future
// ParseResponse(req, possibleRequestIDs) will depend on.
func TestBeginSAMLLoginBuildsWellFormedRedirect(t *testing.T) {
	env := newSAMLTestEnv(t, nil)
	redirectURL, err := env.service.BeginSAMLLogin(context.Background(), env.providerID, "http://localhost:9999/callback")
	if err != nil {
		t.Fatalf("BeginSAMLLogin: %v", err)
	}

	parsed, err := url.Parse(redirectURL)
	if err != nil {
		t.Fatalf("parse redirect URL: %v", err)
	}
	if parsed.Scheme != "https" || parsed.Host != "idp.example.com" || parsed.Path != "/sso" {
		t.Fatalf("expected a redirect to the configured sso_url, got %q", redirectURL)
	}
	encoded := parsed.Query().Get("SAMLRequest")
	if encoded == "" {
		t.Fatal("expected a SAMLRequest query parameter")
	}

	authnRequest, err := decodeRedirectAuthnRequest(encoded)
	if err != nil {
		t.Fatalf("decode SAMLRequest: %v", err)
	}
	if authnRequest.ID == "" {
		t.Fatal("expected the AuthnRequest to have a non-empty ID")
	}
	if authnRequest.Destination != "https://idp.example.com/sso" {
		t.Fatalf("expected Destination to be the configured sso_url, got %q", authnRequest.Destination)
	}
	if authnRequest.Signature != nil {
		t.Fatal("expected an unsigned AuthnRequest (SP-side signing is not implemented in this version)")
	}

	var stored sdb.SAMLAuthRequestState
	if err := env.service.db.Gorm().First(&stored, "provider_id = ?", env.providerID).Error; err != nil {
		t.Fatalf("load persisted SAMLAuthRequestState: %v", err)
	}
	if stored.RequestID != authnRequest.ID {
		t.Fatalf("expected persisted RequestID %q to match the AuthnRequest ID %q sent to the IdP", stored.RequestID, authnRequest.ID)
	}
	if stored.RedirectURI != "http://localhost:9999/callback" {
		t.Fatalf("unexpected persisted RedirectURI: %q", stored.RedirectURI)
	}
	if !stored.ExpiresAt.After(time.Now().UTC()) {
		t.Fatal("expected ExpiresAt to be in the future")
	}
}

// decodeRedirectAuthnRequest reverses the HTTP-Redirect binding's own
// encoding (base64 + raw DEFLATE, see saml.AuthnRequest.Redirect) so the
// test can inspect the actual XML that was sent to the IdP.
func decodeRedirectAuthnRequest(encodedRequest string) (*saml.AuthnRequest, error) {
	compressed, err := base64.StdEncoding.DecodeString(encodedRequest)
	if err != nil {
		return nil, err
	}
	xmlBytes, err := io.ReadAll(flate.NewReader(bytes.NewReader(compressed)))
	if err != nil {
		return nil, err
	}
	var req saml.AuthnRequest
	if err := xml.Unmarshal(xmlBytes, &req); err != nil {
		return nil, err
	}
	return &req, nil
}

func TestSAMLServiceProviderMetadataIsParsableAndReflectsProvider(t *testing.T) {
	env := newSAMLTestEnv(t, nil)
	xmlBytes, err := env.service.SAMLServiceProviderMetadata(context.Background(), env.providerID)
	if err != nil {
		t.Fatalf("SAMLServiceProviderMetadata: %v", err)
	}

	var descriptor saml.EntityDescriptor
	if err := xml.Unmarshal(xmlBytes, &descriptor); err != nil {
		t.Fatalf("expected valid EntityDescriptor XML, got parse error: %v (body: %s)", err, xmlBytes)
	}
	expectedMetadataURL := "http://seshat-server.internal.test/api/v1/auth/saml/" + env.providerID + "/metadata"
	if descriptor.EntityID != expectedMetadataURL {
		t.Fatalf("expected EntityID to fall back to the per-provider metadata URL %q, got %q", expectedMetadataURL, descriptor.EntityID)
	}
	if len(descriptor.SPSSODescriptors) != 1 {
		t.Fatalf("expected exactly one SPSSODescriptor, got %d", len(descriptor.SPSSODescriptors))
	}
	acs := descriptor.SPSSODescriptors[0].AssertionConsumerServices
	if len(acs) == 0 || acs[0].Location != "http://seshat-server.internal.test/api/v1/auth/saml/"+env.providerID+"/acs" {
		t.Fatalf("expected an AssertionConsumerService pointing at this provider's own ACS URL, got %+v", acs)
	}
}

func TestSAMLServiceProviderMetadataRejectsUnknownProvider(t *testing.T) {
	env := newSAMLTestEnv(t, nil)
	if _, err := env.service.SAMLServiceProviderMetadata(context.Background(), "does-not-exist"); err == nil {
		t.Fatal("expected an unknown provider_id to be rejected")
	}
}

func TestSAMLServiceProviderMetadataAllowsDisabledProvider(t *testing.T) {
	env := newSAMLTestEnv(t, nil)
	env.disableProvider(t)
	if _, err := env.service.SAMLServiceProviderMetadata(context.Background(), env.providerID); err != nil {
		t.Fatalf("expected metadata to remain fetchable for a disabled provider (an admin still finishing IdP-side setup), got: %v", err)
	}
}

// --- fake SAML identity provider for end-to-end CompleteSAMLLogin coverage ---
//
// Mirrors oidc_test.go's fakeIdP: uses crewjam/saml's own real
// IdentityProvider (github.com/crewjam/saml/identity_provider.go) to build
// and sign genuine SAML Responses with a real RSA key, so CompleteSAMLLogin
// exercises its actual signature-verification path against crewjam/saml,
// not a mocked bypass of it.

type fakeSAMLSessionProvider struct {
	session *saml.Session
}

func (p *fakeSAMLSessionProvider) GetSession(w http.ResponseWriter, r *http.Request, req *saml.IdpAuthnRequest) *saml.Session {
	return p.session
}

type fakeSAMLServiceProviderProvider struct {
	entityID string
	metadata *saml.EntityDescriptor
}

func (p fakeSAMLServiceProviderProvider) GetServiceProvider(r *http.Request, serviceProviderID string) (*saml.EntityDescriptor, error) {
	if serviceProviderID != p.entityID {
		return nil, os.ErrNotExist
	}
	return p.metadata, nil
}

type fakeSAMLIdP struct {
	server          *httptest.Server
	sessionProvider *fakeSAMLSessionProvider
}

// newFakeSAMLIdP starts a real HTTP server backing a crewjam/saml
// IdentityProvider configured to trust exactly one service provider -
// spMetadata, this server's own SP metadata for providerID (built the same
// way SAMLServiceProviderMetadata builds it, via samlServiceProvider).
// Returns the IdP's own key material too, since the caller still needs to
// register it as the test Provider's own X509Certificate.
func newFakeSAMLIdP(t *testing.T, spMetadata *saml.EntityDescriptor) (*fakeSAMLIdP, string) {
	t.Helper()
	idpKey, idpCert, idpCertPEM := generateSelfSignedCert(t)

	mux := http.NewServeMux()
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	metadataURL, err := url.Parse(server.URL + "/metadata")
	if err != nil {
		t.Fatalf("parse fake idp metadata url: %v", err)
	}
	ssoURL, err := url.Parse(server.URL + "/sso")
	if err != nil {
		t.Fatalf("parse fake idp sso url: %v", err)
	}

	sessionProvider := &fakeSAMLSessionProvider{}
	idp := &saml.IdentityProvider{
		Key:                     idpKey,
		Certificate:             idpCert,
		Logger:                  logger.DefaultLogger,
		MetadataURL:             *metadataURL,
		SSOURL:                  *ssoURL,
		ServiceProviderProvider: fakeSAMLServiceProviderProvider{entityID: spMetadata.EntityID, metadata: spMetadata},
		SessionProvider:         sessionProvider,
	}
	mux.Handle("/", idp.Handler())

	return &fakeSAMLIdP{server: server, sessionProvider: sessionProvider}, idpCertPEM
}

func (idp *fakeSAMLIdP) metadataURL() string { return idp.server.URL + "/metadata" }
func (idp *fakeSAMLIdP) ssoURL() string      { return idp.server.URL + "/sso" }

// samlE2ETestEnv wires a Service + org + SAML Provider whose EntityID/SSOURL
// point at a real fake IdP (see newFakeSAMLIdP), ready for a full
// BeginSAMLLogin -> (real HTTP round trip to the fake IdP) -> CompleteSAMLLogin
// cycle.
type samlE2ETestEnv struct {
	service        *Service
	adminPrincipal *Principal
	orgID          string
	providerID     string
	idp            *fakeSAMLIdP
}

func newSAMLE2ETestEnv(t *testing.T, configure func(*CreateProviderParams)) samlE2ETestEnv {
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

	// Created first with placeholder EntityID/SSOURL/cert just to obtain a
	// real provider ID: samlServiceProvider's MetadataURL/AcsURL depend only
	// on that ID and s.publicAPIURL, never on these IdP-describing fields
	// (see samlServiceProvider's doc comment), so this SP's own identity -
	// what the fake IdP below needs to trust - is already fixed at this
	// point, before the fake IdP exists to supply the real values.
	_, _, placeholderCertPEM := generateSelfSignedCert(t)
	provider, err := service.CreateProvider(context.Background(), adminPrincipal, CreateProviderParams{
		OrganizationID: orgID, Name: "Test IdP", Slug: "test-idp", Kind: "saml",
		EntityID: "urn:placeholder", SSOURL: "https://placeholder.example.com/sso", X509Certificate: placeholderCertPEM,
	})
	if err != nil {
		t.Fatalf("create placeholder provider: %v", err)
	}

	spMetadata, err := service.samlServiceProvider(provider.ID, sdb.Provider{X509Certificate: placeholderCertPEM, SSOURL: "https://placeholder.example.com/sso"})
	if err != nil {
		t.Fatalf("build SP metadata for fake idp: %v", err)
	}
	idp, idpCertPEM := newFakeSAMLIdP(t, spMetadata.Metadata())

	updateParams := UpdateProviderParams{
		Name: "Test IdP", Slug: "test-idp", Kind: "saml",
		EntityID: idp.metadataURL(), SSOURL: idp.ssoURL(), X509Certificate: idpCertPEM,
		AllowSignup: true,
	}
	if configure != nil {
		// configure mutates a CreateProviderParams for the public test-env
		// signature shared with newSAMLTestEnv/newOIDCTestEnv's convention;
		// only the fields relevant post-creation (allow_signup/allow_auto_link/
		// claim_mappings/allowed_domains) are actually read back out below.
		// Seeded with updateParams' own baseline first so a configure func
		// that only touches one field (e.g. just AllowAutoLink) doesn't
		// silently reset the others to zero values.
		proxy := CreateProviderParams{
			AllowSignup: updateParams.AllowSignup, AllowAutoLink: updateParams.AllowAutoLink,
			ClaimMappings: updateParams.ClaimMappings, AllowedDomains: updateParams.AllowedDomains,
		}
		configure(&proxy)
		updateParams.AllowSignup = proxy.AllowSignup
		updateParams.AllowAutoLink = proxy.AllowAutoLink
		updateParams.ClaimMappings = proxy.ClaimMappings
		updateParams.AllowedDomains = proxy.AllowedDomains
	}
	if _, err := service.UpdateProvider(context.Background(), adminPrincipal, provider.ID, updateParams); err != nil {
		t.Fatalf("point provider at fake idp: %v", err)
	}

	return samlE2ETestEnv{service: service, adminPrincipal: adminPrincipal, orgID: orgID, providerID: provider.ID, idp: idp}
}

// login drives one full SP-initiated round trip for email: BeginSAMLLogin
// for real (persists a genuine SAMLAuthRequestState), a real HTTP GET to
// the fake IdP's SSO endpoint (which validates the AuthnRequest and returns
// a real signed assertion as an auto-submitting HTML form), then
// CompleteSAMLLogin on the extracted SAMLResponse.
func (env samlE2ETestEnv) login(t *testing.T, email, redirectURI string) (string, error) {
	t.Helper()
	env.idp.sessionProvider.session = &saml.Session{
		NameID: email, NameIDFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:emailAddress", UserEmail: email, CreateTime: time.Now().UTC(),
	}

	redirectURL, err := env.service.BeginSAMLLogin(context.Background(), env.providerID, redirectURI)
	if err != nil {
		t.Fatalf("BeginSAMLLogin: %v", err)
	}

	return env.service.CompleteSAMLLogin(context.Background(), env.providerID, fetchSAMLResponse(t, redirectURL))
}

var samlResponseFieldPattern = regexp.MustCompile(`name="SAMLResponse" value="([^"]*)"`)

// fetchSAMLResponse performs a real HTTP GET against the fake IdP's SSO
// endpoint (an HTTP-Redirect-binding AuthnRequest URL, as returned by
// BeginSAMLLogin) and extracts the SAMLResponse value from the auto-submit
// HTML form it returns. The value must be HTML-unescaped before use: the
// form is rendered through html/template (see crewjam/saml's
// defaultResponseFormTemplate), which escapes "+" as "&#43;" in attribute
// values - left un-unescaped, the extracted string is not valid base64 and
// every legitimate response would fail to decode, not just tampered ones.
func fetchSAMLResponse(t *testing.T, ssoRedirectURL string) string {
	t.Helper()
	resp, err := http.Get(ssoRedirectURL) //nolint:gosec // test-only, url is our own generated redirect
	if err != nil {
		t.Fatalf("GET fake idp sso endpoint: %v", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read fake idp response body: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("fake idp sso endpoint returned %d: %s", resp.StatusCode, body)
	}
	match := samlResponseFieldPattern.FindSubmatch(body)
	if match == nil {
		t.Fatalf("could not find SAMLResponse field in fake idp response: %s", body)
	}
	return html.UnescapeString(string(match[1]))
}

func TestCompleteSAMLLoginProvisionsNewUserAsPendingMember(t *testing.T) {
	env := newSAMLE2ETestEnv(t, nil)
	redirectURL, err := env.login(t, "new-employee@example.com", "http://localhost:9999/callback")
	if err != nil {
		t.Fatalf("CompleteSAMLLogin: %v", err)
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

func TestCompleteSAMLLoginRejectsSignupWhenDisabled(t *testing.T) {
	env := newSAMLE2ETestEnv(t, func(p *CreateProviderParams) { p.AllowSignup = false })
	if _, err := env.login(t, "nobody-yet@example.com", "http://localhost:9999/callback"); err == nil {
		t.Fatal("expected signup to be rejected when AllowSignup is false")
	}
}

func TestCompleteSAMLLoginAutoLinksExistingUserWhenAllowed(t *testing.T) {
	env := newSAMLE2ETestEnv(t, func(p *CreateProviderParams) { p.AllowAutoLink = true })
	if _, err := env.service.Register(context.Background(), RegisterParams{
		Email: "existing@example.com", Password: "password123", DisplayName: "Existing User",
	}); err != nil {
		t.Fatalf("register existing user: %v", err)
	}

	redirectURL, err := env.login(t, "existing@example.com", "http://localhost:9999/callback")
	if err != nil {
		t.Fatalf("CompleteSAMLLogin: %v", err)
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

func TestCompleteSAMLLoginRejectsAutoLinkWhenDisabled(t *testing.T) {
	env := newSAMLE2ETestEnv(t, func(p *CreateProviderParams) { p.AllowAutoLink = false })
	if _, err := env.service.Register(context.Background(), RegisterParams{
		Email: "existing@example.com", Password: "password123", DisplayName: "Existing User",
	}); err != nil {
		t.Fatalf("register existing user: %v", err)
	}

	if _, err := env.login(t, "existing@example.com", "http://localhost:9999/callback"); err == nil {
		t.Fatal("expected auto-link to be rejected when AllowAutoLink is false, not silently take over the existing password account")
	}
}

func TestCompleteSAMLLoginRejectsReplayedResponse(t *testing.T) {
	env := newSAMLE2ETestEnv(t, nil)
	env.idp.sessionProvider.session = &saml.Session{
		NameID: "someone@example.com", NameIDFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:emailAddress",
		UserEmail: "someone@example.com", CreateTime: time.Now().UTC(),
	}
	redirectURL, err := env.service.BeginSAMLLogin(context.Background(), env.providerID, "http://localhost:9999/callback")
	if err != nil {
		t.Fatalf("BeginSAMLLogin: %v", err)
	}
	samlResponse := fetchSAMLResponse(t, redirectURL)

	if _, err := env.service.CompleteSAMLLogin(context.Background(), env.providerID, samlResponse); err != nil {
		t.Fatalf("expected the first completion to succeed: %v", err)
	}
	if _, err := env.service.CompleteSAMLLogin(context.Background(), env.providerID, samlResponse); err == nil {
		t.Fatal("expected replaying the same SAMLResponse to be rejected")
	}
}

func TestCompleteSAMLLoginRejectsTamperedAssertion(t *testing.T) {
	env := newSAMLE2ETestEnv(t, nil)
	env.idp.sessionProvider.session = &saml.Session{
		NameID: "attacker@example.com", NameIDFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:emailAddress",
		UserEmail: "attacker@example.com", CreateTime: time.Now().UTC(),
	}
	redirectURL, err := env.service.BeginSAMLLogin(context.Background(), env.providerID, "http://localhost:9999/callback")
	if err != nil {
		t.Fatalf("BeginSAMLLogin: %v", err)
	}
	samlResponse := fetchSAMLResponse(t, redirectURL)

	rawResponse, err := base64.StdEncoding.DecodeString(samlResponse)
	if err != nil {
		t.Fatalf("decode SAMLResponse: %v", err)
	}
	// Flip the identity asserted inside the signed XML without re-signing -
	// this must be rejected by signature verification, not silently accepted.
	tampered := bytes.Replace(rawResponse, []byte("attacker@example.com"), []byte("victim@example.com!!"), 1)
	if bytes.Equal(tampered, rawResponse) {
		t.Fatal("test setup error: tampering did not change the response body")
	}
	tamperedB64 := base64.StdEncoding.EncodeToString(tampered)

	if _, err := env.service.CompleteSAMLLogin(context.Background(), env.providerID, tamperedB64); err == nil {
		t.Fatal("expected a tampered (signature-invalidating) assertion to be rejected")
	}
}

func TestCompleteSAMLLoginRejectsUnknownProvider(t *testing.T) {
	env := newSAMLE2ETestEnv(t, nil)
	if _, err := env.service.CompleteSAMLLogin(context.Background(), "does-not-exist", "irrelevant"); err == nil {
		t.Fatal("expected an unknown provider_id to be rejected")
	}
}

func TestCompleteSAMLLoginRecordsHealthOnSuccess(t *testing.T) {
	env := newSAMLE2ETestEnv(t, nil)
	before := time.Now().UTC()
	if _, err := env.login(t, "healthy@example.com", "http://localhost:9999/callback"); err != nil {
		t.Fatalf("CompleteSAMLLogin: %v", err)
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

func TestCompleteSAMLLoginRecordsHealthOnFailure(t *testing.T) {
	env := newSAMLE2ETestEnv(t, func(p *CreateProviderParams) { p.AllowSignup = false })
	if _, err := env.login(t, "nobody-yet@example.com", "http://localhost:9999/callback"); err == nil {
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

func TestCompleteSAMLLoginAppliesClaimMappings(t *testing.T) {
	env := newSAMLE2ETestEnv(t, func(p *CreateProviderParams) {
		p.ClaimMappings = map[string]string{"email": "urn:oid:0.9.2342.19200300.100.1.3"}
	})
	// NameID is deliberately NOT a usable email here - only the mapped
	// "mail" attribute (which DefaultAssertionMaker populates from
	// Session.UserEmail) should end up as the account's email.
	env.idp.sessionProvider.session = &saml.Session{
		NameID: "opaque-subject-id", NameIDFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:transient",
		UserEmail: "mapped@example.com", CreateTime: time.Now().UTC(),
	}
	redirectURL, err := env.service.BeginSAMLLogin(context.Background(), env.providerID, "http://localhost:9999/callback")
	if err != nil {
		t.Fatalf("BeginSAMLLogin: %v", err)
	}
	samlResponse := fetchSAMLResponse(t, redirectURL)

	redirectURLOut, err := env.service.CompleteSAMLLogin(context.Background(), env.providerID, samlResponse)
	if err != nil {
		t.Fatalf("CompleteSAMLLogin: %v", err)
	}
	parsed, err := url.Parse(redirectURLOut)
	if err != nil {
		t.Fatalf("parse redirect URL: %v", err)
	}
	principal, err := env.service.ResolvePrincipal(context.Background(), parsed.Query().Get("token"))
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	if principal.User.Email != "mapped@example.com" {
		t.Fatalf("expected the ClaimMappings-mapped attribute to be used as the email, got %q", principal.User.Email)
	}
}
