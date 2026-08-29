package db

import "time"

// User is the control-plane identity record.
type User struct {
	ID           string `gorm:"primaryKey;size:32"`
	Email        string `gorm:"uniqueIndex;size:255;not null"`
	DisplayName  string `gorm:"size:255;not null"`
	PasswordHash string `gorm:"size:255;not null"`
	IsAdmin      bool   `gorm:"not null;default:false"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Organization is the tenant boundary every other domain is scoped to.
type Organization struct {
	ID           string `gorm:"primaryKey;size:32"`
	Name         string `gorm:"size:255;not null"`
	Slug         string `gorm:"uniqueIndex;size:255;not null"`
	Description  string `gorm:"type:text"`
	WebsiteURL   string `gorm:"size:500"`
	SupportEmail string `gorm:"size:255"`
	// IsDefault marks the single organization whose own ProviderSetting/
	// EmbedderSetting rows are used as the platform-wide fallback when a
	// requesting organization has none of its own. At most one organization
	// holds this at a time (enforced in Go, see SetOrganizationDefault - see
	// db.go's AutoMigrate doc comment for why this isn't a DB constraint).
	IsDefault bool `gorm:"not null;default:false;index"`
	// IsActive is administrative/visual only for now - no request path
	// checks it. Lets a platform admin flag an organization as retired
	// without deleting it.
	IsActive bool `gorm:"not null;default:true"`
	// The four Share* flags only matter while this organization holds
	// IsDefault - they let a platform admin share, say, this org's MCP
	// servers with every other organization while keeping its own LLM
	// provider credentials private to itself, instead of the all-or-nothing
	// behavior of IsDefault alone. Default true so flipping IsDefault on
	// keeps today's existing all-shared behavior until an admin opts a
	// domain out (see iam.Service.DefaultOrganizationIDForDomain).
	ShareProviderSettings        bool `gorm:"not null;default:true"`
	ShareEmbedderSettings        bool `gorm:"not null;default:true"`
	ShareWebSearchSettings       bool `gorm:"not null;default:true"`
	ShareMCPServers              bool `gorm:"not null;default:true"`
	ShareSkillRepos              bool `gorm:"not null;default:true"`
	ShareOrganizationPreferences bool `gorm:"not null;default:true"`
	// Domain is the organization's own email domain (e.g. "acmecorp.com"),
	// used by self-service registration to auto-join a new user to this org
	// as a pending member. A *string (not string) so an org without a
	// domain stores NULL, not "" - a unique index allows any number of NULLs
	// but would reject a second org ever setting an empty string.
	Domain    *string `gorm:"uniqueIndex;size:255"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

// OrganizationDataKey holds one organization's Data Encryption Key (DEK) for
// envelope encryption of secrets (see secrets.go) — EncryptedDEK is the raw
// 32-byte AES-256 key, itself encrypted by the single master key
// (SESHAT_SERVER_ENCRYPTION_KEY). Every stored secret across the control
// plane (provider API keys, OIDC client secrets, MCP server credentials,
// ...) is encrypted with its owning organization's DEK, not the master key
// directly — a leaked DEK (or a compromised organization) exposes only that
// one tenant's secrets, and rotating the master key only ever means
// re-encrypting these small per-organization rows, never every secret in
// the database. Created lazily on first use per organization (see
// getOrCreateOrganizationDEK), not at organization-creation time.
type OrganizationDataKey struct {
	OrganizationID string `gorm:"primaryKey;size:32"`
	EncryptedDEK   string `gorm:"type:text;not null"`
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// Membership binds one user to one organization with a role.
type Membership struct {
	ID string `gorm:"primaryKey;size:32"`
	// UserID is also uniquely indexed on its own (idx_membership_user), not
	// just the (UserID, OrganizationID) pair below - this is the DB-level
	// enforcement that a user account belongs to at most one organization,
	// ever. The application layer checks this first (see
	// iam.userHasAnyMembership, called from every membership-creating path
	// that targets an existing user) so callers get a clean ErrConflict
	// instead of a raw constraint error on the happy path; this index is the
	// last-resort guard against a race between that check and the INSERT.
	UserID         string `gorm:"size:32;not null;uniqueIndex:idx_membership_user_org;uniqueIndex:idx_membership_user"`
	OrganizationID string `gorm:"size:32;not null;uniqueIndex:idx_membership_user_org;index:idx_membership_org;uniqueIndex:idx_membership_org_scim_external"`
	Role           string `gorm:"size:64;not null"`
	// Status is "active" (default - every pre-existing membership-creation
	// path is unaffected, see the Go zero-value/gorm-default-tag omission
	// behavior), "pending" (self-registered via a matched org email domain -
	// full access already, just flagged for admin attention), or "blocked"
	// (excluded from every authorization check in access.go, as if the
	// membership didn't exist - set by BlockExpiredPendingMemberships once
	// a pending membership ages past the confirmation window unconfirmed,
	// or by a SCIM PATCH setting active:false - see the scim package).
	Status       string `gorm:"size:16;not null;default:'active'"`
	PendingSince *time.Time
	// ScimExternalID is the IdP's own id for this membership's user, set
	// once at SCIM-driven creation and never changed - PATCH/DELETE by the
	// IdP address a resource by this id, not by our internal UserID. Nil
	// for every membership not created via SCIM. Unique per organization
	// (not globally: two different orgs could each run their own SCIM
	// connection to unrelated IdP tenants that happen to reuse an id
	// scheme), paired with OrganizationID in idx_membership_org_scim_external.
	ScimExternalID *string `gorm:"size:255;uniqueIndex:idx_membership_org_scim_external"`
	CreatedAt      time.Time
}

// Session is an active bearer-token login. Token stores the SHA-256 hash
// of the bearer token presented by the client; the raw token is only ever
// returned once at creation/login time and is never persisted in plaintext.
type Session struct {
	Token     string `gorm:"primaryKey;size:64"`
	ID        string `gorm:"uniqueIndex;size:32;not null"`
	UserID    string `gorm:"size:32;not null;index"`
	CreatedAt time.Time
	ExpiresAt time.Time `gorm:"index"`
}

// PasswordResetToken is a short-lived, single-use opaque token for the
// "forgot password" flow - mirrors Invitation.Token's exact shape (SHA-256
// hash via sdb.HashOpaqueToken, the raw value only ever exists in the
// email sent to the user). Deliberately separate from Session (a valid
// login) and Invitation (an org join grant): this token proves nothing
// except "the holder controls this email inbox," for one single action.
type PasswordResetToken struct {
	ID        string `gorm:"primaryKey;size:32"`
	UserID    string `gorm:"size:32;not null;index"`
	Token     string `gorm:"uniqueIndex;size:64;not null"`
	CreatedAt time.Time
	ExpiresAt time.Time
	UsedAt    *time.Time
}

// OIDCLoginState is one in-flight OIDC authorization-code login attempt,
// created by BeginOIDCLogin and consumed (deleted) by CompleteOIDCLogin —
// single-use, same lifecycle shape as PasswordResetToken above. StateHash is
// the SHA-256 hash of the state value round-tripped through the identity
// provider (sdb.HashOpaqueToken), never the raw value. CodeVerifier (PKCE)
// and Nonce are stored in plaintext: both are single-use, short-lived
// (ExpiresAt), and only ever read back by this same server process
// completing its own login attempt - not credentials presented by a client.
// RedirectURI is the caller's final destination after login succeeds,
// validated loopback-only at creation time (see BeginOIDCLogin) - distinct
// from the OIDC RedirectURL sent to the identity provider itself, which is
// always this server's own callback route.
type OIDCLoginState struct {
	ID           string `gorm:"primaryKey;size:32"`
	ProviderID   string `gorm:"size:32;not null;index"`
	StateHash    string `gorm:"uniqueIndex;size:64;not null"`
	CodeVerifier string `gorm:"size:255;not null"`
	Nonce        string `gorm:"size:64;not null"`
	RedirectURI  string `gorm:"size:500;not null"`
	CreatedAt    time.Time
	ExpiresAt    time.Time
}

// Application is an OAuth/OIDC client application managed by the control plane.
type Application struct {
	ID                     string   `gorm:"primaryKey;size:32"`
	OrganizationID         string   `gorm:"size:32;not null;uniqueIndex:idx_application_org_slug;index"`
	Name                   string   `gorm:"size:255;not null"`
	Slug                   string   `gorm:"size:255;not null;uniqueIndex:idx_application_org_slug"`
	DisplayName            string   `gorm:"size:255;not null"`
	Description            string   `gorm:"type:text"`
	Protocol               string   `gorm:"size:32;not null"`
	Enabled                bool     `gorm:"not null;default:true"`
	HomepageURL            string   `gorm:"size:500"`
	CallbackURL            string   `gorm:"size:500"`
	RedirectURLs           []string `gorm:"serializer:json;type:text"`
	PostLogoutRedirectURLs []string `gorm:"serializer:json;type:text"`
	AllowedOrigins         []string `gorm:"serializer:json;type:text"`
	GrantTypes             []string `gorm:"serializer:json;type:text"`
	ResponseTypes          []string `gorm:"serializer:json;type:text"`
	Scopes                 []string `gorm:"serializer:json;type:text"`
	ClientID               string   `gorm:"size:64;index"`
	ClientSecret           string   `gorm:"type:text"`
	ProviderIDs            []string `gorm:"serializer:json;type:text"`
	SigninURL              string   `gorm:"size:500"`
	SignupURL              string   `gorm:"size:500"`
	AllowSignup            bool
	AllowPasswordLogin     bool
	PKCERequired           bool
	SkipConsent            bool
	IssueRefreshToken      bool
	Configuration          map[string]string `gorm:"serializer:json;type:text"`
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

// Provider is an upstream identity provider configuration (OIDC/OAuth2/SAML).
type Provider struct {
	ID               string            `gorm:"primaryKey;size:32"`
	OrganizationID   string            `gorm:"size:32;not null;uniqueIndex:idx_provider_org_slug;index"`
	Name             string            `gorm:"size:255;not null"`
	Slug             string            `gorm:"size:255;not null;uniqueIndex:idx_provider_org_slug"`
	Kind             string            `gorm:"size:32;not null"`
	Enabled          bool              `gorm:"not null;default:true"`
	ClientID         string            `gorm:"size:255"`
	ClientSecret     string            `gorm:"type:text"`
	IssuerURL        string            `gorm:"size:500"`
	DiscoveryURL     string            `gorm:"size:500"`
	AuthorizationURL string            `gorm:"size:500"`
	TokenURL         string            `gorm:"size:500"`
	UserInfoURL      string            `gorm:"size:500"`
	JWKSURL          string            `gorm:"size:500"`
	LogoutURL        string            `gorm:"size:500"`
	MetadataURL      string            `gorm:"size:500"`
	EntityID         string            `gorm:"size:255"`
	SSOURL           string            `gorm:"size:500"`
	X509Certificate  string            `gorm:"type:text"`
	Scopes           []string          `gorm:"serializer:json;type:text"`
	AllowedDomains   []string          `gorm:"serializer:json;type:text"`
	ClaimMappings    map[string]string `gorm:"serializer:json;type:text"`
	AllowAutoLink    bool
	AllowSignup      bool
	PKCERequired     bool
	Configuration    map[string]string `gorm:"serializer:json;type:text"`
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// Invitation is a pending or resolved organization access invite. Token
// stores the SHA-256 hash of the opaque invitation secret, not the secret
// itself.
type Invitation struct {
	ID               string `gorm:"primaryKey;size:32"`
	OrganizationID   string `gorm:"size:32;not null;index"`
	Email            string `gorm:"size:255;not null;index"`
	Role             string `gorm:"size:64;not null"`
	Status           string `gorm:"size:32;not null;index"`
	Token            string `gorm:"uniqueIndex;size:64;not null"`
	InvitedByUserID  string `gorm:"size:32"`
	AcceptedByUserID string `gorm:"size:32"`
	CreatedAt        time.Time
	ExpiresAt        time.Time
	AcceptedAt       *time.Time
	RevokedAt        *time.Time
}

// Group is an organization-local collection of users for policy assignment.
// Membership itself lives in GroupMember, not on this row — see its comment
// for why.
type Group struct {
	ID             string `gorm:"primaryKey;size:32"`
	OrganizationID string `gorm:"size:32;not null;uniqueIndex:idx_group_org_slug;index"`
	Name           string `gorm:"size:255;not null"`
	Slug           string `gorm:"size:255;not null;uniqueIndex:idx_group_org_slug"`
	Description    string `gorm:"type:text"`
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// GroupMember is one user's membership in one group. A real join table
// instead of a JSON array on Group so "which groups (in this org) does this
// user belong to" is an indexed lookup (idx_group_member_org_user) instead
// of loading and deserializing every group in the organization to test
// membership in Go.
type GroupMember struct {
	ID             string `gorm:"primaryKey;size:32"`
	OrganizationID string `gorm:"size:32;not null;index:idx_group_member_org_user"`
	GroupID        string `gorm:"size:32;not null;uniqueIndex:idx_group_member_group_user;index"`
	UserID         string `gorm:"size:32;not null;uniqueIndex:idx_group_member_group_user;index:idx_group_member_org_user"`
	CreatedAt      time.Time
}

// PolicyBinding grants a set of permissions to a role, user or group.
// ResourceType/ResourceID narrow the grant to one resource within the
// organization (e.g. one Corpus) instead of every resource of that kind —
// both empty means organization-wide, the original and still most common
// shape. See iam.bindingMatchesPrincipal for how the two are matched.
type PolicyBinding struct {
	ID              string   `gorm:"primaryKey;size:32"`
	OrganizationID  string   `gorm:"size:32;not null;index"`
	Name            string   `gorm:"size:255;not null"`
	Description     string   `gorm:"type:text"`
	SubjectType     string   `gorm:"size:32;not null"`
	SubjectID       string   `gorm:"size:64;not null;index"`
	PermissionCodes []string `gorm:"serializer:json;type:text"`
	ResourceType    string   `gorm:"size:32"`
	ResourceID      string   `gorm:"size:64;index"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// CustomRole is a tenant-scoped role definition whose permissions are fully
// managed from the control plane. System roles (owner/admin/member/viewer)
// remain code-defined and are not stored here.
type CustomRole struct {
	ID              string   `gorm:"primaryKey;size:32"`
	OrganizationID  string   `gorm:"size:32;not null;uniqueIndex:idx_custom_role_org_code;index"`
	Code            string   `gorm:"size:64;not null;uniqueIndex:idx_custom_role_org_code"`
	Name            string   `gorm:"size:255;not null"`
	Description     string   `gorm:"type:text"`
	PermissionCodes []string `gorm:"serializer:json;type:text"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// AuditEvent is an immutable audit trail entry.
type AuditEvent struct {
	ID             string            `gorm:"primaryKey;size:32"`
	OrganizationID string            `gorm:"size:32;index"`
	ActorUserID    string            `gorm:"size:32;index"`
	Action         string            `gorm:"size:128;index"`
	ResourceType   string            `gorm:"size:64"`
	ResourceID     string            `gorm:"size:64"`
	Metadata       map[string]string `gorm:"serializer:json;type:text"`
	CreatedAt      time.Time         `gorm:"index"`
}

// Device is a registered seshat-backend (local desktop) instance that the
// cloud can target with execution_target=device jobs. Token stores the
// SHA-256 hash of the bearer credential the local backend presents on every
// device-protocol call; the raw token is shown once at registration time and
// never persisted in plaintext.
type Device struct {
	ID                 string `gorm:"primaryKey;size:32"`
	OrganizationID     string `gorm:"size:32;not null;index"`
	RegisteredByUserID string `gorm:"size:32;not null"`
	Name               string `gorm:"size:255;not null"`
	Platform           string `gorm:"size:64"`
	AppVersion         string `gorm:"size:64"`
	Status             string `gorm:"size:32;not null"` // active | revoked
	Token              string `gorm:"uniqueIndex;size:64;not null"`
	LastSeenAt         *time.Time
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

// ScheduledJob is an automation definition: what to run, when, and where
// (cloud or a specific device).
type ScheduledJob struct {
	ID              string `gorm:"primaryKey;size:32"`
	OrganizationID  string `gorm:"size:32;not null;index"`
	CreatedByUserID string `gorm:"size:32;not null"`
	Name            string `gorm:"size:255;not null"`
	Description     string `gorm:"type:text"`
	Status          string `gorm:"size:32;not null;index"` // active | paused
	TriggerType     string `gorm:"size:32;not null"`       // cron | interval | once
	CronExpr        string `gorm:"size:255"`
	IntervalSeconds int
	RunAt           *time.Time
	NextRunAt       *time.Time `gorm:"index"`
	LastRunAt       *time.Time
	LastRunStatus   string            `gorm:"size:32"`
	ExecutionTarget string            `gorm:"size:16;not null"` // cloud | device
	TargetDeviceID  string            `gorm:"size:32"`
	Prompt          string            `gorm:"type:text;not null"`
	ModelOverride   string            `gorm:"size:128"`
	Configuration   map[string]string `gorm:"serializer:json;type:text"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// JobRun is one execution instance of a ScheduledJob.
type JobRun struct {
	ID               string `gorm:"primaryKey;size:32"`
	JobID            string `gorm:"size:32;not null;index"`
	OrganizationID   string `gorm:"size:32;not null;index"`
	ExecutionTarget  string `gorm:"size:16;not null"`
	AssignedDeviceID string `gorm:"size:32;index"`
	Status           string `gorm:"size:32;not null;index"` // queued | claimed | running | completed | failed | cancelled
	QueuedAt         time.Time
	ClaimedAt        *time.Time
	StartedAt        *time.Time
	LastHeartbeatAt  *time.Time
	FinishedAt       *time.Time
	ExitReason       string            `gorm:"size:255"`
	OutputText       string            `gorm:"type:text"`
	ErrorText        string            `gorm:"type:text"`
	Metadata         map[string]string `gorm:"serializer:json;type:text"`
}

// ProviderSetting holds one organization's credentials for one LLM provider
// (e.g. "anthropic", "openai") — distinct from Provider (an OAuth/OIDC
// identity provider in the iam domain). EncryptedAPIKey is AES-256-GCM
// ciphertext, never the raw key; the raw key is never stored or returned
// once encrypted.
type ProviderSetting struct {
	ID              string `gorm:"primaryKey;size:32"`
	OrganizationID  string `gorm:"size:32;not null;uniqueIndex:idx_provider_setting_org_provider;index"`
	CreatedByUserID string `gorm:"size:32;not null"`
	Provider        string `gorm:"size:32;not null;uniqueIndex:idx_provider_setting_org_provider"`
	DefaultModel    string `gorm:"size:128;not null"`
	BaseURL         string `gorm:"size:500"`
	EncryptedAPIKey string `gorm:"type:text;not null"`
	// IsDefault is an administrative/UI marker for which of this
	// organization's provider settings is its "main" one - not consumed by
	// job execution (jobs always name their provider explicitly). At most
	// one per organization, enforced in application code (same pattern as
	// Organization.IsDefault) rather than a DB constraint.
	IsDefault bool `gorm:"not null;default:false"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

// Corpus is an organization-scoped RAG document collection. Its ID doubles
// as the vector-store namespace (seshat/pkg/rag.SearchRequest.CorpusID), so
// no separate namespace field is needed.
type Corpus struct {
	ID              string `gorm:"primaryKey;size:32"`
	OrganizationID  string `gorm:"size:32;not null;index"`
	CreatedByUserID string `gorm:"size:32;not null"`
	Name            string `gorm:"size:255;not null"`
	Description     string `gorm:"size:1000"`
	ChunkCount      int    `gorm:"not null;default:0"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// CorpusFile is one uploaded document attached to a Corpus, tracked through
// its ingestion lifecycle. OrganizationID is denormalized from the parent
// Corpus so listing/authorization doesn't require a join.
type CorpusFile struct {
	ID              string `gorm:"primaryKey;size:32"`
	CorpusID        string `gorm:"size:32;not null;index"`
	OrganizationID  string `gorm:"size:32;not null;index"`
	CreatedByUserID string `gorm:"size:32;not null"`
	Filename        string `gorm:"size:500;not null"`
	ContentType     string `gorm:"size:255"`
	StorageKey      string `gorm:"size:500;not null"` // seshat/pkg/storage.ArtifactStore key
	Size            int64  `gorm:"not null"`
	Status          string `gorm:"size:32;not null;index"` // pending | ingested | failed
	ChunkCount      int    `gorm:"not null;default:0"`
	IngestedAt      *time.Time
	// ConnectorAccountID/ExternalResourceID are set only for files pulled in
	// by a knowledge connector sync (nil/"" for a manual upload) - together
	// they let a re-sync upsert the same CorpusFile in place instead of
	// duplicating it. See connectors.Service.IngestFromConnector.
	ConnectorAccountID *string `gorm:"size:32;index"`
	ExternalResourceID string  `gorm:"size:1000"`
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

// ConnectorAccount is one connected external account (an S3 bucket, a
// Google Drive account, a SharePoint site) - org-scoped counterpart of
// seshat-backend's db.ConnectorAccount (per-user there). See
// docs/architecture.md's "Example: Knowledge connectors" for why this
// executes fully server-side instead of staying tied to a local device like
// Inbox connectors.
//
// CorpusID is nullable: today every account is Knowledge-purposed (set,
// synced into that corpus via knowledge.Service.IngestFromConnector), but
// the connection itself (OAuth grant / bucket credentials) is reusable
// infrastructure, not a Knowledge-only concept - see internal/server/
// connectors' package doc for why a future non-Knowledge use (e.g. an
// agent writing a file into the user's Drive, no corpus involved) likely
// means an MCP tool consuming this account's credentials, not a new Go
// interface in that package, and isn't precluded by this schema either way.
//
// Purpose distinguishes that future use from today's: "knowledge_sync"
// (every row today - org-admin-authorized, CorpusID set, polled by the
// sync scheduler) vs. "agent_action" (schema-ready, not created anywhere
// yet - a single employee's own OAuth grant, no CorpusID, resolved by
// CreatedByUserID at MCP-call time instead of by schedule). See
// connectors' package doc comment for what's still undesigned there.
type ConnectorAccount struct {
	ID                    string  `gorm:"primaryKey;size:32"`
	OrganizationID        string  `gorm:"size:32;not null;index"`
	CorpusID              *string `gorm:"size:32;index"`
	CreatedByUserID       string  `gorm:"size:32;not null"`
	Kind                  string  `gorm:"size:32;not null;index"`                          // "s3" today - see connectorKind
	Purpose               string  `gorm:"size:32;not null;index;default:'knowledge_sync'"` // "knowledge_sync" | "agent_action" - see doc comment above
	DisplayName           string  `gorm:"size:255;not null"`
	ExternalAccountID     string  `gorm:"size:500"`
	Status                string  `gorm:"size:32;not null;index"` // connected | error | disconnected
	AccessTokenEncrypted  string  `gorm:"type:text"`              // sdb.EncryptSecret, per-organization DEK
	RefreshTokenEncrypted string  `gorm:"type:text"`
	Config                string  `gorm:"type:text"` // connector-specific non-secret JSON config
	Scope                 string  `gorm:"size:500"`
	ExpiresAt             *time.Time
	SyncCursor            string `gorm:"type:text"`
	SyncIntervalSeconds   int    `gorm:"not null;default:3600"`
	NextSyncAt            *time.Time
	LastSyncedAt          *time.Time
	LastError             string `gorm:"type:text"`
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

// ConnectorSyncJob queues one ConnectorAccount sync attempt. Polled via the
// same atomic-claim idiom as KnowledgeIngestionJob (see
// connectors.Service.claimNextSyncJob), safe to run on more than
// one seshat-server process concurrently.
type ConnectorSyncJob struct {
	ID                 string `gorm:"primaryKey;size:32"`
	ConnectorAccountID string `gorm:"size:32;not null;index"`
	CorpusID           string `gorm:"size:32;not null;index"`
	OrganizationID     string `gorm:"size:32;not null;index"`
	Status             string `gorm:"size:32;not null;index"` // queued | running | completed | failed
	AttemptCount       int    `gorm:"not null;default:0"`
	MaxAttempts        int    `gorm:"not null;default:3"`
	ItemsSynced        int    `gorm:"not null;default:0"`
	LastError          string `gorm:"type:text"`
	NextRunAt          *time.Time
	StartedAt          *time.Time
	CompletedAt        *time.Time
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

// ConnectorOAuthApp is one organization's registered OAuth app credentials
// for an OAuth-based connector kind (gdrive, sharepoint) - the org-scoped
// counterpart of Provider's ClientID/ClientSecret, but for connector
// accounts rather than SSO login. One organization can register at most one
// app per kind (OrganizationID, Kind unique together). A confidential
// "Web application" client, not the native/desktop client type
// seshat-backend used - the callback is always this server's own fixed
// public URL, never a loopback, so a real client secret is expected and
// stored (see connectors' package doc, "Example: Knowledge connectors").
type ConnectorOAuthApp struct {
	ID                    string `gorm:"primaryKey;size:32"`
	OrganizationID        string `gorm:"size:32;not null;uniqueIndex:idx_connector_oauth_app_org_kind"`
	Kind                  string `gorm:"size:32;not null;uniqueIndex:idx_connector_oauth_app_org_kind"` // "gdrive" | "sharepoint"
	ClientID              string `gorm:"size:255;not null"`
	ClientSecretEncrypted string `gorm:"type:text;not null"` // sdb.EncryptSecret, per-organization DEK
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

// ConnectorOAuthState is one in-flight "connect an account" OAuth attempt,
// created by BeginConnectorOAuth and consumed (deleted) by
// CompleteConnectorOAuth - single-use, same lifecycle shape as
// OIDCLoginState (see its doc comment for the hashed-state/plaintext-PKCE-
// verifier reasoning, identical here). CorpusID/Purpose/DisplayName/
// SyncIntervalSeconds carry the console form's choices across the redirect
// round trip so CompleteConnectorOAuth can create the ConnectorAccount with
// them already set, without a second round trip. CorpusID is nullable like
// ConnectorAccount.CorpusID - every flow today still sets it (validated at
// the BeginConnectorOAuth API layer, unchanged), but a future
// agent_action-purposed connect (see ConnectorAccount's doc comment) won't
// have one, and this schema doesn't preclude that.
type ConnectorOAuthState struct {
	ID                  string  `gorm:"primaryKey;size:32"`
	OrganizationID      string  `gorm:"size:32;not null;index"`
	CorpusID            *string `gorm:"size:32"`
	Kind                string  `gorm:"size:32;not null"`                          // "gdrive" | "sharepoint"
	Purpose             string  `gorm:"size:32;not null;default:'knowledge_sync'"` // "knowledge_sync" | "agent_action" - see ConnectorAccount's doc comment
	CreatedByUserID     string  `gorm:"size:32;not null"`
	StateHash           string  `gorm:"uniqueIndex;size:64;not null"`
	CodeVerifier        string  `gorm:"size:255;not null"`
	DisplayName         string  `gorm:"size:255"`
	SyncIntervalSeconds int     `gorm:"not null;default:3600"`
	CreatedAt           time.Time
	ExpiresAt           time.Time
}

// KnowledgeIngestionJob queues one CorpusFile for chunk+embed+vector-upsert
// processing. Polled via an atomic claim (see knowledge.Service.
// claimNextIngestionJob), safe to run on more than one seshat-server
// process concurrently.
type KnowledgeIngestionJob struct {
	ID             string `gorm:"primaryKey;size:32"`
	CorpusID       string `gorm:"size:32;not null;index"`
	CorpusFileID   string `gorm:"size:32;not null;index"`
	OrganizationID string `gorm:"size:32;not null;index"`
	Filename       string `gorm:"size:500;not null"`
	Status         string `gorm:"size:32;not null;index"` // queued | running | completed | failed
	AttemptCount   int    `gorm:"not null;default:0"`
	MaxAttempts    int    `gorm:"not null;default:3"`
	ChunkCount     int    `gorm:"not null;default:0"`
	LastError      string `gorm:"type:text"`
	NextRunAt      *time.Time
	StartedAt      *time.Time
	CompletedAt    *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// EmbedderSetting is an organization's embedder configuration for RAG
// ingestion/search. A singleton per organization (uniqueIndex on
// OrganizationID alone) — unlike ProviderSetting, which allows several LLM
// providers per org, a corpus's vectors are all produced by whichever
// embedder was active at ingest time, so allowing more than one active
// embedder per org would risk silently mixing incompatible vector
// dimensions in the same namespace.
type EmbedderSetting struct {
	ID              string `gorm:"primaryKey;size:32"`
	OrganizationID  string `gorm:"size:32;not null;uniqueIndex"`
	CreatedByUserID string `gorm:"size:32;not null"`
	Provider        string `gorm:"size:32;not null"` // openai | ollama
	Model           string `gorm:"size:128;not null"`
	BaseURL         string `gorm:"size:500;not null"`
	EncryptedAPIKey string `gorm:"type:text"` // optional — e.g. a local Ollama needs none
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// ProspectingSweep is one organization-scoped business-discovery run
// (Google Places + French company-registry sweep, algorithm/external-API
// logic lives in the tenant-agnostic sibling module prospecting-core).
// Org-scoped rather than user-scoped like seshat-backend's local
// equivalent — Prospecting is team data, not private (see
// helps/audit-2026-08-10.md section 6): any organization member with
// prospecting.manage can continue a sweep a teammate started.
type ProspectingSweep struct {
	ID                  string  `gorm:"primaryKey;size:32"`
	OrganizationID      string  `gorm:"size:32;not null;index"`
	CreatedByUserID     string  `gorm:"size:32;not null"`
	Country             string  `gorm:"size:8;not null;default:'fr'"`
	AreaQuery           string  `gorm:"size:500;not null;default:''"`
	AreaLabel           string  `gorm:"size:500;not null;default:''"`
	CenterLat           float64 `gorm:"not null;default:0"`
	CenterLng           float64 `gorm:"not null;default:0"`
	RadiusKM            float64 `gorm:"not null;default:0"`
	SectorsJSON         string  `gorm:"type:text;not null;default:'[]'"`
	GridJSON            string  `gorm:"type:text;not null;default:'[]'"`
	NextUnitIndex       int     `gorm:"not null;default:0"`
	TotalUnits          int     `gorm:"not null;default:0"`
	Status              string  `gorm:"size:32;not null;default:'running';index"`
	BusinessesFound     int     `gorm:"not null;default:0"`
	RealPlacesCallsUsed int     `gorm:"not null;default:0"`
	LastError           string  `gorm:"type:text"`
	CreatedAt           time.Time
	UpdatedAt           time.Time
	CompletedAt         *time.Time
}

// ProspectingBusiness is one discovered candidate, unique per (sweep,
// place). OrganizationID is denormalized from the parent sweep so
// listing/authorization doesn't require a join — same convention as
// CorpusFile.OrganizationID.
type ProspectingBusiness struct {
	ID                string  `gorm:"primaryKey;size:32"`
	SweepID           string  `gorm:"size:32;not null;uniqueIndex:idx_pbiz_sweep_place"`
	OrganizationID    string  `gorm:"size:32;not null;index"`
	PlaceID           string  `gorm:"size:255;not null;default:'';uniqueIndex:idx_pbiz_sweep_place"`
	Sector            string  `gorm:"size:255;not null;default:''"`
	Name              string  `gorm:"size:500;not null;default:''"`
	FormattedAddress  string  `gorm:"size:500;not null;default:''"`
	PostalCode        string  `gorm:"size:16;not null;default:''"`
	City              string  `gorm:"size:255;not null;default:''"`
	Lat               float64 `gorm:"not null;default:0"`
	Lng               float64 `gorm:"not null;default:0"`
	Phone             string  `gorm:"size:64;not null;default:''"`
	Website           string  `gorm:"size:500;not null;default:''"`
	Rating            float64 `gorm:"not null;default:0"`
	UserRatingCount   int     `gorm:"not null;default:0"`
	BusinessStatus    string  `gorm:"size:32;not null;default:''"`
	OpeningHoursJSON  string  `gorm:"type:text;not null;default:'[]'"`
	SIREN             string  `gorm:"size:16;not null;default:'';index"`
	CompanyName       string  `gorm:"size:500;not null;default:''"`
	ExecutivesJSON    string  `gorm:"type:text;not null;default:'[]'"`
	MatchConfidence   float64 `gorm:"not null;default:0"`
	ReachabilityScore int     `gorm:"not null;default:0;index"`
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// ProspectingCache is a deliberately global (non-organization-scoped)
// cache of external lookups (geocoding, Google Places, French
// company-registry) — the cached data is factual/non-tenant, so sharing it
// across organizations reduces real API cost instead of multiplying it.
// Mirrors seshat-backend's local prospecting cache, which is likewise never
// scoped by user.
type ProspectingCache struct {
	Key        string    `gorm:"primaryKey;size:191"`
	Source     string    `gorm:"size:32;not null;index"`
	ValueJSON  string    `gorm:"type:text;not null;default:''"`
	StatusCode int       `gorm:"not null;default:0"`
	ExpiresAt  time.Time `gorm:"index"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// ProspectingUsage tracks real (non-cache-hit) Google Places calls against
// one organization's own daily budget — scoped by organization (unlike
// ProspectingCache) because each organization brings its own API key (see
// ProspectingSettings) and therefore has its own bill to protect.
type ProspectingUsage struct {
	ID             string `gorm:"primaryKey;size:32"`
	OrganizationID string `gorm:"size:32;not null;uniqueIndex:idx_pusage_org_period"`
	PeriodKey      string `gorm:"size:32;not null;uniqueIndex:idx_pusage_org_period"`
	SearchCalls    int64  `gorm:"not null;default:0"`
	DetailsCalls   int64  `gorm:"not null;default:0"`
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// ProspectingSettings is an organization's own Google Places API key and
// daily call budget — a singleton per organization (uniqueIndex on
// OrganizationID alone), same shape/rationale as EmbedderSetting. Strict
// BYOK: there is deliberately no platform-default fallback the way
// EmbedderSetting has (resolveEmbedderConfig) — sharing a paid Google key
// across organizations is a business decision, not a code default.
type ProspectingSettings struct {
	ID              string `gorm:"primaryKey;size:32"`
	OrganizationID  string `gorm:"size:32;not null;uniqueIndex"`
	CreatedByUserID string `gorm:"size:32;not null"`
	EncryptedAPIKey string `gorm:"type:text;not null"`
	DailyCap        int    `gorm:"not null;default:0"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// UserPreference is a strictly personal, one-row-per-user settings singleton
// — unlike ProviderSetting/EmbedderSetting, there is no organization column
// and no org/platform hierarchy: a preference only ever means one thing,
// "this user's own preference," so self-service (principal.User.ID implicit)
// is the only access path, see preferences.Service.
type UserPreference struct {
	UserID                    string `gorm:"primaryKey;size:32"`
	PreferredName             string `gorm:"size:200"`
	Profession                string `gorm:"size:200"`
	About                     string `gorm:"type:text"`
	WorkingStyle              string `gorm:"type:text"`
	ResponseStyle             string `gorm:"type:text"`
	ExtraContext              string `gorm:"type:text"`
	InteractivePermissionMode string `gorm:"size:32"`
	AutomationPermissionMode  string `gorm:"size:32"`
	MaxSubAgentDepth          int
	UpdatedAt                 time.Time
}

// OrganizationPreference is a singleton per organization providing default
// values for a subset of UserPreference's fields (working style, response
// style, extra context, permission modes, max sub-agent depth — deliberately
// NOT preferred_name/profession/about, which only make sense per-person).
// Resolution happens transparently inside preferences.Service.GetMyPreferences:
// a member's own UserPreference field wins whenever it's non-zero, otherwise
// this organization's value is used, falling back further to the
// platform-default organization's OrganizationPreference (see
// iam.SharedDomainOrganizationPreferences / DefaultOrganizationIDForDomain) —
// the same org→platform hierarchy already used by ProviderSetting/
// EmbedderSetting/etc.
type OrganizationPreference struct {
	ID                        string `gorm:"primaryKey;size:32"`
	OrganizationID            string `gorm:"size:32;not null;uniqueIndex"`
	CreatedByUserID           string `gorm:"size:32;not null"`
	WorkingStyle              string `gorm:"type:text"`
	ResponseStyle             string `gorm:"type:text"`
	ExtraContext              string `gorm:"type:text"`
	InteractivePermissionMode string `gorm:"size:32"`
	AutomationPermissionMode  string `gorm:"size:32"`
	MaxSubAgentDepth          int
	CreatedAt                 time.Time
	UpdatedAt                 time.Time
}

// SkillRepo is one entry in an organization's curated skills registry — just
// a bookmarked git repo URL, nothing secret, so unlike ProviderSetting there
// is no encryption. Reading the list only requires org membership (see
// skillregistry.Service), only mutating it is permission-gated. Unlike
// ProviderSetting/EmbedderSetting/MCPServerConfig there's no separate
// resolve endpoint for the org/platform-default fallback either - since
// there's nothing secret to keep out of the admin-facing list, the
// fallback (see Organization.ShareSkillRepos) lives directly in
// ListSkillRepos, with each row's Source saying which org it actually came
// from. seshat-backend fetches this same list to enrich its own local
// skill-repo catalog; installing (git clone) always happens locally.
type SkillRepo struct {
	ID              string `gorm:"primaryKey;size:32"`
	OrganizationID  string `gorm:"size:32;not null;uniqueIndex:idx_skill_repo_org_name;index"`
	CreatedByUserID string `gorm:"size:32;not null"`
	Name            string `gorm:"size:128;not null;uniqueIndex:idx_skill_repo_org_name"`
	URL             string `gorm:"size:500;not null"`
	Description     string `gorm:"size:500"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// AgentPreset is one entry in an organization's shared agent-preset catalog
// — mirrors seshat-backend's own gAgentDefinition (internal/db/agents.go)
// field for field, with OrganizationID/CreatedByUserID added (same shape as
// SkillRepo). Nothing here is secret (a system prompt, not a credential), so
// like SkillRepo there is no encryption and reading only requires org
// membership — only mutating is permission-gated (agents_registry.manage).
// This is purely additive on the seshat-backend side: it never replaces the
// existing 100%-local, unscoped agent_definitions table, only adds one more
// source resolved at query time (see helps/seshat-architecture-target.md §7).
type AgentPreset struct {
	ID                  string `gorm:"primaryKey;size:32"`
	OrganizationID      string `gorm:"size:32;not null;uniqueIndex:idx_agent_preset_org_slug;index"`
	CreatedByUserID     string `gorm:"size:32;not null"`
	Slug                string `gorm:"size:128;not null;uniqueIndex:idx_agent_preset_org_slug"`
	Name                string `gorm:"size:255;not null;default:''"`
	WhenToUse           string `gorm:"type:text;not null;default:''"`
	SystemPrompt        string `gorm:"type:text;not null;default:''"`
	Model               string `gorm:"size:255;not null;default:''"`
	ToolsJSON           string `gorm:"column:tools_json;type:text;not null;default:'[]'"`
	DisallowedToolsJSON string `gorm:"column:disallowed_tools_json;type:text;not null;default:'[]'"`
	MaxTurns            int    `gorm:"not null;default:50"`
	PermissionMode      string `gorm:"size:32;not null;default:''"`
	Isolation           string `gorm:"size:32;not null;default:''"`
	McpServersJSON      string `gorm:"column:mcp_servers_json;type:text;not null;default:'[]'"`
	Icon                string `gorm:"size:64;not null;default:'🤖'"`
	Enabled             bool   `gorm:"not null;default:true"`
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// UsageCounter mirrors seshat-backend's own gUsageCounter
// (internal/db/quotas.go) — a strictly personal, per-(user, metric, period)
// running total, no organization concept, same trust level as UserMemory/
// UserPreference. This is pure counting, never an enforced limit: there is
// no plan/tier concept anywhere in seshat-server yet (see
// helps/seshat-architecture-target.md §7, "Quotas") — migrating the
// counters is a storage-location change, not a step toward billing.
type UsageCounter struct {
	ID        string `gorm:"primaryKey;size:32"`
	UserID    string `gorm:"size:32;not null;uniqueIndex:idx_usage_counter_key"`
	Metric    string `gorm:"size:64;not null;uniqueIndex:idx_usage_counter_key"`
	PeriodKey string `gorm:"size:32;not null;uniqueIndex:idx_usage_counter_key"`
	Count     int64  `gorm:"not null;default:0"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

// WebSearchProviderSetting mirrors ProviderSetting's org→platform shape but
// for web-search providers (Tavily/Exa/Jina/LangSearch/SearXNG) — deliberately
// NOT a reuse of ProviderSetting: DefaultModel has no meaning for a search
// API, and SearXNG needs a second credential field (AuthUsername, basic auth)
// no LLM provider has. See websearchsettings.Service.
type WebSearchProviderSetting struct {
	ID              string `gorm:"primaryKey;size:32"`
	OrganizationID  string `gorm:"size:32;not null;uniqueIndex:idx_ws_provider_setting_org_provider;index"`
	CreatedByUserID string `gorm:"size:32;not null"`
	Provider        string `gorm:"size:32;not null;uniqueIndex:idx_ws_provider_setting_org_provider"`
	BaseURL         string `gorm:"size:500"`
	AuthUsername    string `gorm:"size:200"`
	EncryptedAPIKey string `gorm:"type:text;not null"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// WebSearchOrgPolicy is a strictly org-wide singleton (one row per org, no
// per-user variant server-side) — the domain allow/block list an org wants
// enforced for every member, merged into each user's own local policy in
// seshat-backend (blocked domains always apply, allowed domains are additive).
type WebSearchOrgPolicy struct {
	OrganizationID     string `gorm:"primaryKey;size:32"`
	CreatedByUserID    string `gorm:"size:32;not null"`
	AllowedDomainsJSON string `gorm:"column:allowed_domains_json;type:text;not null;default:'[]'"`
	BlockedDomainsJSON string `gorm:"column:blocked_domains_json;type:text;not null;default:'[]'"`
	UpdatedAt          time.Time
}

// ScimConnection is one organization's SCIM 2.0 provisioning connection
// (RFC 7643/7644) - an enterprise IdP (Okta, Entra ID, ...) authenticates
// against /scim/v2/* with the bearer token this row's TokenHash matches,
// scoped to exactly this organization. Deliberately one connection per org
// (uniqueIndex on OrganizationID alone, same shape as EmbedderSetting) - a
// second row for the same org replaces rather than adds a connection.
//
// TokenHash follows the one-way HashOpaqueToken pattern (see secrets.go),
// not EncryptSecret/DecryptSecret: like Device.Token or Invitation.Token,
// the raw value only needs to be *compared* at request time, never read
// back - it's shown to the admin once, at creation or rotation, and never
// again.
type ScimConnection struct {
	ID              string `gorm:"primaryKey;size:32"`
	OrganizationID  string `gorm:"size:32;not null;uniqueIndex"`
	CreatedByUserID string `gorm:"size:32;not null"`
	Name            string `gorm:"size:200;not null"`
	Enabled         bool   `gorm:"not null;default:true"`
	TokenHash       string `gorm:"size:64;not null;uniqueIndex"`
	// SyncGroups=false means /Groups pushes are recorded (ScimSyncEvent) for
	// visibility but never touch a real Group/GroupMember row - "metadata
	// only" mode. AutoCreateTeams only has an effect when SyncGroups=true.
	SyncGroups      bool `gorm:"not null;default:false"`
	AutoCreateTeams bool `gorm:"not null;default:false"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// ScimSyncEvent is an append-only log of SCIM protocol operations against
// one connection - the source of truth for the admin-facing "health" view
// (last sync, recent errors) rather than a separately maintained summary
// column, and deliberately not a retry queue: SCIM here is a synchronous,
// IdP-initiated push, so a well-formed SCIM error response IS the retry
// mechanism (the IdP's own scheduler retries), not something this table
// drives. OrganizationID is denormalized from ScimConnectionID so recent-
// activity queries don't need a join.
type ScimSyncEvent struct {
	ID               string `gorm:"primaryKey;size:32"`
	ScimConnectionID string `gorm:"size:32;not null;index"`
	OrganizationID   string `gorm:"size:32;not null;index:idx_scim_sync_event_org_created"`
	// Operation is e.g. "user.create", "user.patch", "user.delete",
	// "group.sync". ResourceType is "User" or "Group". ExternalID is the
	// IdP's id for the resource this operation targeted, when known.
	Operation    string    `gorm:"size:64;not null"`
	ResourceType string    `gorm:"size:32;not null"`
	ExternalID   string    `gorm:"size:255"`
	Success      bool      `gorm:"not null"`
	ErrorMessage string    `gorm:"type:text"`
	CreatedAt    time.Time `gorm:"index:idx_scim_sync_event_org_created"`
}

// MCPServerConfig is an organization's shared MCP server definition — a
// catalog entry that a connected seshat-backend can fetch and, once a user
// explicitly approves it locally, load into its own local MCP runtime.
// Execution never happens here: this table only stores/serves config, the
// same "config centralisée, exécution locale" split already used for
// provider settings and web search. No platform tier — an MCP tool shared
// across the entire platform (not just one org) doesn't have a clear use
// case today, unlike LLM/web-search provider defaults.
//
// One real exception to "execution never happens here" (2026-08-20):
// workspacechat.Service does execute MCP tool calls, inside seshat-server,
// as part of an interactive chat session - see mcpregistry.Service.
// ResolveServerConfigs, whose result now also feeds sdk.ClientConfig.
// MCPServers there, not just seshat-backend's remote fetch.
type MCPServerConfig struct {
	ID                   string `gorm:"primaryKey;size:32"`
	OrganizationID       string `gorm:"size:32;not null;uniqueIndex:idx_mcp_server_config_org_name;index"`
	CreatedByUserID      string `gorm:"size:32;not null"`
	Name                 string `gorm:"size:255;not null;uniqueIndex:idx_mcp_server_config_org_name"`
	DisplayName          string `gorm:"size:255;not null;default:''"`
	ServerType           string `gorm:"size:32;not null;default:'stdio'"`
	Command              string `gorm:"type:text;not null;default:''"`
	ArgsJSON             string `gorm:"column:args_json;type:text;not null;default:'[]'"`
	EncryptedEnvJSON     string `gorm:"column:encrypted_env_json;type:text;not null;default:''"`
	URL                  string `gorm:"type:text;not null;default:''"`
	EncryptedHeadersJSON string `gorm:"column:encrypted_headers_json;type:text;not null;default:''"`
	TimeoutSecs          int    `gorm:"not null;default:30"`
	Icon                 string `gorm:"size:64;not null;default:'🔌'"`
	// ConnectorKind, when non-empty ("gdrive" | "sharepoint"), marks this
	// server as needing a per-caller Bearer token bridged in from that
	// person's own agent_action-purposed connectors.ConnectorAccount rather
	// than relying solely on EncryptedHeadersJSON's static, server-wide
	// headers - see mcpregistry.Service.ResolveServerConfigs and
	// connectors.Service.AccessTokenForUser. Empty (the default, and the
	// only value before 2026-08-20) means static config only, unchanged.
	ConnectorKind string `gorm:"size:32;not null;default:''"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// UserMemory mirrors seshat-backend's own gUserMemory (internal/db/user_memories.go)
// — a flat, personal, multi-row-per-user memory list, no organization
// concept, same trust level as UserPreference.
type UserMemory struct {
	ID         string  `gorm:"primaryKey;size:32"`
	UserID     string  `gorm:"size:32;not null;index"`
	Type       string  `gorm:"size:64;not null;default:'fact'"`
	Key        string  `gorm:"type:text;not null;default:''"`
	Value      string  `gorm:"type:text;not null;default:''"`
	Importance float64 `gorm:"not null;default:0.5"`
	Source     string  `gorm:"size:255;not null;default:''"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// MemoryEntity/MemoryObservation/MemoryRelation mirror seshat-backend's own
// gMemoryEntity/gMemoryObservation/gMemoryRelation (internal/db/memories.go)
// field-for-field — the long-term memory knowledge graph behind the SDK's
// longterm.Store interface. Personal, no organization concept, same as
// UserMemory/UserPreference.
type MemoryEntity struct {
	ID         string `gorm:"primaryKey;size:32"`
	UserID     string `gorm:"size:32;not null;index"`
	Name       string `gorm:"type:text;not null"`
	EntityType string `gorm:"size:128;not null;default:'entity'"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type MemoryObservation struct {
	ID              string `gorm:"primaryKey;size:32"`
	EntityID        string `gorm:"size:32;not null;index"`
	Content         string `gorm:"type:text;not null"`
	SourceSessionID string `gorm:"size:32"`
	CreatedAt       time.Time
}

type MemoryRelation struct {
	ID           string `gorm:"primaryKey;size:32"`
	UserID       string `gorm:"size:32;not null;index"`
	FromName     string `gorm:"size:256;not null"`
	ToName       string `gorm:"size:256;not null"`
	RelationType string `gorm:"size:128;not null"`
	CreatedAt    time.Time
}

// WorkspaceChatSession is one persisted personal chat conversation (see
// internal/server/workspacechat) - a transient test surface, not a durable
// record: rows past workspacechat's 48h retention window are purged by its
// periodic cleanup and treated as "doesn't exist" by reads even before that
// sweep runs.
// ID is client-generated by the console (session.ID from
// features/workspaceChat/storage.ts, e.g. "wchat_" + a UUID), unlike every
// other ID in this file which comes from db.NewID's short prefix+12-hex
// format - it needs far more than the usual size:32.
type WorkspaceChatSession struct {
	ID             string `gorm:"primaryKey;size:64"`
	UserID         string `gorm:"size:32;not null;index:idx_workspace_chat_session_user"`
	OrganizationID string `gorm:"size:32;not null"`
	Title          string `gorm:"size:255"`
	CreatedAt      time.Time
	UpdatedAt      time.Time `gorm:"index"`
}

// WorkspaceChatMessageRecord is one persisted message in a
// WorkspaceChatSession. EventsJSON is empty for user messages; for
// assistant messages it's the ordered list of workspacechat.Event the turn
// streamed, so the console can replay them through the exact same reducer
// used live and end up with an identical rendered message (content + trace)
// after a reload, instead of duplicating that reconstruction logic in Go.
type WorkspaceChatMessageRecord struct {
	ID         string `gorm:"primaryKey;size:32"`
	SessionID  string `gorm:"size:64;not null;index:idx_workspace_chat_message_session"`
	Role       string `gorm:"size:16;not null"`
	Content    string `gorm:"type:text"`
	EventsJSON string `gorm:"type:text"`
	CreatedAt  time.Time
}
