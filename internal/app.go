package nexus

import (
	"github.com/EngineerProjects/nexus-engine/pkg/docling"
	longterm "github.com/EngineerProjects/nexus-engine/pkg/memory/longterm"
	"github.com/EngineerProjects/nexus-engine/pkg/rag"
	"github.com/EngineerProjects/nexus-engine/pkg/storage"
	"github.com/EngineerProjects/nexus-product/internal/agents"
	"github.com/EngineerProjects/nexus-product/internal/audit"
	"github.com/EngineerProjects/nexus-product/internal/auth"
	"github.com/EngineerProjects/nexus-product/internal/db"
	"github.com/EngineerProjects/nexus-product/internal/files"
	"github.com/EngineerProjects/nexus-product/internal/knowledge"
	"github.com/EngineerProjects/nexus-product/internal/mcp"
	"github.com/EngineerProjects/nexus-product/internal/memories"
	"github.com/EngineerProjects/nexus-product/internal/metrics"
	"github.com/EngineerProjects/nexus-product/internal/plans"
	"github.com/EngineerProjects/nexus-product/internal/preferences"
	"github.com/EngineerProjects/nexus-product/internal/query"
	"github.com/EngineerProjects/nexus-product/internal/quotas"
	"github.com/EngineerProjects/nexus-product/internal/resources"
	"github.com/EngineerProjects/nexus-product/internal/scheduler"
	"github.com/EngineerProjects/nexus-product/internal/settings"
	"github.com/EngineerProjects/nexus-product/internal/skills"
	"github.com/EngineerProjects/nexus-product/internal/websearch"
)

// Dependencies holds the external dependencies wired by the transport layer.
type Dependencies struct {
	Identity                 *db.IdentityStore
	APIKeyStore              *db.APIKeyStore // nil = api keys disabled
	GroupStore               *db.GroupStore  // nil = groups disabled
	AuthConfig               auth.ServiceConfig
	QueryRuntime             query.QueryRuntime
	SessionManager           query.SessionManager
	SessionOwnership         *db.SessionOwnershipStore // nil = unscoped mode
	FileStore                *db.FileStore             // nil = files domain disabled
	CorpusStore              *db.CorpusStore           // nil = knowledge domain disabled
	IngestionJobStore        *db.KnowledgeIngestionJobStore
	SettingStore             *db.ProviderSettingStore // nil = settings domain disabled
	OAuthStore               *db.ProviderOAuthConnectionStore
	OAuthClients             settings.OAuthClientFactory
	WebSearchSettings        *db.WebSearchSettingStore
	WebSearchLogs            *db.WebSearchLogStore
	WebSearchProviderConfigs *db.SearchProviderConfigStore
	WebSearchRunner          websearch.Runner
	EmbedderConfigStore      *db.EmbedderConfigStore
	AuditLogStore            *db.AuditLogStore     // nil = audit logging disabled
	UsageCounterStore        *db.UsageCounterStore // nil = quota tracking disabled
	ArtifactStore            storage.ArtifactStore // nil = blob storage disabled
	RAGService               *rag.Service          // nil = embedder not configured
	Monitoring               metrics.Snapshotter
	DoclingClient            *docling.Client // nil = no auto-conversion
	// New services
	UserMemoryStore      *db.UserMemoryStore
	LongTermMemoryStore  *db.LongTermMemoryStore
	LongTermExtractor    *longterm.Extractor
	PlanDocumentStore    *db.PlanDocumentStore
	MCPServerStore       *db.MCPServerStore
	MCPRuntime           mcp.RuntimeReloader // nil = reload/status not available
	UserPreferencesStore *db.UserPreferencesStore
	AgentDefinitionStore *db.AgentDefinitionStore
	ScheduledJobStore    *db.ScheduledJobStore // nil = scheduler disabled
}

// App is the root backend service container.
// Each field is a domain service; add new domains here as the product grows.
type App struct {
	Auth        *auth.Service
	Query       *query.Service
	Resources   *resources.Service
	Files       *files.Service
	Knowledge   *knowledge.Service
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
	Scheduler   *scheduler.Service
}

func NewApp(deps Dependencies) *App {
	settingsService := settings.NewService(deps.SettingStore, deps.OAuthStore, deps.OAuthClients)
	webSearchService := websearch.NewService(deps.WebSearchSettings, deps.WebSearchLogs, deps.WebSearchProviderConfigs, settingsService, deps.WebSearchRunner)
	memoriesService := memories.NewService(deps.UserMemoryStore, deps.LongTermMemoryStore, deps.LongTermExtractor)
	preferencesService := preferences.NewService(deps.UserPreferencesStore)
	filesService := files.NewService(deps.FileStore, deps.ArtifactStore).WithDocling(deps.DoclingClient)
	knowledgeService := knowledge.NewService(deps.CorpusStore, deps.FileStore, deps.IngestionJobStore, deps.ArtifactStore, deps.RAGService).WithDocling(deps.DoclingClient)
	skillsService := skills.NewService()
	agentsService := agents.NewService(deps.AgentDefinitionStore)
	schedulerService := scheduler.NewService(deps.ScheduledJobStore)
	return &App{
		Auth: auth.NewService(deps.Identity, deps.APIKeyStore, deps.GroupStore, deps.AuthConfig),
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
		Resources: resources.NewService(deps.Identity),
		Files:     filesService,
		Knowledge: knowledgeService,
		Settings:  settingsService,
		WebSearch: webSearchService,
		Audit:     audit.NewService(deps.AuditLogStore),
		Quota:     quotas.NewService(deps.UsageCounterStore),
		Metrics:   metrics.NewService(deps.Monitoring),
		Memories:  memoriesService,
		Plans:     plans.NewService(deps.PlanDocumentStore),
		MCP: mcp.NewService(mcp.ServiceConfig{
			Store:   deps.MCPServerStore,
			Runtime: deps.MCPRuntime,
		}),
		Preferences: preferencesService,
		Skills:      skillsService,
		Agents:      agentsService,
		Scheduler:   schedulerService,
	}
}
