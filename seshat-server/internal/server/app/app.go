package app

import (
	"fmt"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/automation"
	serverconfig "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/config"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

type App struct {
	DB         *sdb.DB
	IAM        *iam.Service
	Automation *automation.Service
	Scheduler  *automation.Scheduler
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

	return &App{
		DB:         database,
		IAM:        iamService,
		Automation: automationService,
		Scheduler:  automation.NewScheduler(automationService, cfg.SchedulerInterval).WithStaleRunTimeout(cfg.StaleRunTimeout),
	}, nil
}
