package app

import (
	"context"
	"fmt"
	"time"

	sdkdocling "github.com/KPO-Tech/seshat/pkg/docling"
	sdkstorage "github.com/KPO-Tech/seshat/pkg/storage"
	sdkvector "github.com/KPO-Tech/seshat/pkg/vector"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/agentregistry"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/automation"
	serverconfig "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/config"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/connectors"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/longtermmemory"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mailer"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mcpregistry"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/memories"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/preferences"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/prospecting"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/quotas"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/skillregistry"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/websearchsettings"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/workspacechat"
)

type App struct {
	DB                   *sdb.DB
	IAM                  *iam.Service
	Automation           *automation.Service
	Scheduler            *automation.Scheduler
	Knowledge            *knowledge.Service
	IngestionRunner      *knowledge.Runner
	Connectors           *connectors.Service
	ConnectorSyncRunner  *connectors.Runner
	Prospecting          *prospecting.Service
	Preferences          *preferences.Service
	SkillRegistry        *skillregistry.Service
	WebSearchSettings    *websearchsettings.Service
	MCPRegistry          *mcpregistry.Service
	Memories             *memories.Service
	LongTermMemory       *longtermmemory.Service
	AgentRegistry        *agentregistry.Service
	Quotas               *quotas.Service
	WorkspaceChat        *workspacechat.Service
	WorkspaceChatCleanup *workspacechat.Cleanup
	MembershipExpiry     *iam.MembershipExpiry
}

func New(cfg serverconfig.Config) (*App, error) {
	database, err := sdb.Open(cfg.DB)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	if err := database.Migrate(); err != nil {
		return nil, fmt.Errorf("migrate database: %w", err)
	}

	iamService := iam.New(database, cfg.SessionTTL)
	if err := iamService.EnsureSuperAdmin(context.Background(), cfg.BootstrapAdminEmail, cfg.BootstrapAdminPassword); err != nil {
		return nil, fmt.Errorf("ensure super admin: %w", err)
	}
	iamService.SetPublicAPIURL(cfg.PublicAPIURL)
	if err := iamService.SetOrgMode(string(cfg.OrgMode)); err != nil {
		return nil, fmt.Errorf("set org mode: %w", err)
	}
	if cfg.SMTPHost != "" {
		iamService.SetMailer(mailer.NewSMTPSender(mailer.Config{
			Host:     cfg.SMTPHost,
			Port:     cfg.SMTPPort,
			Username: cfg.SMTPUsername,
			Password: cfg.SMTPPassword,
			From:     cfg.SMTPFrom,
		}), cfg.PublicAppURL)
	}
	automationService := automation.New(database, iamService)

	artifactStore, err := sdkstorage.NewArtifactStoreFromConfig(cfg.Storage)
	if err != nil {
		return nil, fmt.Errorf("open artifact storage: %w", err)
	}
	// Lets cloud-targeted job execution's SDK client persist file I/O
	// (bash/file tool artifacts) to the same store knowledge corpus files
	// use, instead of falling back to ClientConfig's own local-disk default
	// — see automation.Service.SetArtifactStore's doc comment.
	automationService.SetArtifactStore(artifactStore)
	vectorStore, err := sdkvector.NewStore(context.Background(), cfg.Vector)
	if err != nil {
		return nil, fmt.Errorf("open vector store: %w", err)
	}
	// The embedder itself is resolved dynamically per organization at
	// ingest/search time (org override, else the platform default — see
	// knowledge.Service.resolveEmbedderConfig), not configured here. Until
	// an embedder is set up for a given organization, Ingest/Search return
	// a clear "not configured" error; corpus/file management works either way.
	knowledgeService := knowledge.New(database, iamService, artifactStore, vectorStore)
	if cfg.DoclingURL != "" {
		// Converts PDF/DOCX/PPTX/XLSX/audio/images to markdown before
		// chunking. Optional — plain-text/markdown/JSON ingest fine without it.
		//
		// doclingIngestTimeout replaces the SDK client's 120s default:
		// extractTextWithDocling routes every corpus document through
		// docling unconditionally (no native-extraction shortcut, see its
		// own doc comment), and a several-hundred-page PDF on a CPU-only
		// docling-serve can genuinely take longer than two minutes — 120s
		// would fail it outright rather than let it finish.
		const doclingIngestTimeout = 15 * time.Minute
		knowledgeService = knowledgeService.WithDocling(sdkdocling.NewClient(cfg.DoclingURL, sdkdocling.WithTimeout(doclingIngestTimeout)))
	}
	// Lets cloud-targeted job execution enable rag_search/rag_ingest,
	// scoped per organization — see automation.Service.RAGResolver.
	automationService.SetRAGResolver(knowledgeService)
	// Lets cloud-targeted job execution enable read_document_url (fetch +
	// convert an arbitrary URL via docling) — a plain server-wide setting,
	// not per-tenant, since docling-serve isn't a secret or credential.
	automationService.SetDoclingURL(cfg.DoclingURL)

	connectorsService := connectors.New(database, iamService, knowledgeService)
	// Lets gdrive/sharepoint's OAuth connect flow build the fixed,
	// server-owned callback URL every registered OAuth app targets — see
	// connectors.Service.SetPublicAPIURL's doc comment.
	connectorsService.SetPublicAPIURL(cfg.PublicAPIURL)

	mcpRegistryService := mcpregistry.New(database, iamService)
	// Lets a ConnectorKind-tagged MCP server resolve with a per-employee
	// Bearer token bridged in from their own connected account — see
	// mcpregistry.Service.SetConnectorTokenResolver's doc comment.
	mcpRegistryService.SetConnectorTokenResolver(connectorsService)
	// Lets cloud-targeted job execution bridge its creator's own per-
	// employee MCP servers/tokens (Slack/Outlook/Teams/Gmail, ...) the same
	// way workspacechat's interactive sessions already do — see
	// automation.Service.MCPResolver's doc comment for why the creator, not
	// some other identity, is what a ScheduledJob resolves against.
	automationService.SetMCPResolver(mcpRegistryService)

	webSearchService := websearchsettings.New(database, iamService)
	workspaceChatService := workspacechat.New(database, iamService, automationService, webSearchService, knowledgeService, mcpRegistryService, cfg.DoclingURL)

	return &App{
		DB:                   database,
		IAM:                  iamService,
		Automation:           automationService,
		Scheduler:            automation.NewScheduler(automationService, cfg.SchedulerInterval).WithStaleRunTimeout(cfg.StaleRunTimeout),
		Knowledge:            knowledgeService,
		IngestionRunner:      knowledge.NewRunner(knowledgeService, knowledge.RunnerConfig{PollInterval: cfg.IngestionPollInterval, MaxPollInterval: cfg.IngestionMaxPollInterval}),
		Connectors:           connectorsService,
		ConnectorSyncRunner:  connectors.NewRunner(connectorsService, connectors.RunnerConfig{PollInterval: cfg.IngestionPollInterval, MaxPollInterval: cfg.IngestionMaxPollInterval}),
		Prospecting:          prospecting.New(database, iamService),
		Preferences:          preferences.New(database, iamService),
		SkillRegistry:        skillregistry.New(database, iamService),
		WebSearchSettings:    webSearchService,
		MCPRegistry:          mcpRegistryService,
		Memories:             memories.New(database),
		LongTermMemory:       longtermmemory.New(database),
		AgentRegistry:        agentregistry.New(database, iamService),
		Quotas:               quotas.New(database),
		WorkspaceChat:        workspaceChatService,
		WorkspaceChatCleanup: workspacechat.NewCleanup(workspaceChatService, time.Hour),
		MembershipExpiry:     iam.NewMembershipExpiry(iamService, cfg.MembershipConfirmationWindow, time.Hour),
	}, nil
}
