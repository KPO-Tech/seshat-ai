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
	"io"
	"math/big"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/crewjam/saml"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// selfSignedTestCertPEM generates a throwaway self-signed certificate for
// tests - SAML providers require a real, parseable X.509 certificate (see
// provider_config.go's validation), so a placeholder string won't do.
func selfSignedTestCertPEM(t *testing.T) string {
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
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
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
