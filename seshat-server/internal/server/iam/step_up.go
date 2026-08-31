package iam

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// stepUpFreshnessTTL is how long a session's last proof of identity (either
// the login itself, or a completed step-up - see Session.ReauthenticatedAt's
// doc comment) is trusted before a sensitive action demands a fresh one
// again. Mirrors GitHub's "sudo mode" window - long enough that a normal
// admin session doing several sensitive actions in a row isn't interrupted
// repeatedly, short enough that a stolen bearer token from hours ago can't
// alone perform one.
const stepUpFreshnessTTL = 15 * time.Minute

// RequireFreshAuth gates a destructive/high-impact action behind a recently
// proven identity - see docs/helps/audit-2026-08-29-openwork-den-comparison.md
// § 9. Call it right after the normal permission check in a sensitive
// action's own service method (DeleteOrganization, DeleteUser,
// DeleteProvider, scim.Service.RotateConnectionToken); a valid bearer token
// alone is not enough for those. Reads principal.Session.ReauthenticatedAt,
// already loaded by ResolvePrincipal for this request - no extra query.
func (s *Service) RequireFreshAuth(principal *Principal) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	if time.Since(principal.Session.ReauthenticatedAt) > stepUpFreshnessTTL {
		return ErrStepUpRequired("this action requires you to confirm your identity again")
	}
	return nil
}

// markSessionReauthenticated is the one place every step-up method (password,
// OIDC, SAML) converges on: stamp the given session (by ID) as having just
// proven fresh identity. Deliberately takes a sessionID rather than a
// *Principal - the OIDC/SAML step-up completion runs from an unauthenticated
// callback request (the browser's redirect back from the identity provider
// carries no bearer token), so there is no Principal to read a Session off
// of at that point; the session to elevate is instead the one recorded on
// the OIDCStepUpState/SAMLStepUpState row when the step-up began.
func markSessionReauthenticated(tx *gorm.DB, sessionID string, now time.Time) error {
	return tx.Model(&sdb.Session{}).Where("id = ?", sessionID).Update("reauthenticated_at", now).Error
}

// requireConsoleRedirectURI validates a step-up's final browser destination
// against this server's configured public app URL - the one web frontend
// origin the operator has already told the server about (reused from
// invitation/password-reset email links, see Service.SetMailer/publicAppURL),
// rather than requireLoopbackRedirectURI's native-app pattern. A step-up's
// only confirmed consumer is a web console session, not the desktop app -
// see docs/helps/audit-2026-08-29-openwork-den-comparison.md § 9. Pinning
// to one exact, operator-configured origin (not a caller-supplied
// allowlist) is what keeps this from being an open redirect.
func (s *Service) requireConsoleRedirectURI(redirectURI string) error {
	redirectURI = strings.TrimSpace(redirectURI)
	if redirectURI == "" {
		return ErrInvalidInput("redirect_uri is required")
	}
	if s.publicAppURL == "" {
		return fmt.Errorf("step-up is not configured: server has no public app URL (see Service.SetMailer)")
	}
	parsed, err := url.Parse(redirectURI)
	if err != nil {
		return ErrInvalidInput("redirect_uri is not a valid URL")
	}
	allowed, err := url.Parse(s.publicAppURL)
	if err != nil {
		return fmt.Errorf("configured public app URL is invalid: %w", err)
	}
	if parsed.Scheme != allowed.Scheme || parsed.Host != allowed.Host {
		return ErrInvalidInput("redirect_uri must match this server's configured public app URL")
	}
	return nil
}

// requireLoopbackOrConsoleRedirectURI is BeginOIDCLogin/BeginSAMLLogin's
// redirect_uri gate - see docs/helps/audit-2026-08-29-openwork-den-comparison.md
// § 9bis. Purely additive relative to requireLoopbackRedirectURI alone: a
// loopback URI (the desktop app's native-app OAuth flow) still always
// passes exactly as before; a URI matching the configured public app URL
// (the web console) is now also accepted, so a login started from
// seshat-console can land back there instead of only a local callback
// server.
func (s *Service) requireLoopbackOrConsoleRedirectURI(redirectURI string) error {
	if err := requireLoopbackRedirectURI(redirectURI); err == nil {
		return nil
	}
	return s.requireConsoleRedirectURI(redirectURI)
}

// StepUpParams carries a self-service password re-verification request -
// same shape as ChangePasswordParams, but proves identity without rotating
// any credential.
type StepUpParams struct {
	CurrentPassword string `json:"current_password"`
}

// StepUpWithPassword re-proves principal's identity by re-checking their
// current password (mirrors ChangePassword's own bcrypt re-verification),
// then marks principal's own session as freshly authenticated. Does not
// work for a user whose PasswordHash is an unguessable random value they've
// never set themselves (an OIDC/SAML/SCIM-provisioned account that has never
// used "forgot password") - such an account needs the OIDC/SAML step-up
// path instead (see step_up_oidc.go/step_up_saml.go), consistent with them
// never being able to log into seshat-console with a password either.
func (s *Service) StepUpWithPassword(ctx context.Context, principal *Principal, params StepUpParams) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	current := strings.TrimSpace(params.CurrentPassword)
	if current == "" {
		return ErrInvalidInput("current_password is required")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.User
		if err := tx.First(&record, "id = ?", principal.User.ID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrUnauthorized("authentication required")
			}
			return err
		}
		if err := bcrypt.CompareHashAndPassword([]byte(record.PasswordHash), []byte(current)); err != nil {
			return ErrUnauthorized("current password is incorrect")
		}
		now := time.Now().UTC()
		if err := markSessionReauthenticated(tx, principal.Session.ID, now); err != nil {
			return err
		}
		orgID, err := primaryOrganizationIDForUser(tx, record.ID)
		if err != nil {
			return err
		}
		return appendAuditEvent(tx, principal, orgID, "user.step_up_verified", "user", record.ID, map[string]string{"method": "password"})
	})
}
