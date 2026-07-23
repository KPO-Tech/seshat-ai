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
	IsActive  bool `gorm:"not null;default:true"`
	CreatedAt time.Time
	UpdatedAt time.Time
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

// SkillRepo is one entry in an organization's curated skills registry — just
// a bookmarked git repo URL, nothing secret, so unlike ProviderSetting there
// is no encryption and no org/platform tiering: reading the list only
// requires org membership (see skillregistry.Service), only mutating it is
// permission-gated. seshat-backend fetches these to enrich its own local
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

// PlatformWebSearchProviderSetting is the platform-wide default web-search
// provider setting. Unlike ProviderSetting/EmbedderSetting, this domain has
// not been migrated to the "flagged default organization" fallback model
// yet - it remains its own global singleton table.
type PlatformWebSearchProviderSetting struct {
	ID              string `gorm:"primaryKey;size:32"`
	CreatedByUserID string `gorm:"size:32;not null"`
	Provider        string `gorm:"size:32;not null;uniqueIndex"`
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

// MCPServerConfig is an organization's shared MCP server definition — a
// catalog entry that a connected seshat-backend can fetch and, once a user
// explicitly approves it locally, load into its own local MCP runtime.
// Execution never happens here: this table only stores/serves config, the
// same "config centralisée, exécution locale" split already used for
// provider settings and web search. No platform tier — an MCP tool shared
// across the entire platform (not just one org) doesn't have a clear use
// case today, unlike LLM/web-search provider defaults.
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
	CreatedAt            time.Time
	UpdatedAt            time.Time
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
