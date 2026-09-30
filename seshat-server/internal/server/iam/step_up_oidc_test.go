package iam

import (
	"context"
	"net/url"
	"testing"
	"time"
)

// stepUpOIDCTestEnv wraps oidcTestEnv with a configured publicAppURL (see
// requireConsoleRedirectURI) - step-up's own redirect validation, distinct
// from login's loopback-only rule.
type stepUpOIDCTestEnv struct {
	oidcTestEnv
	consoleOrigin string
}

func newStepUpOIDCTestEnv(t *testing.T) stepUpOIDCTestEnv {
	t.Helper()
	env := newOIDCTestEnv(t, nil)
	const consoleOrigin = "https://console.internal.test"
	env.service.SetMailer(nil, consoleOrigin)
	return stepUpOIDCTestEnv{oidcTestEnv: env, consoleOrigin: consoleOrigin}
}

func (env stepUpOIDCTestEnv) beginAndExtractStateParams(t *testing.T, principal *Principal) (state, nonce string) {
	t.Helper()
	authorizeURL, err := env.service.BeginOIDCStepUp(context.Background(), principal, env.providerID, env.consoleOrigin+"/step-up-complete")
	if err != nil {
		t.Fatalf("BeginOIDCStepUp: %v", err)
	}
	parsed, err := url.Parse(authorizeURL)
	if err != nil {
		t.Fatalf("parse authorize URL: %v", err)
	}
	return parsed.Query().Get("state"), parsed.Query().Get("nonce")
}

func TestBeginOIDCStepUpRequiresAuthentication(t *testing.T) {
	env := newStepUpOIDCTestEnv(t)
	if _, err := env.service.BeginOIDCStepUp(context.Background(), nil, env.providerID, env.consoleOrigin+"/x"); err == nil {
		t.Fatal("expected an error for a nil principal")
	}
}

func TestBeginOIDCStepUpRejectsNonConsoleRedirect(t *testing.T) {
	env := newStepUpOIDCTestEnv(t)
	if _, err := env.service.BeginOIDCStepUp(context.Background(), env.adminPrincipal, env.providerID, "http://attacker.example.com/callback"); err == nil {
		t.Fatal("expected a redirect_uri outside the configured public app URL to be rejected")
	}
	// A loopback URI (valid for login) must not be accepted here either -
	// step-up validates against publicAppURL, not requireLoopbackRedirectURI.
	if _, err := env.service.BeginOIDCStepUp(context.Background(), env.adminPrincipal, env.providerID, "http://localhost:9999/callback"); err == nil {
		t.Fatal("expected a loopback redirect_uri to be rejected for step-up")
	}
}

func TestCompleteOIDCStepUpMarksExistingSessionFreshWithoutIssuingANewOne(t *testing.T) {
	env := newStepUpOIDCTestEnv(t)
	// Simulate a stale session the same way step_up_test.go does.
	env.adminPrincipal.Session.ReauthenticatedAt = time.Now().UTC().Add(-stepUpFreshnessTTL - time.Minute)
	if err := env.service.RequireFreshAuth(env.adminPrincipal); err == nil {
		t.Fatal("test setup: expected the backdated session to require step-up before proceeding")
	}
	// Persist the backdate for real - RequireFreshAuth above only checked
	// the in-memory copy; the actual session row must be stale too, since
	// completeOIDCStepUp reads it fresh from the database.
	backdateSessionFreshness(t, env.service, env.adminPrincipal.Session.ID)

	state, nonce := env.beginAndExtractStateParams(t, env.adminPrincipal)
	env.idp.nextClaims = map[string]any{
		"email": "admin@example.com", "email_verified": true, "nonce": nonce,
	}

	redirectURL, err := env.service.CompleteOIDCLogin(context.Background(), env.providerID, "fake-code", state)
	if err != nil {
		t.Fatalf("CompleteOIDCLogin (dispatched to step-up): %v", err)
	}
	parsed, err := url.Parse(redirectURL)
	if err != nil {
		t.Fatalf("parse redirect URL: %v", err)
	}
	if got := parsed.Scheme + "://" + parsed.Host + parsed.Path; got != env.consoleOrigin+"/step-up-complete" {
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

func TestCompleteOIDCStepUpRejectsMismatchedIdentity(t *testing.T) {
	env := newStepUpOIDCTestEnv(t)
	backdateSessionFreshness(t, env.service, env.adminPrincipal.Session.ID)

	state, nonce := env.beginAndExtractStateParams(t, env.adminPrincipal)
	env.idp.nextClaims = map[string]any{
		// A different, unrelated identity - even one the IdP is fully
		// willing to vouch for must not be able to elevate someone else's
		// session.
		"email": "someone-else@example.com", "email_verified": true, "nonce": nonce,
	}

	if _, err := env.service.CompleteOIDCLogin(context.Background(), env.providerID, "fake-code", state); err == nil {
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

func TestCompleteOIDCStepUpStateIsSingleUse(t *testing.T) {
	env := newStepUpOIDCTestEnv(t)
	state, nonce := env.beginAndExtractStateParams(t, env.adminPrincipal)
	env.idp.nextClaims = map[string]any{"email": "admin@example.com", "email_verified": true, "nonce": nonce}

	if _, err := env.service.CompleteOIDCLogin(context.Background(), env.providerID, "fake-code", state); err != nil {
		t.Fatalf("first completion: %v", err)
	}
	if _, err := env.service.CompleteOIDCLogin(context.Background(), env.providerID, "fake-code", state); err == nil {
		t.Fatal("expected the same step-up state to be rejected on reuse")
	}
}

// TestCompleteOIDCLoginStillWorksWithAnUnrelatedStepUpPending guards the
// dispatch itself: a pending step-up for one session must never interfere
// with a completely unrelated, concurrent normal login against the same
// provider.
func TestCompleteOIDCLoginStillWorksWithAnUnrelatedStepUpPending(t *testing.T) {
	env := newStepUpOIDCTestEnv(t)
	// Start (but don't complete) a step-up - leaves a pending OIDCStepUpState row.
	env.beginAndExtractStateParams(t, env.adminPrincipal)

	loginState, loginNonce := env.oidcTestEnv.beginAndExtractStateParams(t)
	env.idp.nextClaims = map[string]any{
		"email": "new-employee@example.com", "email_verified": true, "name": "New Employee", "nonce": loginNonce,
	}
	redirectURL, err := env.service.CompleteOIDCLogin(context.Background(), env.providerID, "fake-code", loginState)
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
