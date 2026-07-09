package app

import (
	"fmt"

	sdkstorage "github.com/EngineerProjects/seshat/pkg/storage"

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
	// RAG service is nil until an embedder is configured (platform-wide
	// default + org override — see ROADMAP.md's "Knowledge base / RAG
	// domain" step 2). Corpus/file management works either way; ingestion
	// and search return a clear "not configured" error until then.
	knowledgeService := knowledge.New(database, iamService, artifactStore, nil)

	return &App{
		DB:              database,
		IAM:             iamService,
		Automation:      automationService,
		Scheduler:       automation.NewScheduler(automationService, cfg.SchedulerInterval).WithStaleRunTimeout(cfg.StaleRunTimeout),
		Knowledge:       knowledgeService,
		IngestionRunner: knowledge.NewRunner(knowledgeService, knowledge.RunnerConfig{PollInterval: cfg.IngestionPollInterval, MaxPollInterval: cfg.IngestionMaxPollInterval}),
	}, nil
}
