// Package connectors owns organization-scoped external-account connections
// (S3 today, Google Drive/SharePoint as a fast-follow) - the server-side
// counterpart of seshat-backend's per-user connector accounts, executing
// Discover/Sync fully inside seshat-server instead of on a paired device.
// See docs/architecture.md's "Example: Knowledge connectors" for why this
// domain made a different choice than Inbox connectors.
//
// Deliberately not named "knowledgeconnectors": a connected account (an
// OAuth grant to a user's Drive, an S3 bucket's credentials) is reusable
// infrastructure, not a Knowledge-only concept. Today every account is
// Knowledge-purposed (CorpusID set, fed through knowledge.Service.
// IngestFromConnector, reusing its chunk/embed/vector-upsert pipeline
// unchanged) - CorpusID is nullable specifically so a future non-Knowledge
// connector account isn't precluded by this domain's schema.
//
// That future non-Knowledge use (e.g. an agent writing a generated file
// into the user's Drive instead of locally) is deliberately NOT expected to
// be a Go "ActionConnector" interface added to this package. Sync (this
// package's job) and an agent action are different execution models - Sync
// is scheduled and runs unattended in the background; an action fires
// synchronously mid-turn while a user waits. seshat-server already has the
// right mechanism for the latter: MCPServerConfig (org-scoped, encrypted
// headers/env) plus the SDK's own MCP client (seshat/pkg/mcp) - an agent
// action almost certainly means registering/pointing at an MCP server
// exposing Drive/SharePoint write tools, not a new Go dispatch path here.
// The one real open problem, not yet solved anywhere: MCPServerConfig's
// auth is a static encrypted header, with no refresh-token cycle like a
// ConnectorAccount has - bridging a connected account's OAuth credentials
// into a live MCP call (fresh access token per call) needs its own design
// once a concrete MCP server is chosen - but not from scratch: seshat-backend
// already proved the exact bridging mechanism in internal/mcpaction/
// connector.go (helps/roadmap.md, Phase 3, 2026-08-15) - a connected
// account's secret.AccessToken is injected as an Authorization: Bearer
// header on top of the MCP server's own static config, per call. That
// package is device-tied (MCPServerStore is per-user/local); this future
// seshat-server work is the same idea against org-scoped MCPServerConfig
// instead - port the pattern, not the package. See ROADMAP.md.
//
// A second, related problem for that future work is now solved end to end
// (2026-08-20): every ConnectorAccount used to be implicitly "one connected
// account per (org, kind)" (Sync's use case - one admin-authorized
// Drive/SharePoint feeding one shared corpus). An agent action on behalf of
// a specific employee needs the opposite shape for Google/Microsoft - one
// ConnectorAccount per employee, each holding that employee's own OAuth
// grant - so the MCP call runs with, and is scoped by, that person's own
// provider-side permissions instead of one shared org-wide identity.
// AWS/Azure don't have this problem the same way: without per-IAM-user
// delegated OAuth as the default, a shared org-level credential plus
// seshat-server's own iam RBAC gating the MCP call is the realistic model
// there instead. BeginConnectorOAuth now branches on Purpose:
// PurposeKnowledgeSync (default) is unchanged - admin-gated, corpus
// required; PurposeAgentAction is self-service - any org member connects
// their own account, no corpus. AccessTokenForUser resolves a specific
// employee's own live (refreshed if needed) token, and
// mcpregistry.Service.ResolveServerConfigs (see its own doc comment)
// bridges that token into an MCPServerConfig's headers per caller,
// wired into workspacechat's sdk.ClientConfig.MCPServers - the "action
// fires synchronously mid-turn while a user waits" execution model this
// comment predicted. See ROADMAP.md for what's still explicitly deferred
// (console UI, automation/cloud-job wiring, a real deployed MCP server to
// point at).
package connectors

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/oauth2"
	"gorm.io/gorm"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/apperr"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
)

type Error = apperr.Error

func ErrInvalidInput(message string) error { return apperr.InvalidInput(message) }
func ErrUnauthorized(message string) error { return apperr.Unauthorized(message) }
func ErrNotFound(message string) error     { return apperr.NotFound(message) }

func newID(prefix string) (string, error) { return sdb.NewID(prefix) }

const (
	StatusConnected    = "connected"
	StatusError        = "error"
	StatusDisconnected = "disconnected"

	// PurposeKnowledgeSync and PurposeAgentAction are ConnectorAccount.Purpose
	// values - see its doc comment (db/models.go). Every account created
	// anywhere in this package today is PurposeKnowledgeSync; nothing yet
	// creates a PurposeAgentAction row (schema prepared, not wired up).
	PurposeKnowledgeSync = "knowledge_sync"
	PurposeAgentAction   = "agent_action"

	SyncJobStatusQueued    = "queued"
	SyncJobStatusRunning   = "running"
	SyncJobStatusCompleted = "completed"
	SyncJobStatusFailed    = "failed"

	defaultSyncMaxAttempts     = 3
	defaultSyncRetryDelay      = 2 * time.Second
	defaultStaleSyncTimeout    = 10 * time.Minute
	defaultSyncIntervalSeconds = 3600
)

// Service owns connector accounts and their sync jobs.
type Service struct {
	db        *sdb.DB
	iam       *iam.Service
	knowledge *knowledge.Service
	// publicAPIURL is this server's own public base URL, used to build the
	// fixed OAuth callback URL every connector OAuth app is registered
	// against - see SetPublicAPIURL and oauth.go.
	publicAPIURL string
	// connectorOverrides lets tests in this package substitute a fake
	// knowledgeConnector for a kind without touching a real external API -
	// nil in production, where connectorFor always builds a real one.
	connectorOverrides map[string]knowledgeConnector
	// oauthEndpointOverride/identityOverride let tests in this package point
	// the OAuth token exchange and identity lookup at a fake httptest.Server
	// instead of the real Google/Microsoft endpoints - both nil in
	// production. See oauth.go's oauthConfigFor/CompleteConnectorOAuth.
	oauthEndpointOverride func(kind string) oauth2.Endpoint
	identityOverride      func(ctx context.Context, kind string, cfg *oauth2.Config, token *oauth2.Token) (string, error)
}

func New(database *sdb.DB, iamService *iam.Service, knowledgeService *knowledge.Service) *Service {
	return &Service{db: database, iam: iamService, knowledge: knowledgeService}
}

// ConnectorAccount is the caller-facing view of a connected external
// account. Secrets are never exposed here.
type ConnectorAccount struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organization_id"`
	// CorpusID is set for a Knowledge-purposed connector account (every one
	// today) - see sdb.ConnectorAccount's doc comment.
	CorpusID            string     `json:"corpus_id,omitempty"`
	Kind                string     `json:"kind"`
	Purpose             string     `json:"purpose"`
	DisplayName         string     `json:"display_name"`
	ExternalAccountID   string     `json:"external_account_id,omitempty"`
	Status              string     `json:"status"`
	SyncIntervalSeconds int        `json:"sync_interval_seconds"`
	LastSyncedAt        *time.Time `json:"last_synced_at,omitempty"`
	LastError           string     `json:"last_error,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

// SyncJob is one queued/processed sync attempt for a ConnectorAccount.
type SyncJob struct {
	ID                 string     `json:"id"`
	ConnectorAccountID string     `json:"connector_account_id"`
	CorpusID           string     `json:"corpus_id"`
	Status             string     `json:"status"`
	AttemptCount       int        `json:"attempt_count"`
	MaxAttempts        int        `json:"max_attempts"`
	ItemsSynced        int        `json:"items_synced"`
	LastError          string     `json:"last_error,omitempty"`
	StartedAt          *time.Time `json:"started_at,omitempty"`
	CompletedAt        *time.Time `json:"completed_at,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
}

// CreateS3AccountParams connects a new S3-compatible bucket as a Knowledge
// source. AccessKeyID/SecretAccessKey are stored encrypted under the
// organization's own DEK (sdb.EncryptSecret) and never returned afterward.
type CreateS3AccountParams struct {
	OrganizationID      string
	CorpusID            string
	DisplayName         string
	Bucket              string
	Region              string
	Endpoint            string
	Prefix              string
	AccessKeyID         string
	SecretAccessKey     string
	SyncIntervalSeconds int
}

// ─── Connector accounts ─────────────────────────────────────────────────

// CreateS3Account validates and stores an S3 connector account and connects
// it immediately - unlike an OAuth-based connector, S3 has no
// authorize/callback step. Requires knowledge.manage or organization.manage.
func (s *Service) CreateS3Account(ctx context.Context, principal *iam.Principal, params CreateS3AccountParams) (*ConnectorAccount, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	corpusID := strings.TrimSpace(params.CorpusID)
	displayName := strings.TrimSpace(params.DisplayName)
	if organizationID == "" || corpusID == "" || displayName == "" {
		return nil, ErrInvalidInput("organization_id, corpus_id and display_name are required")
	}
	if strings.TrimSpace(params.AccessKeyID) == "" || strings.TrimSpace(params.SecretAccessKey) == "" {
		return nil, ErrInvalidInput("access_key_id and secret_access_key are required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "knowledge.manage", "organization.manage"); err != nil {
			return nil, err
		}
	}
	var corpus sdb.Corpus
	if err := s.db.Gorm().WithContext(ctx).First(&corpus, "id = ? AND organization_id = ?", corpusID, organizationID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrInvalidInput("corpus not found in this organization")
		}
		return nil, err
	}

	config, err := encodeS3AccountConfig(strings.TrimSpace(params.Bucket), strings.TrimSpace(params.Region), strings.TrimSpace(params.Endpoint), strings.TrimSpace(params.Prefix))
	if err != nil {
		return nil, ErrInvalidInput("encode s3 config: " + err.Error())
	}
	if _, err := parseS3AccountConfig(config); err != nil {
		return nil, ErrInvalidInput(err.Error())
	}

	syncInterval := params.SyncIntervalSeconds
	if syncInterval <= 0 {
		syncInterval = defaultSyncIntervalSeconds
	}

	var record sdb.ConnectorAccount
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		accountID, idErr := newID("connacc")
		if idErr != nil {
			return idErr
		}
		accessEnc, encErr := sdb.EncryptSecret(tx, organizationID, params.AccessKeyID)
		if encErr != nil {
			return encErr
		}
		secretEnc, encErr := sdb.EncryptSecret(tx, organizationID, params.SecretAccessKey)
		if encErr != nil {
			return encErr
		}
		now := time.Now().UTC()
		record = sdb.ConnectorAccount{
			ID:                    accountID,
			OrganizationID:        organizationID,
			CorpusID:              &corpusID,
			CreatedByUserID:       principal.User.ID,
			Kind:                  string(s3Kind),
			Purpose:               PurposeKnowledgeSync,
			DisplayName:           displayName,
			Status:                StatusConnected,
			AccessTokenEncrypted:  accessEnc,
			RefreshTokenEncrypted: secretEnc,
			Config:                config,
			SyncIntervalSeconds:   syncInterval,
			NextSyncAt:            &now,
		}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "connector_account.created", "connector_account", record.ID, map[string]string{"kind": record.Kind, "corpus_id": corpusID})
	})
	if err != nil {
		return nil, err
	}
	result := toConnectorAccount(record)
	return &result, nil
}

// ListAccounts returns every connector account visible to the caller for
// organizationID. Scoped visibility like every other list endpoint: a
// caller lacking knowledge.read/knowledge.manage/organization.manage gets
// an empty list, not a 403.
func (s *Service) ListAccounts(ctx context.Context, principal *iam.Principal, organizationID string) ([]ConnectorAccount, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "knowledge.read", "knowledge.manage", "organization.manage"); err != nil {
			return []ConnectorAccount{}, nil
		}
	}
	var records []sdb.ConnectorAccount
	if err := s.db.Gorm().WithContext(ctx).Where("organization_id = ?", organizationID).Order("created_at asc").Find(&records).Error; err != nil {
		return nil, err
	}
	out := make([]ConnectorAccount, 0, len(records))
	for _, r := range records {
		out = append(out, toConnectorAccount(r))
	}
	return out, nil
}

// DeleteAccount removes a connector account and its sync job history.
// Already-ingested CorpusFiles are left in place (a deliberate choice -
// disconnecting a source shouldn't retroactively delete knowledge already
// pulled from it); detach them individually via knowledge.Service.
// DetachFile if that's the intent. Requires knowledge.manage or
// organization.manage.
func (s *Service) DeleteAccount(ctx context.Context, principal *iam.Principal, accountID string) error {
	record, err := s.mustLoadAccount(ctx, principal, accountID, "knowledge.manage", "organization.manage")
	if err != nil {
		return err
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := tx.Where("connector_account_id = ?", record.ID).Delete(&sdb.ConnectorSyncJob{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&sdb.ConnectorAccount{}, "id = ?", record.ID).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "connector_account.deleted", "connector_account", record.ID, map[string]string{"kind": record.Kind})
	})
}

func (s *Service) mustLoadAccount(ctx context.Context, principal *iam.Principal, accountID string, permissionCodes ...string) (*sdb.ConnectorAccount, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return nil, ErrInvalidInput("account_id is required")
	}
	var record sdb.ConnectorAccount
	if err := s.db.Gorm().WithContext(ctx).First(&record, "id = ?", accountID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("connector account not found")
		}
		return nil, err
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, record.OrganizationID, permissionCodes...); err != nil {
			return nil, err
		}
	}
	return &record, nil
}

// AccessTokenForUser returns a valid (refreshed if needed) access token for
// userID's own agent_action-purposed ConnectorAccount of kind in
// organizationID - the per-employee counterpart to worker.go's Sync-time
// decrypt, used when resolving credentials for a specific person's own
// MCP-backed agent action instead of a scheduled org-wide sync. Satisfies
// mcpregistry.ConnectorTokenResolver. connected=false (no error) means that
// employee hasn't connected their own account (or it's not currently
// connected) - callers should treat this as "unavailable for this user,"
// not a failure worth surfacing.
func (s *Service) AccessTokenForUser(ctx context.Context, organizationID, kind, userID string) (string, bool, error) {
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

	tx := s.db.Gorm().WithContext(ctx)
	accessToken, err := sdb.DecryptSecret(tx, organizationID, account.AccessTokenEncrypted)
	if err != nil {
		return "", false, fmt.Errorf("decrypt access secret: %w", err)
	}
	refreshToken, err := sdb.DecryptSecret(tx, organizationID, account.RefreshTokenEncrypted)
	if err != nil {
		return "", false, fmt.Errorf("decrypt refresh secret: %w", err)
	}
	oauthCfg, err := s.oauthConfigFor(ctx, organizationID, kind)
	if err != nil {
		return "", false, err
	}
	stored := &oauth2.Token{AccessToken: accessToken, RefreshToken: refreshToken}
	if account.ExpiresAt != nil {
		stored.Expiry = *account.ExpiresAt
	}
	// TokenSource.Token() transparently refreshes when stored is expired,
	// using RefreshToken - the same auto-refresh behavior every gdrive/
	// sharepoint connector's HTTP client already relies on during Sync, just
	// surfaced here as a plain string. Known, accepted limitation, mirroring
	// the one already documented for Sync (worker.go): a refreshed token
	// isn't written back to the row, so a call after real expiry triggers a
	// fresh refresh-token round trip every time instead of reusing one.
	fresh, err := oauthCfg.TokenSource(ctx, stored).Token()
	if err != nil {
		return "", false, fmt.Errorf("refresh access token: %w", err)
	}
	return fresh.AccessToken, true, nil
}

// ─── Sync jobs ───────────────────────────────────────────────────────────

// TriggerSync queues an immediate sync for accountID, in addition to
// whatever its normal SyncIntervalSeconds schedule would do. Requires
// knowledge.manage or organization.manage.
func (s *Service) TriggerSync(ctx context.Context, principal *iam.Principal, accountID string) (*SyncJob, error) {
	record, err := s.mustLoadAccount(ctx, principal, accountID, "knowledge.manage", "organization.manage")
	if err != nil {
		return nil, err
	}
	if record.CorpusID == nil {
		return nil, ErrInvalidInput("this connector account has no corpus to sync into")
	}
	return s.enqueueSyncJob(ctx, record.OrganizationID, *record.CorpusID, record.ID)
}

// ListSyncJobs returns every sync job for accountID, newest first.
func (s *Service) ListSyncJobs(ctx context.Context, principal *iam.Principal, accountID string) ([]SyncJob, error) {
	record, err := s.mustLoadAccount(ctx, principal, accountID, "knowledge.read", "knowledge.manage", "organization.manage")
	if err != nil {
		return nil, err
	}
	var records []sdb.ConnectorSyncJob
	if err := s.db.Gorm().WithContext(ctx).Where("connector_account_id = ?", record.ID).Order("created_at desc").Find(&records).Error; err != nil {
		return nil, err
	}
	out := make([]SyncJob, 0, len(records))
	for _, r := range records {
		out = append(out, toSyncJob(r))
	}
	return out, nil
}

// enqueueSyncJob creates a queued job unless one is already queued/running
// for this account, so a manual "sync now" racing the periodic reap (see
// ReapDueAccounts) doesn't pile up duplicate work.
func (s *Service) enqueueSyncJob(ctx context.Context, organizationID, corpusID, accountID string) (*SyncJob, error) {
	var existing sdb.ConnectorSyncJob
	err := s.db.Gorm().WithContext(ctx).
		Where("connector_account_id = ? AND status IN ?", accountID, []string{SyncJobStatusQueued, SyncJobStatusRunning}).
		First(&existing).Error
	if err == nil {
		job := toSyncJob(existing)
		return &job, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	jobID, err := newID("csync")
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	record := sdb.ConnectorSyncJob{
		ID:                 jobID,
		ConnectorAccountID: accountID,
		CorpusID:           corpusID,
		OrganizationID:     organizationID,
		Status:             SyncJobStatusQueued,
		MaxAttempts:        defaultSyncMaxAttempts,
		NextRunAt:          &now,
	}
	if err := s.db.Gorm().WithContext(ctx).Create(&record).Error; err != nil {
		return nil, err
	}
	job := toSyncJob(record)
	return &job, nil
}

// connectorFor returns the knowledgeConnector implementation for kind,
// wired to extract text via the knowledge service's own docling-backed
// extraction so connector-synced content goes through the exact same
// extraction path as an uploaded file. gdrive/sharepoint additionally need
// organizationID to resolve that org's own registered OAuth app (see
// oauthConfigFor) - s3 ignores it.
func (s *Service) connectorFor(ctx context.Context, kind, organizationID string) (knowledgeConnector, error) {
	if s.connectorOverrides != nil {
		if c, ok := s.connectorOverrides[kind]; ok {
			return c, nil
		}
	}
	switch kind {
	case string(s3Kind):
		return newS3Connector().withTextExtractor(s.knowledge.ExtractText), nil
	case string(gdriveKind):
		oauthCfg, err := s.oauthConfigFor(ctx, organizationID, kind)
		if err != nil {
			return nil, err
		}
		return newGDriveConnector(oauthCfg).withTextExtractor(s.knowledge.ExtractText), nil
	case string(sharepointKind):
		oauthCfg, err := s.oauthConfigFor(ctx, organizationID, kind)
		if err != nil {
			return nil, err
		}
		return newSharePointConnector(oauthCfg).withTextExtractor(s.knowledge.ExtractText), nil
	default:
		return nil, fmt.Errorf("unsupported connector kind %q", kind)
	}
}

func toConnectorAccount(r sdb.ConnectorAccount) ConnectorAccount {
	var corpusID string
	if r.CorpusID != nil {
		corpusID = *r.CorpusID
	}
	return ConnectorAccount{
		ID:                  r.ID,
		OrganizationID:      r.OrganizationID,
		CorpusID:            corpusID,
		Kind:                r.Kind,
		Purpose:             r.Purpose,
		DisplayName:         r.DisplayName,
		ExternalAccountID:   r.ExternalAccountID,
		Status:              r.Status,
		SyncIntervalSeconds: r.SyncIntervalSeconds,
		LastSyncedAt:        r.LastSyncedAt,
		LastError:           r.LastError,
		CreatedAt:           r.CreatedAt,
		UpdatedAt:           r.UpdatedAt,
	}
}

func toSyncJob(r sdb.ConnectorSyncJob) SyncJob {
	return SyncJob{
		ID:                 r.ID,
		ConnectorAccountID: r.ConnectorAccountID,
		CorpusID:           r.CorpusID,
		Status:             r.Status,
		AttemptCount:       r.AttemptCount,
		MaxAttempts:        r.MaxAttempts,
		ItemsSynced:        r.ItemsSynced,
		LastError:          r.LastError,
		StartedAt:          r.StartedAt,
		CompletedAt:        r.CompletedAt,
		CreatedAt:          r.CreatedAt,
	}
}
