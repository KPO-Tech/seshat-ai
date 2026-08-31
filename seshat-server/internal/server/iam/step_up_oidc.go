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

// BeginOIDCStepUp starts an authorization-code re-authentication for
// principal's own already-existing session - see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 9. Unlike
// BeginOIDCLogin, redirectURI is validated against this server's configured
// public app URL rather than loopback-only: a step-up's only confirmed
// consumer is a web console session, not the desktop app's native-app OAuth
// flow (see requireConsoleRedirectURI's own doc comment).
func (s *Service) BeginOIDCStepUp(ctx context.Context, principal *Principal, providerID, redirectURI string) (string, error) {
	if principal == nil {
		return "", ErrUnauthorized("authentication required")
	}
	providerID = strings.TrimSpace(providerID)
	if providerID == "" {
		return "", ErrInvalidInput("provider_id is required")
	}
	if err := s.requireConsoleRedirectURI(redirectURI); err != nil {
		return "", err
	}
	if s.publicAPIURL == "" {
		return "", fmt.Errorf("oidc step-up is not configured: server has no public API URL (see Service.SetPublicAPIURL)")
	}

	tx := s.db.Gorm().WithContext(ctx)
	var record sdb.Provider
	if err := tx.First(&record, "id = ?", providerID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", ErrNotFound("provider not found")
		}
		return "", err
	}
	if !record.Enabled || record.Kind != "oidc" {
		return "", ErrInvalidInput("provider is not an enabled OIDC provider")
	}

	oauth2Config, err := oidcOAuth2Config(ctx, tx, record, s.oidcRedirectURL(providerID))
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

	stateID, err := newID("oidsu")
	if err != nil {
		return "", err
	}
	now := time.Now().UTC()
	stepUpState := sdb.OIDCStepUpState{
		ID:           stateID,
		ProviderID:   providerID,
		SessionID:    principal.Session.ID,
		UserID:       principal.User.ID,
		StateHash:    sdb.HashOpaqueToken(state),
		CodeVerifier: verifier,
		Nonce:        nonce,
		RedirectURI:  redirectURI,
		CreatedAt:    now,
		ExpiresAt:    now.Add(oidcLoginStateTTL),
	}
	if err := tx.Create(&stepUpState).Error; err != nil {
		return "", err
	}

	return oauth2Config.AuthCodeURL(state, oidc.Nonce(nonce), oauth2.S256ChallengeOption(verifier)), nil
}

// oidcStateIsPendingStepUp is CompleteOIDCLogin's cheap first check - a
// plain existence lookup by the same hash OIDCLoginState is keyed on, no
// token exchange or provider round trip yet. Returning false is the by-far
// common case (a genuine login, or a stale/unknown state that the existing
// login path will itself reject with its own "invalid or expired" error).
func (s *Service) oidcStateIsPendingStepUp(ctx context.Context, state string) (bool, error) {
	var count int64
	err := s.db.Gorm().WithContext(ctx).Model(&sdb.OIDCStepUpState{}).
		Where("state_hash = ?", sdb.HashOpaqueToken(state)).Count(&count).Error
	return count > 0, err
}

// completeOIDCStepUp finishes a step-up started by BeginOIDCStepUp. Unlike
// CompleteOIDCLogin, this never creates or auto-links an account and never
// issues a new session - the resolved identity must belong to the EXACT
// user who started the step-up (stepUpState.UserID), or the whole attempt
// is rejected outright. On success, marks stepUpState.SessionID (the
// existing session, not a new one) as freshly authenticated.
func (s *Service) completeOIDCStepUp(ctx context.Context, providerID, code, state string) (result string, err error) {
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)

		var stepUpState sdb.OIDCStepUpState
		if err := tx.Where("state_hash = ?", sdb.HashOpaqueToken(state)).First(&stepUpState).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrUnauthorized("invalid or expired step-up attempt")
			}
			return err
		}
		// Single-use regardless of outcome below, same as OIDCLoginState.
		if err := tx.Delete(&sdb.OIDCStepUpState{}, "id = ?", stepUpState.ID).Error; err != nil {
			return err
		}
		if stepUpState.ExpiresAt.Before(time.Now().UTC()) || stepUpState.ProviderID != providerID {
			return ErrUnauthorized("invalid or expired step-up attempt")
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

		email, _, err := s.oidcExchangeAndVerifyIdentity(ctx, tx, record, code, stepUpState.CodeVerifier, stepUpState.Nonce)
		if err != nil {
			return err
		}

		user, found, err := findUserByEmail(tx, email)
		if err != nil {
			return err
		}
		if !found || user.ID != stepUpState.UserID {
			// Deliberately the same generic message regardless of which
			// condition failed - never confirm to a caller whether a given
			// email exists as a distinct account from the one being
			// elevated.
			return ErrUnauthorized("this identity does not match the account being verified")
		}

		now := time.Now().UTC()
		if err := markSessionReauthenticated(tx, stepUpState.SessionID, now); err != nil {
			return err
		}
		if err := appendAuditEvent(tx, &Principal{User: toUser(user)}, record.OrganizationID, "user.step_up_verified", "user", user.ID, map[string]string{"method": "oidc", "provider_id": providerID}); err != nil {
			return err
		}

		redirectURL, err := url.Parse(stepUpState.RedirectURI)
		if err != nil {
			return fmt.Errorf("parse stored redirect_uri: %w", err)
		}
		result = redirectURL.String()
		return nil
	})
	return result, err
}
