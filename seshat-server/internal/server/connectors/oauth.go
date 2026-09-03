package connectors

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	oauth2api "google.golang.org/api/oauth2/v2"
	"google.golang.org/api/option"
	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// connectorOAuthStateTTL is short-lived like iam's oidcLoginStateTTL - a
// connect round trip through an identity provider normally takes seconds,
// not minutes.
const connectorOAuthStateTTL = 10 * time.Minute

// oauthConnectorKinds are the connector kinds that go through an OAuth app
// registration + connect flow, as opposed to s3's static credentials.
var oauthConnectorKinds = map[string]bool{
	string(gdriveKind):     true,
	string(sharepointKind): true,
	string(onedriveKind):   true,
	string(confluenceKind): true,
	string(slackKind):      true,
	string(outlookKind):    true,
	string(teamsKind):      true,
	string(gmailKind):      true,
	string(notionKind):     true,
	string(gsheetsKind):    true,
	string(gcalendarKind):  true,
	string(jiraKind):       true,
	string(githubKind):     true,
	string(asanaKind):      true,
	string(linearKind):     true,
	string(hubspotKind):    true,
	string(intercomKind):   true,
	string(pipedriveKind):  true,
	string(zendeskKind):    true,
	string(salesforceKind): true,
}

// agentActionOnlyKinds are OAuth connector kinds with no Discover/Sync -
// they only make sense as a self-service, per-employee agent_action
// connect, never an admin-run knowledge_sync source. Checked in
// BeginConnectorOAuth.
var agentActionOnlyKinds = map[string]bool{
	string(slackKind):      true,
	string(outlookKind):    true,
	string(teamsKind):      true,
	string(gmailKind):      true,
	string(notionKind):     true,
	string(gsheetsKind):    true,
	string(gcalendarKind):  true,
	string(jiraKind):       true,
	string(githubKind):     true,
	string(asanaKind):      true,
	string(linearKind):     true,
	string(hubspotKind):    true,
	string(intercomKind):   true,
	string(pipedriveKind):  true,
	string(zendeskKind):    true,
	string(salesforceKind): true,
}

func validateOAuthKind(kind string) (string, error) {
	kind = strings.ToLower(strings.TrimSpace(kind))
	if !oauthConnectorKinds[kind] {
		return "", ErrInvalidInput(fmt.Sprintf("unsupported oauth connector kind %q (must be one of \"gdrive\", \"sharepoint\", \"onedrive\", \"confluence\", \"slack\", \"outlook\", \"teams\", \"gmail\", \"notion\", \"gsheets\", \"gcalendar\", \"jira\", \"github\", \"asana\", \"linear\", \"hubspot\", \"intercom\", \"pipedrive\", \"zendesk\", \"salesforce\")", kind))
	}
	return kind, nil
}

// SetPublicAPIURL wires this server's own public base URL, used to build
// the fixed OAuth callback URL every connector OAuth app is registered
// against - mirrors iam.Service.SetPublicAPIURL. Called once at app
// startup, after both services exist.
func (s *Service) SetPublicAPIURL(url string) {
	s.publicAPIURL = strings.TrimSuffix(strings.TrimSpace(url), "/")
}

// ─── OAuth app registration ─────────────────────────────────────────────

// OAuthApp is the caller-facing view of a registered connector OAuth app -
// the client secret is never returned, only whether one is set.
type OAuthApp struct {
	Kind       string    `json:"kind"`
	ClientID   string    `json:"client_id"`
	Configured bool      `json:"configured"`
	UpdatedAt  time.Time `json:"updated_at"`
	// Subdomain is only ever set for kind "zendesk" - see
	// sdb.ConnectorOAuthApp.Subdomain's doc comment.
	Subdomain string `json:"subdomain,omitempty"`
}

// RegisterOAuthAppParams registers or updates one organization's OAuth app
// credentials for kind. ClientSecret empty on an update to an already-
// registered app means "keep the existing one" - it is required the first
// time an app is registered for a given (organization, kind).
type RegisterOAuthAppParams struct {
	OrganizationID string
	Kind           string
	ClientID       string
	ClientSecret   string
	// Subdomain is required for kind "zendesk" only (rejected as invalid
	// input for every other kind) - see sdb.ConnectorOAuthApp.Subdomain's
	// doc comment.
	Subdomain string
}

// RegisterOAuthApp requires knowledge.manage or organization.manage.
func (s *Service) RegisterOAuthApp(ctx context.Context, principal *iam.Principal, params RegisterOAuthAppParams) (*OAuthApp, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	kind, err := validateOAuthKind(params.Kind)
	if err != nil {
		return nil, err
	}
	clientID := strings.TrimSpace(params.ClientID)
	if organizationID == "" || clientID == "" {
		return nil, ErrInvalidInput("organization_id and client_id are required")
	}
	subdomain := strings.ToLower(strings.TrimSpace(params.Subdomain))
	if kind == string(zendeskKind) && subdomain == "" {
		return nil, ErrInvalidInput("subdomain is required when registering a zendesk oauth app")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "knowledge.manage", "organization.manage"); err != nil {
			return nil, err
		}
	}

	var record sdb.ConnectorOAuthApp
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		hasExisting := true
		if err := tx.Where("organization_id = ? AND kind = ?", organizationID, kind).First(&record).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			hasExisting = false
		}
		if !hasExisting {
			id, idErr := newID("coauthapp")
			if idErr != nil {
				return idErr
			}
			record = sdb.ConnectorOAuthApp{ID: id, OrganizationID: organizationID, Kind: kind}
		}
		record.ClientID = clientID
		if subdomain != "" {
			record.Subdomain = subdomain
		}
		if strings.TrimSpace(params.ClientSecret) != "" {
			enc, encErr := sdb.EncryptSecret(tx, organizationID, params.ClientSecret)
			if encErr != nil {
				return encErr
			}
			record.ClientSecretEncrypted = enc
		} else if !hasExisting {
			return ErrInvalidInput("client_secret is required when registering a new oauth app")
		}
		if hasExisting {
			return tx.Save(&record).Error
		}
		return tx.Create(&record).Error
	})
	if err != nil {
		return nil, err
	}
	result := toOAuthApp(record)
	return &result, nil
}

// ListOAuthApps returns every OAuth app registered for organizationID.
// Scoped visibility like every other list endpoint in this package: a
// caller lacking read access gets an empty list, not a 403.
func (s *Service) ListOAuthApps(ctx context.Context, principal *iam.Principal, organizationID string) ([]OAuthApp, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "knowledge.read", "knowledge.manage", "organization.manage"); err != nil {
			return []OAuthApp{}, nil
		}
	}
	var records []sdb.ConnectorOAuthApp
	if err := s.db.Gorm().WithContext(ctx).Where("organization_id = ?", organizationID).Find(&records).Error; err != nil {
		return nil, err
	}
	out := make([]OAuthApp, 0, len(records))
	for _, r := range records {
		out = append(out, toOAuthApp(r))
	}
	return out, nil
}

func toOAuthApp(r sdb.ConnectorOAuthApp) OAuthApp {
	return OAuthApp{Kind: r.Kind, ClientID: r.ClientID, Configured: r.ClientSecretEncrypted != "", UpdatedAt: r.UpdatedAt, Subdomain: r.Subdomain}
}

// ─── Connect flow ────────────────────────────────────────────────────────

// BeginOAuthParams carries the console form's choices across the OAuth
// redirect round trip (see ConnectorOAuthState) so CompleteConnectorOAuth
// can create the ConnectorAccount with them already set.
type BeginOAuthParams struct {
	OrganizationID string
	CorpusID       string
	// Purpose selects which flow this is - empty/PurposeKnowledgeSync (the
	// default, and the only value before 2026-08-20) is today's admin-run,
	// corpus-attached connect. PurposeAgentAction is a self-service connect
	// for a single employee's own use (no corpus, no admin gate - see
	// BeginConnectorOAuth's doc comment).
	Purpose             string
	DisplayName         string // optional - defaults to the connected identity (email/UPN) if empty
	SyncIntervalSeconds int
}

// BeginConnectorOAuth starts a "connect an account" flow for kind
// ("gdrive" or "sharepoint"), returning the URL to open in a new tab. Two
// distinct flows share this one function, branching on params.Purpose:
//
//   - PurposeKnowledgeSync (default): admin sets up an org-wide source that
//     feeds a corpus. Requires knowledge.manage or organization.manage, and
//     a valid corpus_id.
//   - PurposeAgentAction: any org member connects their own account for
//     their own future MCP-backed agent actions (see connectors' package
//     doc comment) - only requires org membership, and corpus_id must be
//     empty. This is what makes "one ConnectorAccount per employee" actually
//     reachable, not just schema-ready.
//
// Both require that the organization has already registered an OAuth app
// for kind (see RegisterOAuthApp) - connecting an individual account still
// authenticates against the org's own registered client.
func (s *Service) BeginConnectorOAuth(ctx context.Context, principal *iam.Principal, kind string, params BeginOAuthParams) (string, error) {
	if principal == nil {
		return "", ErrUnauthorized("authentication required")
	}
	kind, err := validateOAuthKind(kind)
	if err != nil {
		return "", err
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	corpusID := strings.TrimSpace(params.CorpusID)
	if organizationID == "" {
		return "", ErrInvalidInput("organization_id is required")
	}
	purpose := strings.TrimSpace(params.Purpose)
	if purpose == "" {
		purpose = PurposeKnowledgeSync
	}
	if purpose != PurposeKnowledgeSync && purpose != PurposeAgentAction {
		return "", ErrInvalidInput(fmt.Sprintf("unsupported purpose %q (must be %q or %q)", purpose, PurposeKnowledgeSync, PurposeAgentAction))
	}
	if agentActionOnlyKinds[kind] && purpose != PurposeAgentAction {
		return "", ErrInvalidInput(fmt.Sprintf("%q only supports purpose %q, not %q", kind, PurposeAgentAction, purpose))
	}

	var corpusIDPtr *string
	switch purpose {
	case PurposeKnowledgeSync:
		if corpusID == "" {
			return "", ErrInvalidInput("corpus_id is required")
		}
		if !principal.User.IsAdmin {
			if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "knowledge.manage", "organization.manage"); err != nil {
				return "", err
			}
		}
		var corpus sdb.Corpus
		if err := s.db.Gorm().WithContext(ctx).First(&corpus, "id = ? AND organization_id = ?", corpusID, organizationID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return "", ErrInvalidInput("corpus not found in this organization")
			}
			return "", err
		}
		corpusIDPtr = &corpusID
	case PurposeAgentAction:
		if corpusID != "" {
			return "", ErrInvalidInput("corpus_id must not be set for an agent_action connect")
		}
		// Self-service: plain org membership is enough - this connects the
		// calling employee's own account for their own future use, not an
		// org-wide resource, so it doesn't need knowledge.manage/
		// organization.manage. Same check mcpregistry.ResolveServerConfigs
		// already uses for "may this member see/use this org's shared
		// config."
		allowed, err := s.iam.CanAccessOrganization(s.db.Gorm().WithContext(ctx), principal, organizationID)
		if err != nil {
			return "", err
		}
		if !allowed {
			return "", ErrUnauthorized("not a member of this organization")
		}
	}
	if s.publicAPIURL == "" {
		return "", fmt.Errorf("connector oauth is not configured: server has no public API URL (see Service.SetPublicAPIURL)")
	}

	oauthCfg, err := s.oauthConfigFor(ctx, organizationID, kind)
	if err != nil {
		return "", err
	}

	state, err := sdb.NewToken()
	if err != nil {
		return "", err
	}
	verifier := oauth2.GenerateVerifier()
	stateID, err := newID("coauthst")
	if err != nil {
		return "", err
	}
	syncInterval := params.SyncIntervalSeconds
	if syncInterval <= 0 {
		syncInterval = defaultSyncIntervalSeconds
	}
	now := time.Now().UTC()
	row := sdb.ConnectorOAuthState{
		ID:                  stateID,
		OrganizationID:      organizationID,
		CorpusID:            corpusIDPtr,
		Kind:                kind,
		Purpose:             purpose,
		CreatedByUserID:     principal.User.ID,
		StateHash:           sdb.HashOpaqueToken(state),
		CodeVerifier:        verifier,
		DisplayName:         strings.TrimSpace(params.DisplayName),
		SyncIntervalSeconds: syncInterval,
		CreatedAt:           now,
		ExpiresAt:           now.Add(connectorOAuthStateTTL),
	}
	if err := s.db.Gorm().WithContext(ctx).Create(&row).Error; err != nil {
		return "", err
	}

	authOpts := []oauth2.AuthCodeOption{oauth2.S256ChallengeOption(verifier)}
	if kind == string(gdriveKind) || kind == string(gsheetsKind) || kind == string(gcalendarKind) {
		// Google only issues a refresh token on the first consent unless
		// these are set - without them a reconnect after a revoked/expired
		// refresh token silently gets no new one.
		authOpts = append(authOpts, oauth2.AccessTypeOffline, oauth2.SetAuthURLParam("prompt", "consent"))
	}
	if kind == string(confluenceKind) || kind == string(jiraKind) {
		// Atlassian's authorize endpoint requires an explicit audience and,
		// like Google, only issues a refresh token when prompt=consent is
		// set - verified live against Atlassian's OAuth 2.0 (3LO) docs.
		authOpts = append(authOpts, oauth2.SetAuthURLParam("audience", "api.atlassian.com"), oauth2.SetAuthURLParam("prompt", "consent"))
	}
	return oauthCfg.AuthCodeURL(state, authOpts...), nil
}

// CompleteConnectorOAuth finishes a connect flow started by
// BeginConnectorOAuth: exchanges code for tokens, fetches the external
// identity, and finds-or-creates the ConnectorAccount. No principal - this
// is a public callback (the identity provider's redirect carries no bearer
// token), trust comes from the single-use signed state instead, same
// reasoning as iam.Service.CompleteOIDCLogin.
func (s *Service) CompleteConnectorOAuth(ctx context.Context, kind, code, state string) (*ConnectorAccount, error) {
	kind, err := validateOAuthKind(kind)
	if err != nil {
		return nil, err
	}
	code = strings.TrimSpace(code)
	state = strings.TrimSpace(state)
	if code == "" || state == "" {
		return nil, ErrInvalidInput("code and state are required")
	}

	var result ConnectorAccount
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)

		var oauthState sdb.ConnectorOAuthState
		if err := tx.Where("state_hash = ?", sdb.HashOpaqueToken(state)).First(&oauthState).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrUnauthorized("this authorization link has expired or was already used - please try connecting again")
			}
			return err
		}
		// Single-use regardless of outcome below - a state value must never
		// be redeemable twice, success or failure.
		if err := tx.Delete(&sdb.ConnectorOAuthState{}, "id = ?", oauthState.ID).Error; err != nil {
			return err
		}
		if oauthState.ExpiresAt.Before(time.Now().UTC()) || oauthState.Kind != kind {
			return ErrUnauthorized("this authorization link has expired or was already used - please try connecting again")
		}

		var app sdb.ConnectorOAuthApp
		if err := tx.Where("organization_id = ? AND kind = ?", oauthState.OrganizationID, kind).First(&app).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrInvalidInput("oauth app is no longer configured for this organization")
			}
			return err
		}
		clientSecret, err := sdb.DecryptSecret(tx, oauthState.OrganizationID, app.ClientSecretEncrypted)
		if err != nil {
			return fmt.Errorf("decrypt oauth app client secret: %w", err)
		}
		oauthCfg := &oauth2.Config{
			ClientID:     app.ClientID,
			ClientSecret: clientSecret,
			Endpoint:     s.resolveOAuthEndpoint(kind, app.Subdomain),
			RedirectURL:  s.connectorOAuthRedirectURL(kind),
			Scopes:       connectorOAuthScopes(kind),
		}

		token, err := oauthCfg.Exchange(ctx, code, oauth2.VerifierOption(oauthState.CodeVerifier))
		if err != nil {
			return ErrUnauthorized("failed to exchange authorization code: " + err.Error())
		}
		externalID, err := s.resolveIdentity(ctx, kind, oauthCfg, token)
		if err != nil {
			return ErrUnauthorized("connected, but could not read the account identity: " + err.Error())
		}

		displayName := oauthState.DisplayName
		if displayName == "" {
			displayName = externalID
		}
		// oauthAccountConfig captures the non-secret, per-account API host
		// pipedrive/salesforce return in the token exchange response itself
		// (api_domain/instance_url) - see pipedriveKind/salesforceKind's doc
		// comments. Empty (and therefore untouched) for every other kind.
		config := oauthAccountConfig(kind, token)
		scope := strings.Join(connectorOAuthScopes(kind), " ")
		accessEnc, err := sdb.EncryptSecret(tx, oauthState.OrganizationID, token.AccessToken)
		if err != nil {
			return err
		}
		refreshEnc, err := sdb.EncryptSecret(tx, oauthState.OrganizationID, token.RefreshToken)
		if err != nil {
			return err
		}

		// Reconnecting an already-known account (same org + kind + external
		// identity) updates it in place - the sync schedule/cursor are left
		// untouched, only the credentials/status change.
		var account sdb.ConnectorAccount
		hasExisting := true
		if err := tx.Where("organization_id = ? AND kind = ? AND external_account_id = ? AND purpose = ?", oauthState.OrganizationID, kind, externalID, oauthState.Purpose).
			First(&account).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			hasExisting = false
		}

		if hasExisting {
			updates := map[string]any{
				"display_name":            displayName,
				"access_token_encrypted":  accessEnc,
				"refresh_token_encrypted": refreshEnc,
				"scope":                   scope,
				"expires_at":              token.Expiry,
				"status":                  StatusConnected,
				"last_error":              "",
				"config":                  config,
			}
			if err := tx.Model(&sdb.ConnectorAccount{}).Where("id = ?", account.ID).Updates(updates).Error; err != nil {
				return err
			}
		} else {
			accountID, idErr := newID("connacc")
			if idErr != nil {
				return idErr
			}
			account = sdb.ConnectorAccount{
				ID:                    accountID,
				OrganizationID:        oauthState.OrganizationID,
				CorpusID:              oauthState.CorpusID,
				CreatedByUserID:       oauthState.CreatedByUserID,
				Kind:                  kind,
				Purpose:               oauthState.Purpose,
				DisplayName:           displayName,
				ExternalAccountID:     externalID,
				Status:                StatusConnected,
				AccessTokenEncrypted:  accessEnc,
				RefreshTokenEncrypted: refreshEnc,
				Scope:                 scope,
				ExpiresAt:             &token.Expiry,
				SyncIntervalSeconds:   oauthState.SyncIntervalSeconds,
				Config:                config,
			}
			// NextSyncAt (and therefore ever being picked up by
			// ReapDueAccounts) only makes sense for a knowledge_sync account -
			// an agent_action account is resolved on demand by
			// AccessTokenForUser, never polled.
			if oauthState.Purpose == PurposeKnowledgeSync {
				now := time.Now().UTC()
				account.NextSyncAt = &now
			}
			if err := tx.Create(&account).Error; err != nil {
				return err
			}
		}

		if err := tx.First(&account, "id = ?", account.ID).Error; err != nil {
			return err
		}
		result = toConnectorAccount(account)
		return s.iam.AppendAuditEvent(tx, nil, oauthState.OrganizationID, "connector_account.connected", "connector_account", account.ID, map[string]string{"kind": kind})
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

// oauthAccountConfig extracts the one field pipedrive/salesforce need
// persisted onto ConnectorAccount.Config as JSON (api_domain/instance_url
// respectively, both present directly in the token exchange response via
// oauth2.Token.Extra - no extra network round trip) - empty string (a
// no-op update/create field) for every other kind. See
// pipedriveKind/salesforceKind's doc comments.
func oauthAccountConfig(kind string, token *oauth2.Token) string {
	var field string
	switch kind {
	case string(pipedriveKind):
		field = "api_domain"
	case string(salesforceKind):
		field = "instance_url"
	default:
		return ""
	}
	value, _ := token.Extra(field).(string)
	if value == "" {
		return ""
	}
	encoded, err := json.Marshal(map[string]string{field: value})
	if err != nil {
		return ""
	}
	return string(encoded)
}

// oauthConfigFor resolves organizationID's registered OAuth app for kind
// into a ready-to-use *oauth2.Config - shared by BeginConnectorOAuth,
// CompleteConnectorOAuth, and connectorFor (which needs one to build a
// gdrive/sharepoint connector for a sync job).
func (s *Service) oauthConfigFor(ctx context.Context, organizationID, kind string) (*oauth2.Config, error) {
	tx := s.db.Gorm().WithContext(ctx)
	var app sdb.ConnectorOAuthApp
	if err := tx.Where("organization_id = ? AND kind = ?", organizationID, kind).First(&app).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrInvalidInput(fmt.Sprintf("no %s oauth app is registered for this organization", kind))
		}
		return nil, err
	}
	clientSecret, err := sdb.DecryptSecret(tx, organizationID, app.ClientSecretEncrypted)
	if err != nil {
		return nil, fmt.Errorf("decrypt oauth app client secret: %w", err)
	}
	return &oauth2.Config{
		ClientID:     app.ClientID,
		ClientSecret: clientSecret,
		Endpoint:     s.resolveOAuthEndpoint(kind, app.Subdomain),
		RedirectURL:  s.connectorOAuthRedirectURL(kind),
		Scopes:       connectorOAuthScopes(kind),
	}, nil
}

// resolveOAuthEndpoint returns the test override when set, else the real
// provider endpoint - see Service.oauthEndpointOverride's doc comment.
// subdomain is only meaningful for kind "zendesk" (see zendeskKind's doc
// comment), ignored by every other kind.
func (s *Service) resolveOAuthEndpoint(kind, subdomain string) oauth2.Endpoint {
	if s.oauthEndpointOverride != nil {
		return s.oauthEndpointOverride(kind, subdomain)
	}
	return connectorOAuthEndpoint(kind, subdomain)
}

// resolveIdentity returns the test override when set, else the real
// provider identity lookup - see Service.identityOverride's doc comment.
func (s *Service) resolveIdentity(ctx context.Context, kind string, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
	if s.identityOverride != nil {
		return s.identityOverride(ctx, kind, cfg, token)
	}
	return fetchConnectorIdentity(ctx, kind, cfg, token)
}

// connectorOAuthRedirectURL is always this server's own callback route —
// what the identity provider redirects the browser back to — never a
// per-request or loopback URL, mirroring iam.Service.oidcRedirectURL.
func (s *Service) connectorOAuthRedirectURL(kind string) string {
	return fmt.Sprintf("%s/api/v1/connectors/%s/oauth/callback", s.publicAPIURL, kind)
}

// subdomain is only meaningful for kind "zendesk" (see zendeskKind's doc
// comment) - Zendesk's authorize/token hosts are per-account, unlike every
// other kind's fixed host, so this is the one case that actually reads it.
func connectorOAuthEndpoint(kind, subdomain string) oauth2.Endpoint {
	switch kind {
	case string(gdriveKind), string(gmailKind), string(gsheetsKind), string(gcalendarKind):
		return google.Endpoint
	case string(sharepointKind), string(onedriveKind), string(outlookKind), string(teamsKind):
		// "organizations" tenant - any work/school (Entra ID) account across
		// any tenant, never a personal Microsoft account. SharePoint access
		// isn't supported for personal accounts anyway, and onedrive/outlook/
		// teams deliberately stay on the same work/school-only restriction
		// (an enterprise product, not a consumer Outlook.com/personal-Teams/
		// personal-OneDrive one).
		return oauth2.Endpoint{
			AuthURL:  "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
			TokenURL: "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
		}
	case string(slackKind):
		// v2_user endpoints: this app only ever needs a user token (per-
		// employee identity), never a bot token - see fetchSlackTeamAndUserID.
		return oauth2.Endpoint{
			AuthURL:  "https://slack.com/oauth/v2_user/authorize",
			TokenURL: "https://slack.com/api/oauth.v2.user.access",
		}
	case string(confluenceKind), string(jiraKind):
		return oauth2.Endpoint{
			AuthURL:  "https://auth.atlassian.com/authorize",
			TokenURL: "https://auth.atlassian.com/oauth/token",
		}
	case string(notionKind):
		return oauth2.Endpoint{
			AuthURL:  "https://api.notion.com/v1/oauth/authorize",
			TokenURL: "https://api.notion.com/v1/oauth/token",
		}
	case string(githubKind):
		return oauth2.Endpoint{
			AuthURL:  "https://github.com/login/oauth/authorize",
			TokenURL: "https://github.com/login/oauth/access_token",
		}
	case string(asanaKind):
		return oauth2.Endpoint{
			AuthURL:  "https://app.asana.com/-/oauth_authorize",
			TokenURL: "https://app.asana.com/-/oauth_token",
		}
	case string(linearKind):
		return oauth2.Endpoint{
			AuthURL:  "https://linear.app/oauth/authorize",
			TokenURL: "https://api.linear.app/oauth/token",
		}
	case string(hubspotKind):
		return oauth2.Endpoint{
			AuthURL:  "https://app.hubspot.com/oauth/authorize",
			TokenURL: "https://api.hubapi.com/oauth/v1/token",
		}
	case string(intercomKind):
		// US host only - see intercomKind's doc comment for the EU/AU
		// limitation.
		return oauth2.Endpoint{
			AuthURL:  "https://app.intercom.com/oauth",
			TokenURL: "https://api.intercom.io/auth/eagle/token",
		}
	case string(pipedriveKind):
		return oauth2.Endpoint{
			AuthURL:  "https://oauth.pipedrive.com/oauth/authorize",
			TokenURL: "https://oauth.pipedrive.com/oauth/token",
		}
	case string(salesforceKind):
		return oauth2.Endpoint{
			AuthURL:  "https://login.salesforce.com/services/oauth2/authorize",
			TokenURL: "https://login.salesforce.com/services/oauth2/token",
		}
	case string(zendeskKind):
		// Per-account host, unlike every other kind - see zendeskKind's doc
		// comment. subdomain is validated non-empty at RegisterOAuthApp time
		// for this kind (the only place it can ever be empty here is a stale/
		// pre-migration row, in which case an empty host simply fails the
		// request cleanly rather than panicking).
		return oauth2.Endpoint{
			AuthURL:  fmt.Sprintf("https://%s.zendesk.com/oauth/authorizations/new", subdomain),
			TokenURL: fmt.Sprintf("https://%s.zendesk.com/oauth/tokens", subdomain),
		}
	default:
		return oauth2.Endpoint{}
	}
}

func connectorOAuthScopes(kind string) []string {
	switch kind {
	case string(gdriveKind):
		return gdriveScopes
	case string(sharepointKind):
		return sharepointScopes
	case string(onedriveKind):
		return onedriveScopes
	case string(confluenceKind):
		return confluenceScopes
	case string(slackKind):
		return slackScopes
	case string(outlookKind):
		return outlookScopes
	case string(teamsKind):
		return teamsScopes
	case string(gmailKind):
		return gmailScopes
	case string(notionKind):
		return notionScopes
	case string(gsheetsKind):
		return gsheetsScopes
	case string(gcalendarKind):
		return gcalendarScopes
	case string(jiraKind):
		return jiraScopes
	case string(githubKind):
		return githubScopes
	case string(asanaKind):
		return asanaScopes
	case string(linearKind):
		return linearScopes
	case string(hubspotKind):
		return hubspotScopes
	case string(intercomKind):
		return intercomScopes
	case string(pipedriveKind):
		return pipedriveScopes
	case string(zendeskKind):
		return zendeskScopes
	case string(salesforceKind):
		return salesforceScopes
	default:
		return nil
	}
}

// fetchConnectorIdentity fetches the stable external identity a fresh
// ConnectorAccount is keyed on - an email for Google, a userPrincipalName
// for Microsoft (its work/school tenant equivalent of an email address).
func fetchConnectorIdentity(ctx context.Context, kind string, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
	switch kind {
	case string(gdriveKind), string(gmailKind), string(gsheetsKind), string(gcalendarKind):
		return fetchGoogleAccountEmail(ctx, cfg, token)
	case string(sharepointKind), string(onedriveKind), string(outlookKind), string(teamsKind):
		return fetchMicrosoftAccountUPN(ctx, cfg, token)
	case string(slackKind):
		return fetchSlackTeamAndUserID(ctx, cfg, token)
	case string(confluenceKind), string(jiraKind):
		return fetchAtlassianAccountEmail(ctx, cfg, token)
	case string(notionKind):
		return fetchNotionIdentity(ctx, cfg, token)
	case string(githubKind):
		return fetchGitHubIdentity(ctx, cfg, token)
	case string(asanaKind):
		return fetchAsanaIdentity(ctx, cfg, token)
	case string(linearKind):
		return fetchLinearIdentity(ctx, cfg, token)
	case string(hubspotKind):
		return fetchHubSpotIdentity(ctx, cfg, token)
	case string(intercomKind):
		return fetchIntercomIdentity(ctx, cfg, token)
	case string(pipedriveKind):
		return fetchPipedriveIdentity(ctx, cfg, token)
	case string(zendeskKind):
		return fetchZendeskIdentity(ctx, cfg, token)
	case string(salesforceKind):
		return fetchSalesforceIdentity(ctx, cfg, token)
	default:
		return "", fmt.Errorf("unsupported kind %q", kind)
	}
}

func fetchGoogleAccountEmail(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
	svc, err := oauth2api.NewService(ctx, option.WithTokenSource(cfg.TokenSource(ctx, token)))
	if err != nil {
		return "", err
	}
	info, err := svc.Userinfo.Get().Context(ctx).Do()
	if err != nil {
		return "", err
	}
	if info.Email == "" {
		return "", fmt.Errorf("no email in userinfo response")
	}
	return info.Email, nil
}

// fetchMicrosoftAccountUPN is a direct HTTP call rather than a generated
// SDK client, matching sharepoint_graph.go's own hand-rolled Graph client
// (no official Go SDK is vendored in this module).
func fetchMicrosoftAccountUPN(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
	client := cfg.Client(ctx, token)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://graph.microsoft.com/v1.0/me?$select=userPrincipalName", nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("graph /me returned %d", resp.StatusCode)
	}
	var info struct {
		UserPrincipalName string `json:"userPrincipalName"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", err
	}
	if info.UserPrincipalName == "" {
		return "", fmt.Errorf("no userPrincipalName in /me response")
	}
	return info.UserPrincipalName, nil
}

// fetchAtlassianAccountEmail is a direct HTTP call rather than a generated
// SDK client, matching fetchMicrosoftAccountUPN's own reasoning - no
// official Go SDK is vendored in this module. Uses the read:me-scoped User
// Identity API, not a Confluence-specific endpoint - the same identity
// lookup would serve any future Atlassian-product connector (Jira, etc.).
func fetchAtlassianAccountEmail(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
	client := cfg.Client(ctx, token)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.atlassian.com/me", nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("atlassian /me returned %d", resp.StatusCode)
	}
	var info struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", err
	}
	if info.Email == "" {
		return "", fmt.Errorf("no email in atlassian /me response")
	}
	return info.Email, nil
}

// fetchGitHubIdentity resolves the connected GitHub login (not email -
// GitHub accounts frequently have no public/verified email at all, unlike
// every Google/Microsoft/Atlassian account this package already handles -
// login is GitHub's own stable, always-present identifier). GitHub
// requires a User-Agent header on every API request (undocumented-looking
// but real: a request with none is rejected outright) - verified against
// GitHub's REST API docs before writing this, not discovered by a failing
// request.
func fetchGitHubIdentity(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
	client := cfg.Client(ctx, token)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "seshat-ai")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("github /user returned %d", resp.StatusCode)
	}
	var info struct {
		Login string `json:"login"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", err
	}
	if info.Login == "" {
		return "", fmt.Errorf("no login in github /user response")
	}
	return info.Login, nil
}

// fetchAsanaIdentity uses the ordinary REST API's GET /users/me (not a
// special OAuth-only endpoint) - verified against Asana's API reference
// before writing this, after confirming Asana's OAuth doc page alone
// documents no identity endpoint at all.
func fetchAsanaIdentity(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
	client := cfg.Client(ctx, token)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://app.asana.com/api/1.0/users/me", nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("asana /users/me returned %d", resp.StatusCode)
	}
	var info struct {
		Data struct {
			Email string `json:"email"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", err
	}
	if info.Data.Email == "" {
		return "", fmt.Errorf("no email in asana /users/me response")
	}
	return info.Data.Email, nil
}

// fetchLinearIdentity queries Linear's GraphQL API directly (a plain HTTP
// POST, not a generated SDK client - no official Go SDK is vendored in
// this module, matching fetchMicrosoftAccountUPN's own reasoning) for the
// connected user's email via the viewer field - Linear's API is GraphQL-
// only, there is no separate REST identity endpoint.
func fetchLinearIdentity(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
	client := cfg.Client(ctx, token)
	body, err := json.Marshal(map[string]string{"query": "{ viewer { email } }"})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.linear.app/graphql", strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("linear graphql returned %d", resp.StatusCode)
	}
	var result struct {
		Data struct {
			Viewer struct {
				Email string `json:"email"`
			} `json:"viewer"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if result.Data.Viewer.Email == "" {
		return "", fmt.Errorf("no email in linear viewer response")
	}
	return result.Data.Viewer.Email, nil
}

// fetchHubSpotIdentity uses HubSpot's token-introspection endpoint, which
// (unlike every other identity lookup in this file) takes the access
// token as a URL path segment rather than a Bearer Authorization header -
// verified against HubSpot's OAuth docs before writing this, a genuinely
// different shape from the rest of this file so cfg.Client is
// deliberately not used here (it would add a Bearer header this endpoint
// doesn't expect).
func fetchHubSpotIdentity(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
	requestURL := "https://api.hubapi.com/oauth/v1/access-tokens/" + url.PathEscape(token.AccessToken)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("hubspot access-tokens introspection returned %d", resp.StatusCode)
	}
	var info struct {
		User string `json:"user"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", err
	}
	if info.User == "" {
		return "", fmt.Errorf("no user in hubspot access-tokens introspection response")
	}
	return info.User, nil
}

// fetchIntercomIdentity resolves the connected admin's email via
// Intercom's /me endpoint.
func fetchIntercomIdentity(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
	client := cfg.Client(ctx, token)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.intercom.io/me", nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("intercom /me returned %d", resp.StatusCode)
	}
	var info struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", err
	}
	if info.Email == "" {
		return "", fmt.Errorf("no email in intercom /me response")
	}
	return info.Email, nil
}

// fetchPipedriveIdentity reads api_domain straight off the token response
// (token.Extra, populated by oauth2.Config.Exchange from the raw JSON body
// - see pipedriveKind's doc comment) rather than a second network call, and
// uses it as the base for the one GET this needs.
func fetchPipedriveIdentity(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
	apiDomain, _ := token.Extra("api_domain").(string)
	if apiDomain == "" {
		return "", fmt.Errorf("no api_domain in pipedrive token response")
	}
	client := cfg.Client(ctx, token)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiDomain+"/v1/users/me", nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("pipedrive /users/me returned %d", resp.StatusCode)
	}
	var info struct {
		Data struct {
			Email string `json:"email"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", err
	}
	if info.Data.Email == "" {
		return "", fmt.Errorf("no email in pipedrive /users/me response")
	}
	return info.Data.Email, nil
}

// fetchZendeskIdentity derives the account's subdomain host from cfg's own
// TokenURL (built by connectorOAuthEndpoint from
// sdb.ConnectorOAuthApp.Subdomain - see zendeskKind's doc comment) rather
// than taking a redundant extra parameter through resolveIdentity/
// fetchConnectorIdentity's shared signature.
func fetchZendeskIdentity(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
	tokenURL, err := url.Parse(cfg.Endpoint.TokenURL)
	if err != nil {
		return "", fmt.Errorf("parse zendesk token url: %w", err)
	}
	client := cfg.Client(ctx, token)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, tokenURL.Scheme+"://"+tokenURL.Host+"/api/v2/users/me.json", nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("zendesk /users/me.json returned %d", resp.StatusCode)
	}
	var info struct {
		User struct {
			Email string `json:"email"`
		} `json:"user"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", err
	}
	if info.User.Email == "" {
		return "", fmt.Errorf("no email in zendesk /users/me.json response")
	}
	return info.User.Email, nil
}

// fetchSalesforceIdentity uses the fixed OIDC userinfo endpoint (not a
// per-org host - Salesforce's login host resolves it for any valid
// production-org token) - verified against Salesforce's OAuth/OIDC docs
// before writing this.
func fetchSalesforceIdentity(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
	client := cfg.Client(ctx, token)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://login.salesforce.com/services/oauth2/userinfo", nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("salesforce userinfo returned %d", resp.StatusCode)
	}
	var info struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", err
	}
	if info.Email == "" {
		return "", fmt.Errorf("no email in salesforce userinfo response")
	}
	return info.Email, nil
}
