package iam

import (
	"context"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"encoding/xml"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/crewjam/saml"
	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// samlAuthRequestTTL mirrors oidcLoginStateTTL - a login round trip through
// an identity provider normally takes seconds, not minutes.
const samlAuthRequestTTL = 10 * time.Minute

// BeginSAMLLogin starts an SP-initiated SAML login against providerID,
// returning the URL to redirect the caller's browser to (the IdP's own SSO
// endpoint, per HTTP-Redirect binding). redirectURI is the caller's own
// final destination once login succeeds - same loopback-only restriction
// and same reasoning as BeginOIDCLogin's redirectURI (see its doc comment);
// this is unrelated to any SAML-level URL and never sent to the IdP.
//
// Deliberately does not sign the AuthnRequest (see the staged SAML plan's
// design notes in docs/helps/audit-2026-08-29-openwork-den-comparison.md
// § 4): an unsigned AuthnRequest over HTTP-Redirect binding is valid SAML
// and accepted by the large majority of real IdPs for SP-initiated login,
// and adding SP-side signing would mean a second key pair (generation,
// encrypted storage, rotation) before proving the rest of the flow works.
func (s *Service) BeginSAMLLogin(ctx context.Context, providerID, redirectURI string) (string, error) {
	providerID = strings.TrimSpace(providerID)
	if providerID == "" {
		return "", ErrInvalidInput("provider_id is required")
	}
	if err := requireLoopbackRedirectURI(redirectURI); err != nil {
		return "", err
	}
	if s.publicAPIURL == "" {
		return "", fmt.Errorf("saml login is not configured: server has no public API URL (see Service.SetPublicAPIURL)")
	}

	tx := s.db.Gorm().WithContext(ctx)
	record, err := loadSAMLProvider(tx, providerID)
	if err != nil {
		return "", err
	}
	if !record.Enabled {
		return "", ErrInvalidInput("provider is disabled")
	}

	sp, err := s.samlServiceProvider(providerID, record)
	if err != nil {
		return "", fmt.Errorf("configure SAML service provider: %w", err)
	}

	authnRequest, err := sp.MakeAuthenticationRequest(sp.GetSSOBindingLocation(saml.HTTPRedirectBinding), saml.HTTPRedirectBinding, saml.HTTPPostBinding)
	if err != nil {
		return "", fmt.Errorf("build SAML authentication request: %w", err)
	}
	redirectURL, err := authnRequest.Redirect("", sp)
	if err != nil {
		return "", fmt.Errorf("build SAML redirect: %w", err)
	}

	stateID, err := newID("sam")
	if err != nil {
		return "", err
	}
	now := time.Now().UTC()
	requestState := sdb.SAMLAuthRequestState{
		ID: stateID, ProviderID: providerID, RequestID: authnRequest.ID,
		RedirectURI: redirectURI, CreatedAt: now, ExpiresAt: now.Add(samlAuthRequestTTL),
	}
	if err := tx.Create(&requestState).Error; err != nil {
		return "", err
	}

	return redirectURL.String(), nil
}

// SAMLServiceProviderMetadata returns this server's SP metadata XML for
// providerID - most real IdPs import this to auto-configure the ACS URL and
// entity id on their side, instead of an admin retyping them by hand.
// Public/unauthenticated by convention (see the route registration): it
// contains no secret, just endpoint URLs, the same trust level as OIDC
// discovery documents.
func (s *Service) SAMLServiceProviderMetadata(ctx context.Context, providerID string) ([]byte, error) {
	providerID = strings.TrimSpace(providerID)
	if providerID == "" {
		return nil, ErrInvalidInput("provider_id is required")
	}
	if s.publicAPIURL == "" {
		return nil, fmt.Errorf("saml login is not configured: server has no public API URL (see Service.SetPublicAPIURL)")
	}
	record, err := loadSAMLProvider(s.db.Gorm().WithContext(ctx), providerID)
	if err != nil {
		return nil, err
	}
	sp, err := s.samlServiceProvider(providerID, record)
	if err != nil {
		return nil, fmt.Errorf("configure SAML service provider: %w", err)
	}
	xmlBytes, err := xml.MarshalIndent(sp.Metadata(), "", "  ")
	if err != nil {
		return nil, err
	}
	return xmlBytes, nil
}

// loadSAMLProvider is BeginSAMLLogin/SAMLServiceProviderMetadata's shared
// "find and validate the Provider row" step - deliberately does NOT check
// record.Enabled: an admin should still be able to fetch SP metadata (to
// finish configuring the IdP side) for a provider not yet flipped on, only
// BeginSAMLLogin itself needs Enabled to actually gate the login attempt.
func loadSAMLProvider(tx *gorm.DB, providerID string) (sdb.Provider, error) {
	var record sdb.Provider
	if err := tx.First(&record, "id = ?", providerID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return sdb.Provider{}, ErrNotFound("provider not found")
		}
		return sdb.Provider{}, err
	}
	if record.Kind != "saml" {
		return sdb.Provider{}, ErrInvalidInput("provider is not a SAML provider")
	}
	return record, nil
}

// samlMetadataURL/samlACSURL are per-provider, unlike OIDC's single shared
// redirect route - each Provider row is its own distinct SP-to-IdP
// connection, and a SAML SP's metadata must declare the exact ACS URL the
// IdP will actually post an assertion to, which differs per connection here
// (see the staged plan's design correction: an earlier draft of this plan
// assumed one shared metadata document for every SAML provider, which
// cannot correctly declare more than one ACS URL at a time - caught before
// writing any code, not a bug fixed after the fact).
func (s *Service) samlMetadataURL(providerID string) string {
	return fmt.Sprintf("%s/api/v1/auth/saml/%s/metadata", s.publicAPIURL, providerID)
}

func (s *Service) samlACSURL(providerID string) string {
	return fmt.Sprintf("%s/api/v1/auth/saml/%s/acs", s.publicAPIURL, providerID)
}

// samlServiceProvider builds the crewjam/saml ServiceProvider used for both
// BeginSAMLLogin and CompleteSAMLLogin - this server's own fixed SP
// identity (EntityID deliberately left empty so the library falls back to
// MetadataURL, its own documented convention) plus record's IdP side,
// synthesized from Provider.SSOURL/X509Certificate rather than fetched from
// Provider.MetadataURL (no dynamic metadata fetching in this version - see
// provider_config.go's validation, which already requires sso_url/
// x509_certificate directly for exactly this reason).
func (s *Service) samlServiceProvider(providerID string, record sdb.Provider) (*saml.ServiceProvider, error) {
	metadataURL, err := url.Parse(s.samlMetadataURL(providerID))
	if err != nil {
		return nil, fmt.Errorf("build SP metadata URL: %w", err)
	}
	acsURL, err := url.Parse(s.samlACSURL(providerID))
	if err != nil {
		return nil, fmt.Errorf("build SP ACS URL: %w", err)
	}
	idpMetadata, err := samlIDPMetadata(record)
	if err != nil {
		return nil, err
	}
	return &saml.ServiceProvider{
		MetadataURL: *metadataURL,
		AcsURL:      *acsURL,
		IDPMetadata: idpMetadata,
	}, nil
}

// samlIDPMetadata synthesizes a minimal *saml.EntityDescriptor for
// record's IdP from just Provider.EntityID/SSOURL/X509Certificate - not
// parsed from a real metadata document (see samlServiceProvider's doc
// comment). Accepts X509Certificate as either a full PEM block or a bare
// base64 DER string, since admins paste certificates in both forms in
// practice; either way the certificate is parsed here (not just
// string-matched) so a malformed value fails clearly at connection-build
// time, not with a confusing signature-verification error at actual login.
func samlIDPMetadata(record sdb.Provider) (*saml.EntityDescriptor, error) {
	certDER, err := parseCertificateDER(record.X509Certificate)
	if err != nil {
		return nil, fmt.Errorf("provider x509_certificate: %w", err)
	}
	certBase64 := base64.StdEncoding.EncodeToString(certDER)

	return &saml.EntityDescriptor{
		EntityID: record.EntityID,
		IDPSSODescriptors: []saml.IDPSSODescriptor{
			{
				SSODescriptor: saml.SSODescriptor{
					RoleDescriptor: saml.RoleDescriptor{
						ProtocolSupportEnumeration: "urn:oasis:names:tc:SAML:2.0:protocol",
						KeyDescriptors: []saml.KeyDescriptor{
							{
								Use: "signing",
								KeyInfo: saml.KeyInfo{
									X509Data: saml.X509Data{X509Certificates: []saml.X509Certificate{{Data: certBase64}}},
								},
							},
						},
					},
				},
				SingleSignOnServices: []saml.Endpoint{
					{Binding: saml.HTTPRedirectBinding, Location: record.SSOURL},
				},
			},
		},
	}, nil
}

// parseCertificateDER accepts a certificate as PEM (with or without
// surrounding whitespace) or as a bare base64-encoded DER string, and
// always returns validated DER bytes - never a string that merely "looks
// like" a certificate.
func parseCertificateDER(raw string) ([]byte, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("empty certificate")
	}
	var der []byte
	if block, _ := pem.Decode([]byte(raw)); block != nil {
		der = block.Bytes
	} else {
		compact := strings.Join(strings.Fields(raw), "")
		decoded, err := base64.StdEncoding.DecodeString(compact)
		if err != nil {
			return nil, errors.New("not valid PEM or base64 DER")
		}
		der = decoded
	}
	if _, err := x509.ParseCertificate(der); err != nil {
		return nil, fmt.Errorf("not a valid X.509 certificate: %w", err)
	}
	return der, nil
}
