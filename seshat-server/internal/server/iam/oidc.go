package iam

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// oidcLoginStateTTL is short-lived like passwordResetTokenTTL's sibling
// tokens - a login round trip through an identity provider normally takes
// seconds, not minutes; 10 minutes leaves generous room for a slow consent
// screen without leaving stale rows around for long.
const oidcLoginStateTTL = 10 * time.Minute

// BeginOIDCLogin starts an authorization-code login against providerID,
// returning the URL to redirect the caller's browser to. redirectURI is
// where the caller wants to land once login succeeds (their own final
// destination, e.g. a desktop app's local callback server) - distinct from
// the OAuth2 redirect_uri sent to the identity provider itself, which is
// always this server's own callback route (see oidcRedirectURL).
//
// redirectURI is restricted to loopback (http://localhost or 127.0.0.1) -
// the only confirmed consumer today is the desktop app's connected mode,
// which runs its own local callback receiver. There is no pre-registered
// allowlist to check against otherwise (unlike Application.RedirectURLs, a
// different and currently-unconsumed concept - see oidc.go's package doc
// for why this deliberately doesn't route through Application). Loopback
// redirects don't need one: they're inherently local to the machine the
// browser is already running on, the standard native-app OAuth pattern
// (RFC 8252). Broadening this to other destinations (e.g. a future web
// console) needs its own allowlist design, not a relaxation of this check.
func (s *Service) BeginOIDCLogin(ctx context.Context, providerID, redirectURI string) (string, error) {
	providerID = strings.TrimSpace(providerID)
	if providerID == "" {
		return "", ErrInvalidInput("provider_id is required")
	}
	if err := requireLoopbackRedirectURI(redirectURI); err != nil {
		return "", err
	}
	if s.publicAPIURL == "" {
		return "", fmt.Errorf("oidc login is not configured: server has no public API URL (see Service.SetPublicAPIURL)")
	}

	tx := s.db.Gorm().WithContext(ctx)
	var record sdb.Provider
	if err := tx.First(&record, "id = ?", providerID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", ErrNotFound("provider not found")
		}
		return "", err
	}
	if !record.Enabled {
		return "", ErrInvalidInput("provider is disabled")
	}
	if record.Kind != "oidc" {
		return "", ErrInvalidInput("provider is not an OIDC provider")
	}

	oauth2Config, err := oidcOAuth2Config(ctx, record, s.oidcRedirectURL(providerID))
	if err != nil {
		return "", fmt.Errorf("resolve provider endpoints: %w", err)
	}

	state, err := newToken()
	if err != nil {
		return "", err
	}
	nonce, err := newToken()
	if err != nil {
		return "", err
	}
	verifier := oauth2.GenerateVerifier()

	stateID, err := newID("oid")
	if err != nil {
		return "", err
	}
	now := time.Now().UTC()
	loginState := sdb.OIDCLoginState{
		ID:           stateID,
		ProviderID:   providerID,
		StateHash:    sdb.HashOpaqueToken(state),
		CodeVerifier: verifier,
		Nonce:        nonce,
		RedirectURI:  redirectURI,
		CreatedAt:    now,
		ExpiresAt:    now.Add(oidcLoginStateTTL),
	}
	if err := tx.Create(&loginState).Error; err != nil {
		return "", err
	}

	return oauth2Config.AuthCodeURL(state, oidc.Nonce(nonce), oauth2.S256ChallengeOption(verifier)), nil
}

// CompleteOIDCLogin finishes an authorization-code login started by
// BeginOIDCLogin, exchanging code for tokens, verifying the ID token, and
// resolving or provisioning the local account. Returns the caller's
// original redirectURI with the new session token appended, or an error -
// callers (the HTTP handler) are expected to redirect the browser there
// either way, appending ?error=... instead when err is non-nil and a
// redirect destination could still be recovered.
func (s *Service) CompleteOIDCLogin(ctx context.Context, providerID, code, state string) (string, error) {
	providerID = strings.TrimSpace(providerID)
	code = strings.TrimSpace(code)
	state = strings.TrimSpace(state)
	if providerID == "" || code == "" || state == "" {
		return "", ErrInvalidInput("provider_id, code and state are required")
	}

	var result string
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)

		var loginState sdb.OIDCLoginState
		if err := tx.Where("state_hash = ?", sdb.HashOpaqueToken(state)).First(&loginState).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrUnauthorized("invalid or expired login attempt")
			}
			return err
		}
		// Single-use regardless of outcome below - a state value must never
		// be redeemable twice, success or failure.
		if err := tx.Delete(&sdb.OIDCLoginState{}, "id = ?", loginState.ID).Error; err != nil {
			return err
		}
		if loginState.ExpiresAt.Before(time.Now().UTC()) {
			return ErrUnauthorized("invalid or expired login attempt")
		}
		if loginState.ProviderID != providerID {
			return ErrUnauthorized("invalid or expired login attempt")
		}

		var record sdb.Provider
		if err := tx.First(&record, "id = ?", providerID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("provider not found")
			}
			return err
		}
		if !record.Enabled || record.Kind != "oidc" {
			return ErrInvalidInput("provider is not an enabled OIDC provider")
		}

		oidcProvider, err := oidc.NewProvider(ctx, record.IssuerURL)
		if err != nil {
			return fmt.Errorf("resolve provider endpoints: %w", err)
		}
		clientSecret, err := sdb.DecryptSecret(record.ClientSecret)
		if err != nil {
			return fmt.Errorf("decrypt provider client secret: %w", err)
		}
		oauth2Config := &oauth2.Config{
			ClientID:     record.ClientID,
			ClientSecret: clientSecret,
			Endpoint:     oidcProvider.Endpoint(),
			RedirectURL:  s.oidcRedirectURL(providerID),
			Scopes:       oidcScopes(record.Scopes),
		}

		oauth2Token, err := oauth2Config.Exchange(ctx, code, oauth2.VerifierOption(loginState.CodeVerifier))
		if err != nil {
			return ErrUnauthorized("failed to exchange authorization code: " + err.Error())
		}
		rawIDToken, ok := oauth2Token.Extra("id_token").(string)
		if !ok || rawIDToken == "" {
			return ErrUnauthorized("identity provider did not return an ID token")
		}
		idToken, err := oidcProvider.Verifier(&oidc.Config{ClientID: record.ClientID}).Verify(ctx, rawIDToken)
		if err != nil {
			return ErrUnauthorized("invalid ID token: " + err.Error())
		}
		// go-oidc deliberately does not verify Nonce itself (see IDToken's
		// doc comment) - this is the caller's responsibility, and it's the
		// only defense against a replayed authorization response.
		if idToken.Nonce != loginState.Nonce {
			return ErrUnauthorized("invalid ID token: nonce mismatch")
		}

		var claims struct {
			Email         string `json:"email"`
			EmailVerified bool   `json:"email_verified"`
			Name          string `json:"name"`
		}
		if err := idToken.Claims(&claims); err != nil {
			return fmt.Errorf("parse ID token claims: %w", err)
		}
		email, displayName := oidcMappedIdentity(record.ClaimMappings, claims.Email, claims.Name, idToken)
		email = normalizeEmail(email)
		if email == "" {
			return ErrUnauthorized("identity provider did not return an email claim")
		}
		// An IdP that hasn't verified the email must never be trusted to
		// auto-link or provision an account: without this check, an
		// attacker could register the victim's email at a lenient IdP
		// (never proving they control it) and be treated as that user.
		// Absent claim (some IdPs omit it) is treated as verified, matching
		// common OIDC RP practice - only an explicit false is rejected.
		if !claims.EmailVerified {
			var hasClaim bool
			var raw map[string]any
			if err := idToken.Claims(&raw); err == nil {
				_, hasClaim = raw["email_verified"]
			}
			if hasClaim {
				return ErrUnauthorized("identity provider has not verified this email address")
			}
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
			// PasswordHash can never be left empty (not-null column) and
			// must never be guessable - hashing a fresh random token makes
			// password login on this account cryptographically impossible,
			// not just unlikely, without needing a separate "has no
			// password" column that every other auth path would need to
			// remember to check.
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
			if err := oidcAutoJoinOrganization(tx, user, record, now); err != nil {
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
		if err := appendAuditEvent(tx, &Principal{User: toUser(user)}, record.OrganizationID, "oidc_login.succeeded", "user", user.ID, map[string]string{"email": email, "provider_id": providerID}); err != nil {
			return err
		}

		redirectURL, err := url.Parse(loginState.RedirectURI)
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

// oidcAutoJoinOrganization mirrors Register's domain-matched auto-join
// (service.go's Register, same "pending" trust model) but keyed off the
// provider's own OrganizationID rather than a domain lookup - a provider is
// already scoped to one organization (whoever configured it), so anyone who
// successfully authenticates through it is presumptively that org's member.
// AllowedDomains, when set, narrows this further; an email outside it joins
// no organization (the account still exists, matching Register's own
// no-domain-match behavior).
func oidcAutoJoinOrganization(tx *gorm.DB, user sdb.User, provider sdb.Provider, now time.Time) error {
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
	return appendAuditEvent(tx, nil, provider.OrganizationID, "membership.oidc_provisioned", "membership", membership.ID, map[string]string{"user_id": user.ID, "email": user.Email})
}

// oidcMappedIdentity applies Provider.ClaimMappings (custom claim names, for
// IdPs that don't use the standard "email"/"name" claims) before falling
// back to the already-parsed standard claims.
func oidcMappedIdentity(claimMappings map[string]string, standardEmail, standardName string, idToken *oidc.IDToken) (email, displayName string) {
	email, displayName = standardEmail, standardName
	if claimMappings == nil {
		return email, displayName
	}
	var raw map[string]any
	if err := idToken.Claims(&raw); err != nil {
		return email, displayName
	}
	if claim, ok := claimMappings["email"]; ok {
		if v, ok := raw[claim].(string); ok && v != "" {
			email = v
		}
	}
	if claim, ok := claimMappings["name"]; ok {
		if v, ok := raw[claim].(string); ok && v != "" {
			displayName = v
		}
	}
	return email, displayName
}

func oidcScopes(configured []string) []string {
	scopes := []string{oidc.ScopeOpenID}
	for _, scope := range configured {
		scope = strings.TrimSpace(scope)
		if scope != "" && scope != oidc.ScopeOpenID {
			scopes = append(scopes, scope)
		}
	}
	if len(configured) == 0 {
		scopes = append(scopes, "profile", "email")
	}
	return scopes
}

// oidcRedirectURL is always this server's own callback route - what the
// identity provider redirects the browser back to - never the caller's
// final destination (see BeginOIDCLogin's doc comment).
func (s *Service) oidcRedirectURL(providerID string) string {
	return fmt.Sprintf("%s/api/v1/auth/oidc/%s/callback", s.publicAPIURL, providerID)
}

// oidcOAuth2Config resolves endpoints via OIDC discovery only (record.IssuerURL)
// - not the explicit AuthorizationURL/TokenURL/JWKSURL fields also present
// on Provider. ID token verification needs JWKS keyed to a known issuer;
// supporting a discovery-less path safely would mean handling a
// skip-issuer-check verifier as a separate, weaker code path. Every
// mainstream OIDC provider (Google, Okta, Azure AD, Auth0, Keycloak...)
// supports standard discovery, so this covers the real-world case without
// that extra risk. The explicit fields remain on the model for a future
// non-discovery flow (e.g. SAML), not this one.
func oidcOAuth2Config(ctx context.Context, record sdb.Provider, redirectURL string) (*oauth2.Config, error) {
	if record.IssuerURL == "" {
		return nil, fmt.Errorf("provider has no issuer_url configured - OIDC login requires discovery")
	}
	oidcProvider, err := oidc.NewProvider(ctx, record.IssuerURL)
	if err != nil {
		return nil, err
	}
	clientSecret, err := sdb.DecryptSecret(record.ClientSecret)
	if err != nil {
		return nil, fmt.Errorf("decrypt provider client secret: %w", err)
	}
	return &oauth2.Config{
		ClientID:     record.ClientID,
		ClientSecret: clientSecret,
		Endpoint:     oidcProvider.Endpoint(),
		RedirectURL:  redirectURL,
		Scopes:       oidcScopes(record.Scopes),
	}, nil
}

// requireLoopbackRedirectURI enforces the native-app OAuth redirect pattern
// (RFC 8252) - see BeginOIDCLogin's doc comment for why this is the chosen
// validation instead of a pre-registered allowlist.
func requireLoopbackRedirectURI(redirectURI string) error {
	redirectURI = strings.TrimSpace(redirectURI)
	if redirectURI == "" {
		return ErrInvalidInput("redirect_uri is required")
	}
	parsed, err := url.Parse(redirectURI)
	if err != nil {
		return ErrInvalidInput("redirect_uri is not a valid URL")
	}
	if parsed.Scheme != "http" {
		return ErrInvalidInput("redirect_uri must use http (loopback only)")
	}
	host := parsed.Hostname()
	if host != "localhost" && host != "127.0.0.1" && host != "::1" {
		return ErrInvalidInput("redirect_uri must be a loopback address (localhost or 127.0.0.1)")
	}
	return nil
}
