package seshat

import (
	"context"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/agents"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/audit"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/agents"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/mcp"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/websearch"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/files"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inbox"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/knowledge"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/knowledgegdrive"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/mcp"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/memories"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/metrics"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/plans"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/preferences"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/query"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/quotas"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/settings"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/skills"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/websearch"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/workflows"
	"github.com/KPO-Tech/seshat/pkg/docling"
	longterm "github.com/KPO-Tech/seshat/pkg/memory/longterm"
	"github.com/KPO-Tech/seshat/pkg/rag"
	"github.com/KPO-Tech/seshat/pkg/storage"
)

// Dependencies holds the external dependencies wired by the transport layer.
type Dependencies struct {
	Identity    *db.IdentityStore
	APIKeyStore *db.APIKeyStore // nil = api keys disabled
	GroupStore  *db.GroupStore  // nil = groups disabled
	AuthConfig  auth.ServiceConfig
	// AuthProvider selects standalone vs connected identity (see ROADMAP.md,
	// "Direction: seshat-server becomes the multi-tenant backbone"). nil =
	// auth.NewLocalProvider(Identity), i.e. today's standalone behavior —
	// set only by bootstrap.go when connected mode is active. Connected mode
	// is not user-configurable: it is decided at boot by a reachability probe
	// against a build-fixed seshat-server URL (defaultServerURL in
	// internal/config/bootstrap.go), deliberately not an environment
	// variable — see that file's doc comment for why.
	AuthProvider      auth.Provider
	QueryRuntime      query.QueryRuntime
	SessionManager    query.SessionManager
	SessionOwnership  *db.SessionOwnershipStore // nil = unscoped mode
	FileStore         *db.FileStore             // nil = files domain disabled
	CorpusStore       *db.CorpusStore           // nil = knowledge domain disabled
	IngestionJobStore *db.KnowledgeIngestionJobStore
	SettingStore      *db.ProviderSettingStore // nil = settings domain disabled
	OAuthStore        *db.ProviderOAuthConnectionStore
	OAuthClients      settings.OAuthClientFactory
	// SettingsProvider selects standalone vs connected provider-settings
	// resolution (org → platform → local personal key). nil =
	// settings.NewLocalProvider(...), i.e. today's local-only behavior — set
	// only by bootstrap.go when connected mode is active (see
	// internal/config/bootstrap.go).
	SettingsProvider         settings.Provider
	WebSearchSettings        *db.WebSearchSettingStore
	WebSearchLogs            *db.WebSearchLogStore
	WebSearchProviderConfigs *db.SearchProviderConfigStore
	WebSearchRunner          websearch.Runner
	// WebSearchCloudClient enriches the local provider-resolution chain and
	// domain policy with a connected seshat-server's org/platform web-search
	// config — nil in standalone mode, set only by bootstrap.go when
	// connected mode is active (see internal/config/bootstrap.go). The
	// organization itself is resolved fresh per call from the caller's own
	// principal (see auth.Principal.OrganizationID), not configured here.
	// See internal/cloudwebsearch's package doc.
	WebSearchCloudClient *cloudwebsearch.Client
	// KnowledgeBackend selects standalone vs connected Documents storage.
	// nil = knowledge.NewService(CorpusStore, FileStore, IngestionJobStore,
	// ArtifactStore, RAGService), i.e. today's local-only behavior — set only
	// by bootstrap.go to a *cloudknowledge.RemoteService when connected mode
	// is active (see internal/config/bootstrap.go). Unlike MCP/agents/
	// web-search (which enrich the local behavior with an org catalog),
	// this is a clean swap: in connected mode
	// there is exactly one set of corpora, the organization's, not local
	// corpora plus org corpora. See internal/cloudknowledge's package doc.
	KnowledgeBackend    knowledge.Backend
	EmbedderConfigStore *db.EmbedderConfigStore
	AuditLogStore       *db.AuditLogStore     // nil = audit logging disabled
	UsageCounterStore   *db.UsageCounterStore // nil = quota tracking disabled
	ArtifactStore       storage.ArtifactStore // nil = blob storage disabled
	RAGService          *rag.Service          // nil = embedder not configured
	Monitoring          metrics.Snapshotter
	// ResolveDoclingClient returns the docling client to use for a given
	// call, re-evaluated on every invocation (not cached) — nil = no
	// auto-conversion. Set by bootstrap.go to check the user's persisted
	// Settings > Knowledge override first, falling back to whatever was
	// resolved from config.DoclingURL at boot (see docling_config.go's
	// doc comment for the priority order).
	ResolveDoclingClient func(ctx context.Context) *docling.Client
	// New services
	UserMemoryStore *db.UserMemoryStore
	// LongTermMemoryStore is longterm.Store (an SDK interface), not a
	// concrete store type — bootstrap.go picks *db.LongTermMemoryStore
	// (standalone) or *cloudlongterm.RemoteStore (connected) before
	// constructing Dependencies. See internal/memories.Service's own
	// longTermStore field for why this is an interface.
	LongTermMemoryStore longterm.Store
	LongTermExtractor   *longterm.Extractor
	PlanDocumentStore   *db.PlanDocumentStore
	MCPServerStore      *db.MCPServerStore
	MCPRuntime          mcp.RuntimeReloader // nil = reload/status not available
	// MCPCloudClient/MCPOrgServerApprovals enrich the local MCP runtime with
	// a connected seshat-server's shared server catalog, once the user has
	// explicitly approved each one — nil in standalone mode, set only by
	// bootstrap.go when connected mode is active (see
	// internal/config/bootstrap.go). The organization itself is resolved
	// fresh per request (see api.requestOrganizationID), not configured
	// here. See internal/cloudmcp's package doc.
	MCPCloudClient        *cloudmcp.Client
	MCPOrgServerApprovals *db.MCPOrgServerApprovalStore
	UserPreferencesStore  *db.UserPreferencesStore
	AgentDefinitionStore  *db.AgentDefinitionStore
	// AgentsCloudClient enriches local agent resolution with a connected
	// seshat-server's shared preset catalog, once a caller has an
	// authenticated principal — nil in standalone mode, set only by
	// bootstrap.go when connected mode is active (see
	// internal/config/bootstrap.go). The organization itself is resolved
	// fresh per call from the caller's own principal (see
	// auth.Principal.OrganizationID). Purely additive, see
	// internal/agents.Service's own doc comment.
	AgentsCloudClient *cloudagents.Client
	// PreferencesProvider selects standalone vs connected preferences storage.
	// nil = preferences.NewLocalProvider(UserPreferencesStore), i.e. today's
	// local-only behavior — set only by bootstrap.go when connected mode is
	// active (see internal/config/bootstrap.go).
	PreferencesProvider preferences.Provider
	// MemoriesProvider selects standalone vs connected flat-memory-list
	// storage. nil = memories.NewLocalProvider(UserMemoryStore), i.e.
	// today's local-only behavior — set only by bootstrap.go when connected
	// mode is active (see internal/config/bootstrap.go).
	MemoriesProvider memories.Provider
	// QuotaProvider selects standalone vs connected usage-counter storage.
	// nil = quotas.NewLocalProvider(UsageCounterStore), i.e. today's
	// local-only behavior — set only by bootstrap.go when connected mode is
	// active (see internal/config/bootstrap.go). Pure counting either way,
	// never an enforced limit.
	QuotaProvider quotas.Provider
	// Inbox is pre-built by bootstrap.go (not assembled here from raw
	// stores like most other services) because its Connector registrations
	// depend on which channel credentials (e.g. GOOGLE_OAUTH_CLIENT_ID) are
	// configured in the environment - that decision belongs where the rest
	// of the env-var-driven optional integrations already live. nil = the
	// inbox domain is disabled (no routes registered).
	Inbox *inbox.Service
	// KnowledgeGDrive/KnowledgeGDriveAccounts follow the same
	// bootstrap.go-owned, env-var-gated pattern as Inbox above - nil = the
	// Google Drive Knowledge connector is disabled (no routes registered).
	// See helps/roadmap.md Phase 1.
	KnowledgeGDrive         *knowledgegdrive.Connector
	KnowledgeGDriveAccounts *db.ConnectorAccountStore
}

// App is the root backend service container.
// Each field is a domain service; add new domains here as the product grows.
type App struct {
	Auth        *auth.Service
	Query       *query.Service
	Files       *files.Service
	Knowledge   knowledge.Backend
	Settings    *settings.Service
	WebSearch   *websearch.Service
	Audit       *audit.Service
	Quota       *quotas.Service
	Metrics     *metrics.Service
	Memories    *memories.Service
	Plans       *plans.Service
	MCP         *mcp.Service
	Preferences *preferences.Service
	Skills      *skills.Service
	Agents      *agents.Service
	Workflows   *workflows.Service
	Inbox       *inbox.Service

	KnowledgeGDrive         *knowledgegdrive.Connector
	KnowledgeGDriveAccounts *db.ConnectorAccountStore
}

func NewApp(deps Dependencies) *App {
	authProvider := deps.AuthProvider
	if authProvider == nil {
		authProvider = auth.NewLocalProvider(deps.Identity, deps.AuthConfig)
	}
	localSettingsProvider := settings.NewLocalProvider(deps.SettingStore, deps.OAuthStore, deps.OAuthClients)
	settingsProvider := deps.SettingsProvider
	if settingsProvider == nil {
		settingsProvider = localSettingsProvider
	}
	settingsService := settings.NewService(settingsProvider, localSettingsProvider)
	webSearchService := websearch.NewService(deps.WebSearchSettings, deps.WebSearchLogs, deps.WebSearchProviderConfigs, settingsService, deps.WebSearchRunner, deps.WebSearchCloudClient)
	memoriesProvider := deps.MemoriesProvider
	if memoriesProvider == nil {
		memoriesProvider = memories.NewLocalProvider(deps.UserMemoryStore)
	}
	memoriesService := memories.NewService(memoriesProvider, deps.LongTermMemoryStore, deps.LongTermExtractor)
	preferencesProvider := deps.PreferencesProvider
	if preferencesProvider == nil {
		preferencesProvider = preferences.NewLocalProvider(deps.UserPreferencesStore)
	}
	preferencesService := preferences.NewService(preferencesProvider)
	filesService := files.NewService(deps.FileStore, deps.ArtifactStore).WithDocling(deps.ResolveDoclingClient)
	knowledgeService := deps.KnowledgeBackend
	if knowledgeService == nil {
		knowledgeService = knowledge.NewService(deps.CorpusStore, deps.FileStore, deps.IngestionJobStore, deps.ArtifactStore, deps.RAGService).WithDocling(deps.ResolveDoclingClient)
	}
	// Give the Drive connector the same Docling-backed extraction an
	// uploaded file gets, instead of ingesting a downloaded PDF/DOCX's raw
	// bytes as text (unsearchable garbage - found via a real end-to-end
	// test, see helps/roadmap.md Phase 1). Only possible against the local
	// *knowledge.Service (IngestExternal's own home) - connected mode's
	// RemoteService isn't wired for connector-driven ingestion in this
	// phase either.
	if concreteKnowledge, ok := knowledgeService.(*knowledge.Service); ok && deps.KnowledgeGDrive != nil {
		deps.KnowledgeGDrive.WithTextExtractor(concreteKnowledge.ExtractText)
	}
	skillsService := skills.NewService()
	agentsService := agents.NewService(deps.AgentDefinitionStore, deps.AgentsCloudClient)
	quotaProvider := deps.QuotaProvider
	if quotaProvider == nil {
		quotaProvider = quotas.NewLocalProvider(deps.UsageCounterStore)
	}
	return &App{
		Auth: auth.NewService(authProvider, deps.Identity, deps.APIKeyStore, deps.GroupStore, deps.AuthConfig),
		Query: query.NewService(query.ServiceConfig{
			Runtime:     deps.QueryRuntime,
			Sessions:    deps.SessionManager,
			Ownership:   deps.SessionOwnership,
			Settings:    settingsService,
			WebSearch:   webSearchService,
			Memories:    memoriesService,
			Preferences: preferencesService,
			Knowledge:   knowledgeService,
			Files:       filesService,
			Skills:      skillsService,
			Agents:      agentsService,
		}),
		Files:     filesService,
		Knowledge: knowledgeService,
		Settings:  settingsService,
		WebSearch: webSearchService,
		Audit:     audit.NewService(deps.AuditLogStore),
		Quota:     quotas.NewService(quotaProvider),
		Metrics:   metrics.NewService(deps.Monitoring),
		Memories:  memoriesService,
		Plans:     plans.NewService(deps.PlanDocumentStore),
		MCP: mcp.NewService(mcp.ServiceConfig{
			Store:       deps.MCPServerStore,
			Runtime:     deps.MCPRuntime,
			CloudClient: deps.MCPCloudClient,
			Approvals:   deps.MCPOrgServerApprovals,
		}),
		Preferences: preferencesService,
		Skills:      skillsService,
		Agents:      agentsService,
		Inbox:       deps.Inbox,

		KnowledgeGDrive:         deps.KnowledgeGDrive,
		KnowledgeGDriveAccounts: deps.KnowledgeGDriveAccounts,
		Workflows:               workflows.New(settingsService),
	}
}
