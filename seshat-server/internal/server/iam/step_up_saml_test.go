package iam

import (
	"context"
	"net/url"
	"testing"
	"time"

	"github.com/crewjam/saml"
)

// newStepUpSAMLTestEnv wraps newSAMLE2ETestEnv with a configured
// publicAppURL (see requireConsoleRedirectURI) - step-up's own redirect
// validation, distinct from login's loopback-only rule.
func newStepUpSAMLTestEnv(t *testing.T) (samlE2ETestEnv, string) {
	t.Helper()
	env := newSAMLE2ETestEnv(t, nil)
	const consoleOrigin = "https://console.internal.test"
	env.service.SetMailer(nil, consoleOrigin)
	return env, consoleOrigin
}

// stepUp drives one full SP-initiated step-up round trip for principal:
// BeginSAMLStepUp for real (persists a genuine SAMLStepUpState), a real
// HTTP GET to the fake IdP's SSO endpoint, then CompleteSAMLLogin (which
// must dispatch to the step-up path) on the extracted SAMLResponse.
func stepUp(t *testing.T, env samlE2ETestEnv, principal *Principal, email, redirectURI string) (string, error) {
	t.Helper()
	env.idp.sessionProvider.session = &saml.Session{
		NameID: email, NameIDFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:emailAddress", UserEmail: email, CreateTime: time.Now().UTC(),
	}
	redirectURL, err := env.service.BeginSAMLStepUp(context.Background(), principal, env.providerID, redirectURI)
	if err != nil {
		t.Fatalf("BeginSAMLStepUp: %v", err)
	}
	return env.service.CompleteSAMLLogin(context.Background(), env.providerID, fetchSAMLResponse(t, redirectURL))
}

func TestBeginSAMLStepUpRequiresAuthentication(t *testing.T) {
	env, origin := newStepUpSAMLTestEnv(t)
	if _, err := env.service.BeginSAMLStepUp(context.Background(), nil, env.providerID, origin+"/x"); err == nil {
		t.Fatal("expected an error for a nil principal")
	}
}

func TestBeginSAMLStepUpRejectsNonConsoleRedirect(t *testing.T) {
	env, _ := newStepUpSAMLTestEnv(t)
	if _, err := env.service.BeginSAMLStepUp(context.Background(), env.adminPrincipal, env.providerID, "http://attacker.example.com/callback"); err == nil {
		t.Fatal("expected a redirect_uri outside the configured public app URL to be rejected")
	}
	if _, err := env.service.BeginSAMLStepUp(context.Background(), env.adminPrincipal, env.providerID, "http://localhost:9999/callback"); err == nil {
		t.Fatal("expected a loopback redirect_uri to be rejected for step-up")
	}
}

func TestCompleteSAMLStepUpMarksExistingSessionFreshWithoutIssuingANewOne(t *testing.T) {
	env, origin := newStepUpSAMLTestEnv(t)
	backdateSessionFreshness(t, env.service, env.adminPrincipal.Session.ID)

	redirectURL, err := stepUp(t, env, env.adminPrincipal, "admin@example.com", origin+"/step-up-complete")
	if err != nil {
		t.Fatalf("step-up: %v", err)
	}
	parsed, err := url.Parse(redirectURL)
	if err != nil {
		t.Fatalf("parse redirect URL: %v", err)
	}
	if got := parsed.Scheme + "://" + parsed.Host + parsed.Path; got != origin+"/step-up-complete" {
		t.Fatalf("expected redirect back to the stored console destination, got %q", got)
	}
	if parsed.Query().Get("token") != "" {
		t.Fatal("a step-up must never issue a new session token")
	}

	var record struct{ ReauthenticatedAt time.Time }
	if err := env.service.db.Gorm().Table("sessions").Select("reauthenticated_at").
		Where("id = ?", env.adminPrincipal.Session.ID).First(&record).Error; err != nil {
		t.Fatalf("reload session: %v", err)
	}
	if time.Since(record.ReauthenticatedAt) > time.Minute {
		t.Fatalf("expected reauthenticated_at to be freshly updated, got %v", record.ReauthenticatedAt)
	}
}

func TestCompleteSAMLStepUpRejectsMismatchedIdentity(t *testing.T) {
	env, origin := newStepUpSAMLTestEnv(t)
	backdateSessionFreshness(t, env.service, env.adminPrincipal.Session.ID)

	if _, err := stepUp(t, env, env.adminPrincipal, "someone-else@example.com", origin+"/step-up-complete"); err == nil {
		t.Fatal("expected a mismatched identity to be rejected")
	}

	var record struct{ ReauthenticatedAt time.Time }
	if err := env.service.db.Gorm().Table("sessions").Select("reauthenticated_at").
		Where("id = ?", env.adminPrincipal.Session.ID).First(&record).Error; err != nil {
		t.Fatalf("reload session: %v", err)
	}
	if time.Since(record.ReauthenticatedAt) < stepUpFreshnessTTL {
		t.Fatal("expected the session to remain stale after a rejected step-up")
	}
}

func TestCompleteSAMLStepUpRejectsReplayedResponse(t *testing.T) {
	env, origin := newStepUpSAMLTestEnv(t)
	env.idp.sessionProvider.session = &saml.Session{
		NameID: "admin@example.com", NameIDFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:emailAddress",
		UserEmail: "admin@example.com", CreateTime: time.Now().UTC(),
	}
	redirectURL, err := env.service.BeginSAMLStepUp(context.Background(), env.adminPrincipal, env.providerID, origin+"/step-up-complete")
	if err != nil {
		t.Fatalf("BeginSAMLStepUp: %v", err)
	}
	samlResponse := fetchSAMLResponse(t, redirectURL)

	if _, err := env.service.CompleteSAMLLogin(context.Background(), env.providerID, samlResponse); err != nil {
		t.Fatalf("first completion: %v", err)
	}
	if _, err := env.service.CompleteSAMLLogin(context.Background(), env.providerID, samlResponse); err == nil {
		t.Fatal("expected the same step-up response to be rejected on replay")
	}
}

// TestCompleteSAMLLoginStillWorksWithAnUnrelatedStepUpPending guards the
// dispatch itself: a pending step-up for one session must never interfere
// with a completely unrelated, concurrent normal login against the same
// provider (SAML's ParseResponse-based dispatch is more involved than
// OIDC's direct hash lookup - see trySAMLStepUp's own doc comment - so this
// is the one regression this design could plausibly get wrong).
func TestCompleteSAMLLoginStillWorksWithAnUnrelatedStepUpPending(t *testing.T) {
	env, origin := newStepUpSAMLTestEnv(t)
	// Start (but don't complete) a step-up - leaves a pending SAMLStepUpState row.
	env.idp.sessionProvider.session = &saml.Session{
		NameID: "admin@example.com", NameIDFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:emailAddress",
		UserEmail: "admin@example.com", CreateTime: time.Now().UTC(),
	}
	if _, err := env.service.BeginSAMLStepUp(context.Background(), env.adminPrincipal, env.providerID, origin+"/step-up-complete"); err != nil {
		t.Fatalf("BeginSAMLStepUp: %v", err)
	}

	redirectURL, err := env.login(t, "new-employee@example.com", "http://localhost:9999/callback")
	if err != nil {
		t.Fatalf("expected a normal login to succeed despite an unrelated pending step-up: %v", err)
	}
	parsed, err := url.Parse(redirectURL)
	if err != nil {
		t.Fatalf("parse redirect URL: %v", err)
	}
	if parsed.Query().Get("token") == "" {
		t.Fatal("expected a normal login to issue a new session token")
	}
}
