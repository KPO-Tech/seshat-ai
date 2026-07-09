package app

import (
	"context"
	"fmt"

	sdkstorage "github.com/EngineerProjects/seshat/pkg/storage"
	sdkvector "github.com/EngineerProjects/seshat/pkg/vector"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/automation"
	serverconfig "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/config"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
)

type App struct {
	DB              *sdb.DB
	IAM             *iam.Service
	Automation      *automation.Service
	Scheduler       *automation.Scheduler
	Knowledge       *knowledge.Service
	IngestionRunner *knowledge.Runner
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

	return &App{
		DB:              database,
		IAM:             iamService,
		Automation:      automationService,
		Scheduler:       automation.NewScheduler(automationService, cfg.SchedulerInterval).WithStaleRunTimeout(cfg.StaleRunTimeout),
		Knowledge:       knowledgeService,
		IngestionRunner: knowledge.NewRunner(knowledgeService, knowledge.RunnerConfig{PollInterval: cfg.IngestionPollInterval, MaxPollInterval: cfg.IngestionMaxPollInterval}),
	}, nil
}
