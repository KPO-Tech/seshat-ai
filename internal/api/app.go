package api

import (
	"net"

	longterm "github.com/EngineerProjects/nexus-engine/pkg/memory/longterm"
	nexus "github.com/EngineerProjects/nexus_ai/internal"
	"github.com/EngineerProjects/nexus_ai/internal/db"
	backendquery "github.com/EngineerProjects/nexus_ai/internal/query"
	"github.com/EngineerProjects/nexus_ai/internal/scheduler"
)

// App is the HTTP transport layer. It holds only infrastructure state;
// all business logic lives in nexus.App.
type App struct {
	backend *nexus.App
	db      *db.DB
	// Direct DB stores not yet wrapped in backend services
	modelStore         *db.ProviderModelStore
	groupStore         *db.GroupStore
	embedderStore      *db.EmbedderConfigStore
	storageConfigStore *db.StorageConfigStore
	// Long-term memory — kept here because extraction is fire-and-forget
	// and depends on the extractor which lives outside nexus.App lifecycle
	longTermExtractor     *longterm.Extractor
	rateLimiter           *RateLimiter
	loginRateLimiter      *RateLimiter
	permBroker            *backendquery.PermissionBroker
	promptBroker          *backendquery.PromptBroker
	schedulerWorker       *scheduler.Worker
	enableSignup          bool
	enableAPIKeys         bool
	featuredRepos         []FeaturedSkillRepo
	trustedProxyCIDRs     []*net.IPNet
	allowedSkillRepoHosts []string
}

// AppConfig holds all configuration needed to build an App.
type AppConfig struct {
	Backend               *nexus.App
	DB                    *db.DB
	ModelStore            *db.ProviderModelStore
	GroupStore            *db.GroupStore
	EmbedderStore         *db.EmbedderConfigStore
	StorageConfigStore    *db.StorageConfigStore
	LongTermExtractor     *longterm.Extractor
	RateLimiter           *RateLimiter
	LoginRateLimiter      *RateLimiter
	SchedulerWorker       *scheduler.Worker
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
		permBroker:            backendquery.NewPermissionBroker(),
		promptBroker:          backendquery.NewPromptBroker(),
		enableSignup:          cfg.EnableSignup,
		enableAPIKeys:         cfg.EnableAPIKeys,
		featuredRepos:         cfg.FeaturedRepos,
		trustedProxyCIDRs:     cfg.TrustedProxyCIDRs,
		allowedSkillRepoHosts: cfg.AllowedSkillRepoHosts,
	}
}
