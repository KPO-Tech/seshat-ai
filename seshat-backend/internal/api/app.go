package api

import (
	"context"
	"net"
	"sync"
	"time"

	seshat "github.com/EngineerProjects/seshat-ai/seshat-backend/internal"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/artifactpreview"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/automation"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inboxwhatsapp"
	backendquery "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/query"
	longterm "github.com/KPO-Tech/seshat/pkg/memory/longterm"
	"github.com/KPO-Tech/seshat/pkg/sdk"
)

// App is the HTTP transport layer. It holds only infrastructure state;
// all business logic lives in seshat.App.
type App struct {
	backend *seshat.App
	db      *db.DB
	// Direct DB stores not yet wrapped in backend services
	modelStore          *db.ProviderModelStore
	groupStore          *db.GroupStore
	embedderStore       *db.EmbedderConfigStore
	capabilityLinkStore *db.CapabilityLinkStore
	// providerSettingStore is used only by the capability-links handlers to
	// list/validate local chat providers as reuse candidates - everything
	// else that needs full provider CRUD/OAuth goes through the abstracted
	// backend.Settings service instead (see internal/settings.Provider),
	// which also supports connected/cloud mode. Capability links are a
	// local-device-only concept (like embedderStore, doclingStore below),
	// so this is deliberately the raw local store, not the abstraction.
	providerSettingStore *db.ProviderSettingStore
	doclingStore         *db.DoclingConfigStore
	localSTTStore        *db.LocalSTTConfigStore
	storageConfigStore   *db.StorageConfigStore
	// Long-term memory — kept here because extraction is fire-and-forget
	// and depends on the extractor which lives outside seshat.App lifecycle
	longTermExtractor *longterm.Extractor
	rateLimiter       *RateLimiter
	loginRateLimiter  *RateLimiter
	permBroker        *backendquery.PermissionBroker
	promptBroker      *backendquery.PromptBroker
	// terminalRelay is shared with the SDKRuntime constructed in bootstrap.go
	// (via SDKRuntime.SetTerminalRelay) — both need the same instance so a
	// terminal registered here is visible to bash-tool calls there.
	terminalRelay         *backendquery.TerminalRelay
	cloudAutomation       *cloudautomation.Service
	artifactPreviews      *artifactpreview.Store
	enableSignup          bool
	enableAPIKeys         bool
	featuredRepos         []FeaturedSkillRepo
	trustedProxyCIDRs     []*net.IPNet
	allowedSkillRepoHosts []string
	// connectedServerURL is non-empty iff identity runs in connected mode
	// (SESHAT_SERVER_URL configured) — see helps/seshat-architecture-target.md §1.
	// The organization is resolved fresh per request from the caller's own
	// principal (see auth.Principal.OrganizationID) instead of being
	// configured here - seshat-server enforces at most one organization per
	// user account, so there's no deployment-time value to store.
	connectedServerURL string
	// transcribeAudio defaults to sdk.TranscribeAudio; overridden in tests to
	// avoid a real network call. baseURL is empty for OpenAI's cloud API, or
	// a local whisper-server URL when local transcription is configured
	// (see local_stt.go) — apiKey is ignored in that case.
	transcribeAudio func(ctx context.Context, apiKey string, audioData []byte, baseURL string) (*sdk.TranscriptionResult, error)
	// gmailOAuthStates tracks in-flight Gmail OAuth authorization requests
	// (state -> issuing principal + expiry) for CSRF protection across the
	// start/callback round trip. In-memory is fine: this app is a single
	// desktop-local process, and a state is only ever alive for the few
	// seconds/minutes a user takes to complete Google's consent screen.
	gmailOAuthMu     sync.Mutex
	gmailOAuthStates map[string]gmailOAuthState
	whatsappManager  *inboxwhatsapp.Manager
}

// AppConfig holds all configuration needed to build an App.
type AppConfig struct {
	Backend               *seshat.App
	DB                    *db.DB
	ModelStore            *db.ProviderModelStore
	GroupStore            *db.GroupStore
	EmbedderStore         *db.EmbedderConfigStore
	CapabilityLinkStore   *db.CapabilityLinkStore
	ProviderSettingStore  *db.ProviderSettingStore
	DoclingStore          *db.DoclingConfigStore
	LocalSTTStore         *db.LocalSTTConfigStore
	StorageConfigStore    *db.StorageConfigStore
	LongTermExtractor     *longterm.Extractor
	RateLimiter           *RateLimiter
	LoginRateLimiter      *RateLimiter
	CloudAutomation       *cloudautomation.Service
	EnableSignup          bool
	EnableAPIKeys         bool
	FeaturedRepos         []FeaturedSkillRepo
	TrustedProxyCIDRs     []*net.IPNet
	AllowedSkillRepoHosts []string
	ConnectedServerURL    string
	// TerminalRelay, when set, is shared with the SDKRuntime constructed in
	// bootstrap.go so a terminal registered via the WS handler here is
	// visible to bash-tool calls made through that runtime. Falls back to a
	// standalone instance (matching prior behavior) when nil, e.g. in tests
	// that construct an App without a full bootstrap.
	TerminalRelay *backendquery.TerminalRelay
	// WhatsAppManager is nil when the WhatsApp connector isn't registered
	// (see config/bootstrap.go's whatsappDialectFor) - only the pairing
	// endpoint needs direct access to it; everything else goes through
	// Backend.Inbox's channel-agnostic API.
	WhatsAppManager *inboxwhatsapp.Manager
}

func NewApp(cfg AppConfig) *App {
	terminalRelay := cfg.TerminalRelay
	if terminalRelay == nil {
		terminalRelay = backendquery.NewTerminalRelay()
	}
	artifactPreviews := artifactpreview.NewStore()
	// Best-effort periodic cleanup of expired previews - Get() already
	// self-evicts on access, this only matters for entries nobody ever
	// re-requests. No explicit shutdown: this loops for the process's
	// lifetime, same as the app's other daemon-style background work.
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			artifactPreviews.Sweep()
		}
	}()
	return &App{
		gmailOAuthStates:      make(map[string]gmailOAuthState),
		whatsappManager:       cfg.WhatsAppManager,
		backend:               cfg.Backend,
		db:                    cfg.DB,
		modelStore:            cfg.ModelStore,
		groupStore:            cfg.GroupStore,
		embedderStore:         cfg.EmbedderStore,
		capabilityLinkStore:   cfg.CapabilityLinkStore,
		providerSettingStore:  cfg.ProviderSettingStore,
		doclingStore:          cfg.DoclingStore,
		localSTTStore:         cfg.LocalSTTStore,
		storageConfigStore:    cfg.StorageConfigStore,
		longTermExtractor:     cfg.LongTermExtractor,
		rateLimiter:           cfg.RateLimiter,
		loginRateLimiter:      cfg.LoginRateLimiter,
		cloudAutomation:       cfg.CloudAutomation,
		permBroker:            backendquery.NewPermissionBroker(),
		promptBroker:          backendquery.NewPromptBroker(),
		terminalRelay:         terminalRelay,
		artifactPreviews:      artifactPreviews,
		enableSignup:          cfg.EnableSignup,
		enableAPIKeys:         cfg.EnableAPIKeys,
		featuredRepos:         cfg.FeaturedRepos,
		trustedProxyCIDRs:     cfg.TrustedProxyCIDRs,
		allowedSkillRepoHosts: cfg.AllowedSkillRepoHosts,
		connectedServerURL:    cfg.ConnectedServerURL,
		transcribeAudio: func(ctx context.Context, apiKey string, audioData []byte, baseURL string) (*sdk.TranscriptionResult, error) {
			if baseURL != "" {
				return sdk.TranscribeAudio(ctx, apiKey, audioData, sdk.WithTranscribeBaseURL(baseURL))
			}
			return sdk.TranscribeAudio(ctx, apiKey, audioData)
		},
	}
}
