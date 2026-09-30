package iam

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/crewjam/saml"
	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// BeginSAMLStepUp starts an SP-initiated SAML re-authentication for
// principal's own already-existing session - SAML's counterpart to
// BeginOIDCStepUp (see its doc comment for the redirect_uri validation
// difference from BeginSAMLLogin, and
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 9 generally).
func (s *Service) BeginSAMLStepUp(ctx context.Context, principal *Principal, providerID, redirectURI string) (string, error) {
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
		return "", ErrInvalidInput("saml step-up is not configured: server has no public API URL")
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
		return "", err
	}
	authnRequest, err := sp.MakeAuthenticationRequest(sp.GetSSOBindingLocation(saml.HTTPRedirectBinding), saml.HTTPRedirectBinding, saml.HTTPPostBinding)
	if err != nil {
		return "", err
	}
	redirectURL, err := authnRequest.Redirect("", sp)
	if err != nil {
		return "", err
	}

	stateID, err := newID("samsu")
	if err != nil {
		return "", err
	}
	now := time.Now().UTC()
	stepUpState := sdb.SAMLStepUpState{
		ID: stateID, ProviderID: providerID, SessionID: principal.Session.ID, UserID: principal.User.ID,
		RequestID: authnRequest.ID, RedirectURI: redirectURI, CreatedAt: now, ExpiresAt: now.Add(samlAuthRequestTTL),
	}
	if err := tx.Create(&stepUpState).Error; err != nil {
		return "", err
	}
	return redirectURL.String(), nil
}

// trySAMLStepUp is CompleteSAMLLogin's pre-check. Returns handled=false
// (never an error) whenever samlResponseBase64 simply doesn't answer a
// pending step-up request - the overwhelmingly common case, since a normal
// login response will never match a step-up's InResponseTo - so
// CompleteSAMLLogin's own unchanged body gets a fair, un-short-circuited
// attempt at it.
func (s *Service) trySAMLStepUp(ctx context.Context, providerID, samlResponseBase64 string) (result string, handled bool, err error) {
	tx := s.db.Gorm().WithContext(ctx)
	var pending []sdb.SAMLStepUpState
	if err := tx.Where("provider_id = ? AND expires_at > ?", providerID, time.Now().UTC()).Find(&pending).Error; err != nil {
		return "", false, err
	}
	if len(pending) == 0 {
		return "", false, nil
	}

	record, err := loadSAMLProvider(tx, providerID)
	if err != nil || !record.Enabled {
		// Not this function's job to report why login should fail - let
		// CompleteSAMLLogin's own unchanged body produce that error.
		return "", false, nil
	}
	sp, err := s.samlServiceProvider(providerID, record)
	if err != nil {
		return "", false, nil
	}

	possibleRequestIDs := make([]string, len(pending))
	for i, p := range pending {
		possibleRequestIDs[i] = p.RequestID
	}
	fakeRequest := &http.Request{Method: "POST", URL: &url.URL{}, PostForm: url.Values{"SAMLResponse": {samlResponseBase64}}}
	assertion, err := sp.ParseResponse(fakeRequest, possibleRequestIDs)
	if err != nil {
		return "", false, nil
	}
	inResponseTo := samlAssertionInResponseTo(assertion)
	var matched *sdb.SAMLStepUpState
	for i := range pending {
		if pending[i].RequestID == inResponseTo {
			matched = &pending[i]
			break
		}
	}
	if matched == nil {
		return "", false, nil
	}

	result, err = s.finishSAMLStepUp(ctx, record, assertion, *matched)
	return result, true, err
}

// finishSAMLStepUp mirrors CompleteSAMLLogin's post-ParseResponse identity
// extraction, but never creates or auto-links an account and never issues a
// new session: the resolved identity must belong to the EXACT user who
// started the step-up (matched.UserID), or the whole attempt is rejected.
// On success, marks matched.SessionID (the existing session, not a new
// one) as freshly authenticated.
func (s *Service) finishSAMLStepUp(ctx context.Context, record sdb.Provider, assertion *saml.Assertion, matched sdb.SAMLStepUpState) (result string, err error) {
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		// Single-use regardless of outcome below, same as SAMLAuthRequestState.
		if err := tx.Delete(&sdb.SAMLStepUpState{}, "id = ?", matched.ID).Error; err != nil {
			return err
		}

		if assertion.Subject == nil || assertion.Subject.NameID == nil || strings.TrimSpace(assertion.Subject.NameID.Value) == "" {
			return ErrUnauthorized("assertion did not include a NameID")
		}
		email, _ := samlMappedIdentity(record.ClaimMappings, assertion.Subject.NameID.Value, assertion.AttributeStatements)
		email = normalizeEmail(email)
		if email == "" {
			return ErrUnauthorized("identity provider did not return a usable identity")
		}

		user, found, err := findUserByEmail(tx, email)
		if err != nil {
			return err
		}
		if !found || user.ID != matched.UserID {
			// Deliberately the same generic message regardless of which
			// condition failed - never confirm to a caller whether a given
			// email exists as a distinct account from the one being elevated.
			return ErrUnauthorized("this identity does not match the account being verified")
		}

		now := time.Now().UTC()
		if err := markSessionReauthenticated(tx, matched.SessionID, now); err != nil {
			return err
		}
		if err := appendAuditEvent(tx, &Principal{User: toUser(user)}, record.OrganizationID, "user.step_up_verified", "user", user.ID, map[string]string{"method": "saml", "provider_id": record.ID}); err != nil {
			return err
		}

		redirectURL, err := url.Parse(matched.RedirectURI)
		if err != nil {
			return err
		}
		result = redirectURL.String()
		return nil
	})
	return result, err
}
