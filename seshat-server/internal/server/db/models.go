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
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Membership binds one user to one organization with a role.
type Membership struct {
	ID             string `gorm:"primaryKey;size:32"`
	UserID         string `gorm:"size:32;not null;uniqueIndex:idx_membership_user_org;index:idx_membership_user"`
	OrganizationID string `gorm:"size:32;not null;uniqueIndex:idx_membership_user_org;index:idx_membership_org"`
	Role           string `gorm:"size:64;not null"`
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
type PolicyBinding struct {
	ID              string   `gorm:"primaryKey;size:32"`
	OrganizationID  string   `gorm:"size:32;not null;index"`
	Name            string   `gorm:"size:255;not null"`
	Description     string   `gorm:"type:text"`
	SubjectType     string   `gorm:"size:32;not null"`
	SubjectID       string   `gorm:"size:64;not null;index"`
	PermissionCodes []string `gorm:"serializer:json;type:text"`
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
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// PlatformProviderSetting is the platform-wide default credential set for
// one LLM provider — not scoped to any organization. Cloud-targeted runs use
// it when the run's own organization has no ProviderSetting configured for
// the requested provider (see automation.Service.resolveProviderCredentials):
// an org can bring its own key (ProviderSetting), or fall back to Seshat's
// own default, the same shape a paid-subscription org would use without
// ever configuring its own credentials. Superadmin-only (User.IsAdmin), not
// gated by any organization permission — there is no organization to check
// one against.
type PlatformProviderSetting struct {
	ID              string `gorm:"primaryKey;size:32"`
	CreatedByUserID string `gorm:"size:32;not null"`
	Provider        string `gorm:"size:32;not null;uniqueIndex"`
	DefaultModel    string `gorm:"size:128;not null"`
	BaseURL         string `gorm:"size:500"`
	EncryptedAPIKey string `gorm:"type:text;not null"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
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
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// KnowledgeIngestionJob queues one CorpusFile for chunk+embed+vector-upsert
// processing. Polled by a single-instance worker, same pattern as
// automation.Scheduler's run-queuing (see its doc comment on the
// multi-instance limitation — the same caveat applies here).
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
