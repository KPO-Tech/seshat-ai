package app

import (
	"context"
	"fmt"

	sdkdocling "github.com/EngineerProjects/seshat/pkg/docling"
	sdkstorage "github.com/EngineerProjects/seshat/pkg/storage"
	sdkvector "github.com/EngineerProjects/seshat/pkg/vector"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/automation"
	serverconfig "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/config"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/longtermmemory"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mcpregistry"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/memories"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/preferences"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/skillregistry"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/websearchsettings"
)

type App struct {
	DB                *sdb.DB
	IAM               *iam.Service
	Automation        *automation.Service
	Scheduler         *automation.Scheduler
	Knowledge         *knowledge.Service
	IngestionRunner   *knowledge.Runner
	Preferences       *preferences.Service
	SkillRegistry     *skillregistry.Service
	WebSearchSettings *websearchsettings.Service
	MCPRegistry       *mcpregistry.Service
	Memories          *memories.Service
	LongTermMemory    *longtermmemory.Service
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
	automationService := automation.New(database, iamService)

	artifactStore, err := sdkstorage.NewArtifactStoreFromConfig(cfg.Storage)
	if err != nil {
		return nil, fmt.Errorf("open artifact storage: %w", err)
	}
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
		knowledgeService = knowledgeService.WithDocling(sdkdocling.NewClient(cfg.DoclingURL))
	}
	// Lets cloud-targeted job execution enable rag_search/rag_ingest,
	// scoped per organization — see automation.Service.RAGResolver.
	automationService.SetRAGResolver(knowledgeService)
	// Lets cloud-targeted job execution enable read_document_url (fetch +
	// convert an arbitrary URL via docling) — a plain server-wide setting,
	// not per-tenant, since docling-serve isn't a secret or credential.
	automationService.SetDoclingURL(cfg.DoclingURL)

	return &App{
		DB:                database,
		IAM:               iamService,
		Automation:        automationService,
		Scheduler:         automation.NewScheduler(automationService, cfg.SchedulerInterval).WithStaleRunTimeout(cfg.StaleRunTimeout),
		Knowledge:         knowledgeService,
		IngestionRunner:   knowledge.NewRunner(knowledgeService, knowledge.RunnerConfig{PollInterval: cfg.IngestionPollInterval, MaxPollInterval: cfg.IngestionMaxPollInterval}),
		Preferences:       preferences.New(database),
		SkillRegistry:     skillregistry.New(database, iamService),
		WebSearchSettings: websearchsettings.New(database, iamService),
		MCPRegistry:       mcpregistry.New(database, iamService),
		Memories:          memories.New(database),
		LongTermMemory:    longtermmemory.New(database),
	}, nil
}
