package connectors

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// staticAgentActionKinds are connector kinds that authenticate with a
// single static secret (an API key/token) rather than an OAuth2 flow, for
// self-service agent_action use - the agent_action counterpart to s3/
// azureblob's static credentials, which are both knowledge_sync/admin-only
// and go through CreateS3Account/CreateAzureBlobAccount instead. Stripe was
// the first; SendGrid/Mailgun/Postmark/Telegram/Discord/Trello/Airtable
// (batch 3 of the connectors initiative) needed no backend change beyond
// this map entry each, confirming the pattern.
var staticAgentActionKinds = map[string]bool{
	"stripe":   true,
	"sendgrid": true,
	"mailgun":  true,
	"postmark": true,
	"telegram": true,
	"discord":  true,
	"trello":   true,
	"airtable": true,
}

func validateStaticAgentKind(kind string) (string, error) {
	kind = strings.ToLower(strings.TrimSpace(kind))
	if !staticAgentActionKinds[kind] {
		return "", ErrInvalidInput(fmt.Sprintf("unsupported static connector kind %q (must be one of \"stripe\", \"sendgrid\", \"mailgun\", \"postmark\", \"telegram\", \"discord\", \"trello\", \"airtable\")", kind))
	}
	return kind, nil
}

// CreateStaticAgentAccountParams connects a static-secret account (e.g. a
// Stripe API key) for the caller's own future agent_action use - the
// synchronous, no-redirect counterpart to BeginConnectorOAuth's
// PurposeAgentAction branch, which this mirrors: plain org membership, no
// corpus, no knowledge.manage/organization.manage role required.
type CreateStaticAgentAccountParams struct {
	OrganizationID string
	Kind           string
	DisplayName    string
	Secret         string
}

// CreateStaticAgentAccount finds-or-updates the caller's existing account of
// this kind rather than always inserting - resubmitting the form to rotate
// a leaked/expired key must overwrite the existing row (matched on
// organization_id + kind + purpose + created_by_user_id, the exact same
// four-way key StaticSecretForUser/AccessTokenForUser look up by), not
// create a second one StaticSecretForUser's unordered lookup could then
// pick either of.
func (s *Service) CreateStaticAgentAccount(ctx context.Context, principal *iam.Principal, params CreateStaticAgentAccountParams) (*ConnectorAccount, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	kind, err := validateStaticAgentKind(params.Kind)
	if err != nil {
		return nil, err
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	displayName := strings.TrimSpace(params.DisplayName)
	secret := strings.TrimSpace(params.Secret)
	if organizationID == "" || secret == "" {
		return nil, ErrInvalidInput("organization_id and secret are required")
	}
	if displayName == "" {
		displayName = kind
	}

	// Self-service: plain org membership is enough - this connects the
	// calling employee's own account for their own future use, not an
	// org-wide resource. Same check BeginConnectorOAuth's PurposeAgentAction
	// branch already uses.
	allowed, err := s.iam.CanAccessOrganization(s.db.Gorm().WithContext(ctx), principal, organizationID)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, ErrUnauthorized("not a member of this organization")
	}

	var out ConnectorAccount
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		secretEnc, err := sdb.EncryptSecret(tx, organizationID, secret)
		if err != nil {
			return err
		}

		var account sdb.ConnectorAccount
		hasExisting := true
		if err := tx.Where("organization_id = ? AND kind = ? AND purpose = ? AND created_by_user_id = ?", organizationID, kind, PurposeAgentAction, principal.User.ID).
			First(&account).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			hasExisting = false
		}

		if hasExisting {
			updates := map[string]any{
				"display_name":           displayName,
				"access_token_encrypted": secretEnc,
				"status":                 StatusConnected,
				"last_error":             "",
			}
			if err := tx.Model(&sdb.ConnectorAccount{}).Where("id = ?", account.ID).Updates(updates).Error; err != nil {
				return err
			}
			account.DisplayName = displayName
			account.Status = StatusConnected
		} else {
			accountID, idErr := newID("connacc")
			if idErr != nil {
				return idErr
			}
			account = sdb.ConnectorAccount{
				ID:                   accountID,
				OrganizationID:       organizationID,
				CreatedByUserID:      principal.User.ID,
				Kind:                 kind,
				Purpose:              PurposeAgentAction,
				DisplayName:          displayName,
				Status:               StatusConnected,
				AccessTokenEncrypted: secretEnc,
			}
			if err := tx.Create(&account).Error; err != nil {
				return err
			}
		}
		out = toConnectorAccount(account)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// StaticSecretForUser resolves userID's own agent_action-purposed static
// secret of kind in organizationID - the static-credential counterpart to
// AccessTokenForUser, without the OAuth TokenSource refresh step (there is
// no refresh token, no expiry - the secret is exactly what was pasted in).
// connected=false (no error) means that employee hasn't connected their own
// account, same "unavailable for this user, not a failure" convention
// AccessTokenForUser already documents.
func (s *Service) StaticSecretForUser(ctx context.Context, organizationID, kind, userID string) (string, bool, error) {
	organizationID = strings.TrimSpace(organizationID)
	kind = strings.TrimSpace(kind)
	userID = strings.TrimSpace(userID)
	if organizationID == "" || kind == "" || userID == "" {
		return "", false, nil
	}
	var account sdb.ConnectorAccount
	err := s.db.Gorm().WithContext(ctx).
		Where("organization_id = ? AND kind = ? AND purpose = ? AND created_by_user_id = ?", organizationID, kind, PurposeAgentAction, userID).
		First(&account).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", false, nil
		}
		return "", false, err
	}
	if account.Status != StatusConnected {
		return "", false, nil
	}
	secret, err := sdb.DecryptSecret(s.db.Gorm().WithContext(ctx), organizationID, account.AccessTokenEncrypted)
	if err != nil {
		return "", false, fmt.Errorf("decrypt static secret: %w", err)
	}
	return secret, true, nil
}
