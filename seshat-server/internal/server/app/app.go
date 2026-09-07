package app

import (
	"context"
	"fmt"
	"time"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
	dataflowexpr "github.com/KPO-Tech/seshat/pkg/dataflow/expr"
	dataflownodes "github.com/KPO-Tech/seshat/pkg/dataflow/nodes"
	dataflowdatabase "github.com/KPO-Tech/seshat/pkg/dataflow/nodes/database"
	sdkdocling "github.com/KPO-Tech/seshat/pkg/docling"
	sdkstorage "github.com/KPO-Tech/seshat/pkg/storage"
	sdkvector "github.com/KPO-Tech/seshat/pkg/vector"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/agentregistry"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/automation"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/bundles"
	serverconfig "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/config"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/connectors"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/dataflowsecrets"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/dataflowvariables"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/hookregistry"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/longtermmemory"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mailer"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mcpregistry"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/memories"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/preferences"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/prospecting"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/quotas"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/scim"
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
	Scim                 *scim.Service
	MCPRegistry          *mcpregistry.Service
	HookRegistry         *hookregistry.Service
	Bundles              *bundles.Service
	DataflowSecrets      *dataflowsecrets.Service
	Variables            *dataflowvariables.Service
	Memories             *memories.Service
	LongTermMemory       *longtermmemory.Service
	AgentRegistry        *agentregistry.Service
	Quotas               *quotas.Service
	WorkspaceChat        *workspacechat.Service
	WorkspaceChatCleanup *workspacechat.Cleanup
	MembershipExpiry     *iam.MembershipExpiry
	JobRunPurge          *automation.JobRunPurge
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
	knowledgeService := knowledge.New(database, iamService, artifactStore, vectorStore).
		WithChunkProfile(cfg.KnowledgeChunkProfile)
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

	dataflowSecretsService := dataflowsecrets.New(database, iamService)
	// Lets a cloud-targeted job's Graph resolve org-scoped named secrets
	// (e.g. a "postgres" node's dsnSecretRef) — see
	// automation.Service.DataflowSecretResolver's doc comment.
	automationService.SetSecretResolver(dataflowSecretsService)

	dataflowVariablesService := dataflowvariables.New(database, iamService)
	// Lets a cloud-targeted job's Graph (and expression preview) resolve
	// org-scoped named variables ($vars.NAME, Tier 3.2) - see
	// automation.Service.DataflowVariableResolver's doc comment.
	automationService.SetVariablesResolver(dataflowVariablesService)
	// Which node types a Graph can reference — generic (http_request/
	// filter/if/switch/set/merge/wait, no credentials) plus database
	// (postgres/mysql/sqlite/redis/mongodb/elasticsearch, credential-
	// resolving). Both come from the SDK; nothing here is seshat-ai-
	// specific — see automation.Service.SetNodeRegistry's doc comment for
	// why this is a deployment-level choice rather than a package default.
	nodeRegistry := dataflow.NewRegistry()
	dataflow.RegisterBuiltins(nodeRegistry)
	exprPool := dataflowexpr.NewPool(8)
	dataflownodes.Register(nodeRegistry, exprPool)
	dataflowdatabase.Register(nodeRegistry)
	automationService.SetNodeRegistry(nodeRegistry)
	// Reuses the same pool filter/if/switch/set already got above so a
	// Graph's every node type (http_request included) shares one
	// expression engine - see automation.Service.SetExpressionEvaluator's
	// doc comment.
	automationService.SetExpressionEvaluator(exprPool)

	connectorsService := connectors.New(database, iamService, knowledgeService)
	// Lets gdrive/sharepoint's OAuth connect flow build the fixed,
	// server-owned callback URL every registered OAuth app targets — see
	// connectors.Service.SetPublicAPIURL's doc comment.
	connectorsService.SetPublicAPIURL(cfg.PublicAPIURL)
	// "gmail_new_messages" and the send-action nodes below all need a real
	// connector-token resolver (*connectors.Service satisfies
	// automation.ConnectorTokenResolver structurally), so they're registered
	// here rather than alongside the generic/database nodes above, which
	// need no such dependency.
	nodeRegistry.Register("gmail_new_messages", automation.NewGmailPollNode(database, connectorsService))
	nodeRegistry.Register("gmail_send_email", automation.NewGmailSendNode(connectorsService))
	nodeRegistry.Register("outlook_send_email", automation.NewOutlookSendNode(connectorsService))
	nodeRegistry.Register("teams_send_message", automation.NewTeamsSendNode(connectorsService))
	nodeRegistry.Register("notion_create_page", automation.NewNotionCreatePageNode(connectorsService))
	nodeRegistry.Register("stripe_create_customer", automation.NewStripeCreateCustomerNode(connectorsService))
	nodeRegistry.Register("gsheets_append_row", automation.NewGSheetsAppendRowNode(connectorsService))
	nodeRegistry.Register("gcalendar_create_event", automation.NewGCalendarCreateEventNode(connectorsService))
	nodeRegistry.Register("jira_create_issue", automation.NewJiraCreateIssueNode(connectorsService))
	nodeRegistry.Register("sendgrid_send_email", automation.NewSendGridSendEmailNode(connectorsService))
	nodeRegistry.Register("mailgun_send_email", automation.NewMailgunSendEmailNode(connectorsService))
	nodeRegistry.Register("postmark_send_email", automation.NewPostmarkSendEmailNode(connectorsService))
	nodeRegistry.Register("telegram_send_message", automation.NewTelegramSendMessageNode(connectorsService))
	nodeRegistry.Register("discord_send_message", automation.NewDiscordSendMessageNode(connectorsService))
	nodeRegistry.Register("trello_create_card", automation.NewTrelloCreateCardNode(connectorsService))
	nodeRegistry.Register("airtable_create_record", automation.NewAirtableCreateRecordNode(connectorsService))
	nodeRegistry.Register("github_create_issue", automation.NewGitHubCreateIssueNode(connectorsService))
	nodeRegistry.Register("asana_create_task", automation.NewAsanaCreateTaskNode(connectorsService))
	nodeRegistry.Register("linear_create_issue", automation.NewLinearCreateIssueNode(connectorsService))
	nodeRegistry.Register("hubspot_create_contact", automation.NewHubSpotCreateContactNode(connectorsService))
	nodeRegistry.Register("intercom_create_contact", automation.NewIntercomCreateContactNode(connectorsService))
	nodeRegistry.Register("pipedrive_create_deal", automation.NewPipedriveCreateDealNode(connectorsService, connectorsService))
	nodeRegistry.Register("salesforce_create_record", automation.NewSalesforceCreateRecordNode(connectorsService, connectorsService))
	nodeRegistry.Register("zendesk_create_ticket", automation.NewZendeskCreateTicketNode(connectorsService, connectorsService))

	mcpRegistryService := mcpregistry.New(database, iamService)
	hookRegistryService := hookregistry.New(database, iamService)
	// Lets a ConnectorKind-tagged MCP server resolve with a per-employee
	// Bearer token bridged in from their own connected account — see
	// mcpregistry.Service.SetConnectorTokenResolver's doc comment.
	mcpRegistryService.SetConnectorTokenResolver(connectorsService)
	// Same bridging for static-secret connector kinds (stripe, trello,
	// airtable, ...) whose own official MCP server takes a pasted API key
	// instead of OAuth — see mcpregistry.Service.SetStaticSecretResolver's
	// doc comment.
	mcpRegistryService.SetStaticSecretResolver(connectorsService)
	// Lets cloud-targeted job execution bridge its creator's own per-
	// employee MCP servers/tokens (Slack/Outlook/Teams/Gmail, ...) the same
	// way workspacechat's interactive sessions already do — see
	// automation.Service.MCPResolver's doc comment for why the creator, not
	// some other identity, is what a ScheduledJob resolves against.
	automationService.SetMCPResolver(mcpRegistryService)

	webSearchService := websearchsettings.New(database, iamService)
	workspaceChatService := workspacechat.New(database, iamService, automationService, webSearchService, knowledgeService, mcpRegistryService, cfg.DoclingURL)

	skillRegistryService := skillregistry.New(database, iamService)
	agentRegistryService := agentregistry.New(database, iamService)
	bundlesService := bundles.New(database, iamService, skillRegistryService, mcpRegistryService, agentRegistryService, hookRegistryService)

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
		SkillRegistry:        skillRegistryService,
		WebSearchSettings:    webSearchService,
		Scim:                 scim.New(database, iamService),
		MCPRegistry:          mcpRegistryService,
		HookRegistry:         hookRegistryService,
		Bundles:              bundlesService,
		DataflowSecrets:      dataflowSecretsService,
		Variables:            dataflowVariablesService,
		Memories:             memories.New(database),
		LongTermMemory:       longtermmemory.New(database),
		AgentRegistry:        agentRegistryService,
		Quotas:               quotas.New(database),
		WorkspaceChat:        workspaceChatService,
		WorkspaceChatCleanup: workspacechat.NewCleanup(workspaceChatService, time.Hour),
		MembershipExpiry:     iam.NewMembershipExpiry(iamService, cfg.MembershipConfirmationWindow, time.Hour),
		JobRunPurge:          automation.NewJobRunPurge(automationService, cfg.JobRunMaxAge, cfg.JobRunMaxCountPerJob, cfg.JobRunPurgeInterval),
	}, nil
}
