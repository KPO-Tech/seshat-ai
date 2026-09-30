package iam

import (
	"context"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"encoding/xml"
	"errors"
	"fmt"
	"net/http"
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
// final destination once login succeeds - same loopback-or-console
// restriction and same reasoning as BeginOIDCLogin's redirectURI (see its
// doc comment); this is unrelated to any SAML-level URL and never sent to
// the IdP.
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
	if err := s.requireLoopbackOrConsoleRedirectURI(redirectURI); err != nil {
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

// CompleteSAMLLogin finishes an SP-initiated login started by
// BeginSAMLLogin: validates the IdP's SAMLResponse (signature against
// Provider.X509Certificate, InResponseTo against the still-pending
// SAMLAuthRequestState rows for this provider, assertion timing), then
// resolves or provisions the local account. Mirrors CompleteOIDCLogin's
// decision tree exactly (auto-link/auto-signup/auto-join, redirect_uri
// recovery only on success) - see its doc comment for the general shape.
//
// Unlike OIDC there is no separate "email_verified" claim to check: SAML's
// equivalent trust boundary is the assertion's digital signature itself -
// once crewjam/saml's ParseResponse confirms the assertion was signed by
// the certificate configured on this Provider, the identity it asserts is
// as trustworthy as that IdP is configured to be trusted.
//
// samlResponseBase64 is the raw base64 "SAMLResponse" form field from the
// IdP's HTTP-POST to the ACS endpoint - passed as a string, not a
// *http.Request, so this package doesn't need to depend on net/http
// request plumbing the way the HTTP handler layer already does.
func (s *Service) CompleteSAMLLogin(ctx context.Context, providerID, samlResponseBase64 string) (result string, err error) {
	providerID = strings.TrimSpace(providerID)
	samlResponseBase64 = strings.TrimSpace(samlResponseBase64)
	if providerID == "" || samlResponseBase64 == "" {
		return "", ErrInvalidInput("provider_id and SAMLResponse are required")
	}
	// A step-up in progress (see step_up_saml.go) reuses this exact same ACS
	// route rather than a separate one - same reasoning as
	// CompleteOIDCLogin's own pre-check. Unlike OIDC's direct state-hash
	// lookup, SAML has no cheap way to know in advance which pending
	// request a response answers (see samlAssertionInResponseTo's own doc
	// comment) - trySAMLStepUp parses the response once against pending
	// step-up requests only, and reports "not handled" (never an error) so
	// this function's own unchanged login path gets a fair, un-short-
	// circuited attempt at the same response.
	if redirectURL, handled, err := s.trySAMLStepUp(ctx, providerID, samlResponseBase64); err != nil {
		return "", err
	} else if handled {
		return redirectURL, nil
	}
	defer func() { s.recordProviderLoginAttempt(providerID, err) }()

	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)

		record, err := loadSAMLProvider(tx, providerID)
		if err != nil {
			return err
		}
		if !record.Enabled {
			return ErrInvalidInput("provider is disabled")
		}

		sp, err := s.samlServiceProvider(providerID, record)
		if err != nil {
			return fmt.Errorf("configure SAML service provider: %w", err)
		}

		var pending []sdb.SAMLAuthRequestState
		if err := tx.Where("provider_id = ? AND expires_at > ?", providerID, time.Now().UTC()).Find(&pending).Error; err != nil {
			return err
		}
		if len(pending) == 0 {
			return ErrUnauthorized("invalid or expired login attempt")
		}
		possibleRequestIDs := make([]string, len(pending))
		for i, p := range pending {
			possibleRequestIDs[i] = p.RequestID
		}

		fakeRequest := &http.Request{
			Method:   "POST",
			URL:      &url.URL{},
			PostForm: url.Values{"SAMLResponse": {samlResponseBase64}},
		}
		assertion, err := sp.ParseResponse(fakeRequest, possibleRequestIDs)
		if err != nil {
			return ErrUnauthorized("invalid SAML response")
		}

		// The request this response answers - ParseResponse already
		// confirmed InResponseTo matches one of possibleRequestIDs, so this
		// lookup can only fail if two rows raced to the same RequestID,
		// which the column's uniqueIndex already makes impossible.
		inResponseTo := samlAssertionInResponseTo(assertion)
		var matched *sdb.SAMLAuthRequestState
		for i := range pending {
			if pending[i].RequestID == inResponseTo {
				matched = &pending[i]
				break
			}
		}
		if matched == nil {
			return ErrUnauthorized("invalid or expired login attempt")
		}
		// Single-use: deleted only now, after a fully validated response,
		// not upfront like OIDCLoginState - unlike OIDC's state token
		// (looked up directly by hash), a SAML request ID can only be
		// identified as "the one this response answers" after ParseResponse
		// has already verified it, so there is no earlier point at which to
		// safely burn it without also blocking a legitimate retry after a
		// transient failure.
		if err := tx.Delete(&sdb.SAMLAuthRequestState{}, "id = ?", matched.ID).Error; err != nil {
			return err
		}

		if assertion.Subject == nil || assertion.Subject.NameID == nil || strings.TrimSpace(assertion.Subject.NameID.Value) == "" {
			return ErrUnauthorized("assertion did not include a NameID")
		}
		email, displayName := samlMappedIdentity(record.ClaimMappings, assertion.Subject.NameID.Value, assertion.AttributeStatements)
		email = normalizeEmail(email)
		if email == "" {
			return ErrUnauthorized("identity provider did not return a usable identity")
		}

		existing, found, err := findUserByEmail(tx, email)
		if err != nil {
			return err
		}

		var user sdb.User
		now := time.Now().UTC()
		switch {
		case found && record.AllowAutoLink:
			user = existing
		case found && !record.AllowAutoLink:
			return ErrForbidden("an account with this email already exists; auto-linking is disabled for this provider")
		case !found && record.AllowSignup:
			if displayName == "" {
				displayName = email
			}
			randomPassword, err := newToken()
			if err != nil {
				return err
			}
			passwordHash, err := hashPassword(randomPassword)
			if err != nil {
				return fmt.Errorf("hash password: %w", err)
			}
			userID, err := newID("usr")
			if err != nil {
				return err
			}
			user = sdb.User{
				ID: userID, Email: email, DisplayName: displayName, PasswordHash: passwordHash,
				CreatedAt: now, UpdatedAt: now,
			}
			if err := tx.Create(&user).Error; err != nil {
				return err
			}
		default:
			return ErrForbidden("no account exists for this identity and signup is disabled for this provider")
		}

		if !found {
			if err := samlAutoJoinOrganization(tx, user, record, now); err != nil {
				return err
			}
		}

		session, rawToken, err := s.newSession(user.ID, now)
		if err != nil {
			return err
		}
		if err := tx.Create(&session).Error; err != nil {
			return err
		}
		if err := appendAuditEvent(tx, &Principal{User: toUser(user)}, record.OrganizationID, "saml_login.succeeded", "user", user.ID, map[string]string{"email": email, "provider_id": providerID}); err != nil {
			return err
		}

		redirectURL, err := url.Parse(matched.RedirectURI)
		if err != nil {
			return fmt.Errorf("parse stored redirect_uri: %w", err)
		}
		query := redirectURL.Query()
		query.Set("token", rawToken)
		redirectURL.RawQuery = query.Encode()
		result = redirectURL.String()
		return nil
	})
	return result, err
}

// samlAssertionInResponseTo reads the request-correlator crewjam/saml
// stamps onto a validated assertion's SubjectConfirmationData - the SAML
// equivalent of an OIDC state parameter, but only readable after the
// library has already verified it matches one of the candidate ids we gave
// ParseResponse (see CompleteSAMLLogin).
func samlAssertionInResponseTo(assertion *saml.Assertion) string {
	if assertion.Subject == nil {
		return ""
	}
	for _, confirmation := range assertion.Subject.SubjectConfirmations {
		if confirmation.SubjectConfirmationData != nil && confirmation.SubjectConfirmationData.InResponseTo != "" {
			return confirmation.SubjectConfirmationData.InResponseTo
		}
	}
	return ""
}

// samlAutoJoinOrganization is oidcAutoJoinOrganization's SAML twin - same
// provider-scoped "pending" auto-join, same AllowedDomains narrowing, kept
// as a separate small function (not shared code) so each protocol's own
// audit event name/action string stays a literal, grep-able string at its
// call site rather than a parameter threaded through a shared helper.
func samlAutoJoinOrganization(tx *gorm.DB, user sdb.User, provider sdb.Provider, now time.Time) error {
	if len(provider.AllowedDomains) > 0 {
		domain := emailDomain(user.Email)
		allowed := false
		for _, d := range provider.AllowedDomains {
			if strings.EqualFold(strings.TrimSpace(d), domain) {
				allowed = true
				break
			}
		}
		if !allowed {
			return nil
		}
	}
	membershipID, err := newID("mem")
	if err != nil {
		return err
	}
	membership := sdb.Membership{
		ID: membershipID, UserID: user.ID, OrganizationID: provider.OrganizationID, Role: "member",
		Status: "pending", PendingSince: &now, CreatedAt: now,
	}
	if err := tx.Create(&membership).Error; err != nil {
		return err
	}
	return appendAuditEvent(tx, nil, provider.OrganizationID, "membership.saml_provisioned", "membership", membership.ID, map[string]string{"user_id": user.ID, "email": user.Email})
}

// samlMappedIdentity mirrors oidcMappedIdentity: Provider.ClaimMappings
// (custom attribute names, for IdPs that don't put email/name in NameID)
// override the default of treating NameID itself as the email - the
// convention this codebase already documented in the SAML plan (NameID, or
// a ClaimMappings-mapped attribute, as the email source).
func samlMappedIdentity(claimMappings map[string]string, nameID string, attributeStatements []saml.AttributeStatement) (email, displayName string) {
	email = nameID
	if claimMappings == nil {
		return email, displayName
	}
	if claim, ok := claimMappings["email"]; ok {
		if v := samlFirstAttributeValue(attributeStatements, claim); v != "" {
			email = v
		}
	}
	if claim, ok := claimMappings["name"]; ok {
		if v := samlFirstAttributeValue(attributeStatements, claim); v != "" {
			displayName = v
		}
	}
	return email, displayName
}

// samlFirstAttributeValue looks up attrName by Name or FriendlyName across
// every AttributeStatement (a validated assertion may have more than one),
// returning the first value of the first match.
func samlFirstAttributeValue(attributeStatements []saml.AttributeStatement, attrName string) string {
	for _, statement := range attributeStatements {
		for _, attr := range statement.Attributes {
			if attr.Name != attrName && attr.FriendlyName != attrName {
				continue
			}
			if len(attr.Values) > 0 {
				return attr.Values[0].Value
			}
		}
	}
	return ""
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
