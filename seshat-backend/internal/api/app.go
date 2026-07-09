package api

import (
	"net"

	seshat "github.com/EngineerProjects/seshat-ai/seshat-backend/internal"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	backendquery "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/query"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/scheduler"
	longterm "github.com/EngineerProjects/seshat/pkg/memory/longterm"
)

// App is the HTTP transport layer. It holds only infrastructure state;
// all business logic lives in seshat.App.
type App struct {
	backend *seshat.App
	db      *db.DB
	// Direct DB stores not yet wrapped in backend services
	modelStore         *db.ProviderModelStore
	groupStore         *db.GroupStore
	embedderStore      *db.EmbedderConfigStore
	storageConfigStore *db.StorageConfigStore
	// Long-term memory — kept here because extraction is fire-and-forget
	// and depends on the extractor which lives outside seshat.App lifecycle
	longTermExtractor     *longterm.Extractor
	rateLimiter           *RateLimiter
	loginRateLimiter      *RateLimiter
	permBroker            *backendquery.PermissionBroker
	promptBroker          *backendquery.PromptBroker
	schedulerWorker       *scheduler.Worker
	automationClient      *AutomationClient
	enableSignup          bool
	enableAPIKeys         bool
	featuredRepos         []FeaturedSkillRepo
	trustedProxyCIDRs     []*net.IPNet
	allowedSkillRepoHosts []string
}

// AppConfig holds all configuration needed to build an App.
type AppConfig struct {
	Backend               *seshat.App
	DB                    *db.DB
	ModelStore            *db.ProviderModelStore
	GroupStore            *db.GroupStore
	EmbedderStore         *db.EmbedderConfigStore
	StorageConfigStore    *db.StorageConfigStore
	LongTermExtractor     *longterm.Extractor
	RateLimiter           *RateLimiter
	LoginRateLimiter      *RateLimiter
	SchedulerWorker       *scheduler.Worker
	AutomationServiceURL  string // AUTOMATION_SERVICE_URL env var; empty = disabled
	AutomationAPIKey      string // AUTOMATION_API_KEY env var; empty = no auth
	EnableSignup          bool
	EnableAPIKeys         bool
	FeaturedRepos         []FeaturedSkillRepo
	TrustedProxyCIDRs     []*net.IPNet
	AllowedSkillRepoHosts []string
}

func NewApp(cfg AppConfig) *App {
	return &App{
		backend:               cfg.Backend,
		db:                    cfg.DB,
		modelStore:            cfg.ModelStore,
		groupStore:            cfg.GroupStore,
		embedderStore:         cfg.EmbedderStore,
		storageConfigStore:    cfg.StorageConfigStore,
		longTermExtractor:     cfg.LongTermExtractor,
		rateLimiter:           cfg.RateLimiter,
		loginRateLimiter:      cfg.LoginRateLimiter,
		schedulerWorker:       cfg.SchedulerWorker,
		automationClient:      NewAutomationClient(cfg.AutomationServiceURL, cfg.AutomationAPIKey),
		permBroker:            backendquery.NewPermissionBroker(),
		promptBroker:          backendquery.NewPromptBroker(),
		enableSignup:          cfg.EnableSignup,
		enableAPIKeys:         cfg.EnableAPIKeys,
		featuredRepos:         cfg.FeaturedRepos,
		trustedProxyCIDRs:     cfg.TrustedProxyCIDRs,
		allowedSkillRepoHosts: cfg.AllowedSkillRepoHosts,
	}
}
