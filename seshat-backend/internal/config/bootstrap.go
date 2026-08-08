// Package config assembles the full application from infrastructure config.
// It is the single place that wires DB stores, RAG, MCP, skills, and the
// SDK query runtime into a ready-to-serve *api.App.
package config

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	seshat "github.com/EngineerProjects/seshat-ai/seshat-backend/internal"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/agents"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/api"
	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloudagents"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloudautomation"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloudidentity"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloudknowledge"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloudlongterm"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloudmcp"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloudmemories"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloudpreferences"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloudquotas"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloudsettings"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloudwebsearch"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inbox"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inboxgmail"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inboxtool"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inboxwhatsapp"
	backendknowledge "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/knowledge"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/knowledgetool"
	backendmemories "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/memories"
	backendpreferences "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/preferences"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/prospecting"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/prospectingtool"
	backendquery "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/query"
	backendquotas "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/quotas"
	backendsettings "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/settings"
	appconfig "github.com/KPO-Tech/seshat/pkg/config"
	"github.com/KPO-Tech/seshat/pkg/docling"
	"github.com/KPO-Tech/seshat/pkg/mcp"
	longterm "github.com/KPO-Tech/seshat/pkg/memory/longterm"
	"github.com/KPO-Tech/seshat/pkg/monitoring"
	"github.com/KPO-Tech/seshat/pkg/providers"
	"github.com/KPO-Tech/seshat/pkg/rag"
	ragembedder "github.com/KPO-Tech/seshat/pkg/rag/embedder"
	"github.com/KPO-Tech/seshat/pkg/rag/reranker"
	"github.com/KPO-Tech/seshat/pkg/sdk"
	skillsloader "github.com/KPO-Tech/seshat/pkg/skills"
	managedskills "github.com/KPO-Tech/seshat/pkg/skills/managed"
	"github.com/KPO-Tech/seshat/pkg/skills/skillrepos"
	"github.com/KPO-Tech/seshat/pkg/storage"
	enginetypes "github.com/KPO-Tech/seshat/pkg/types"
	"github.com/KPO-Tech/seshat/pkg/vector"
)

// defaultServerURL is the seshat-server this build talks to when it's
// reachable - a source-level constant, not an environment variable or user
// setting. seshat-server access is Seshat's paid managed-service tier;
// shipping a way to point the app at a different server (env var, Settings
// field) would let anyone retarget it to their own free self-hosted
// instance. TODO: replace with the real production URL once seshat-server
// is actually deployed - localhost:8081 only matches the local Docker
// compose stack under deploy/.
const defaultServerURL = "http://localhost:8081"

// serverReachable does a short, best-effort health check against
// defaultServerURL, deciding at boot whether this run connects to
// seshat-server or falls back to fully standalone/local mode. Checked once
// per process start (see helps/seshat-architecture-target.md §1 on why this
// is a boot-time decision, not a live toggle) - restart the app to pick up
// a server that just came up, or drop out of connected mode if it's gone.
func serverReachable(ctx context.Context, url string) bool {
	reqCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, url+"/health", nil)
	if err != nil {
		return false
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode < 500
}

// BuildApp wires all infrastructure (DB, stores, query runtime, RAG, MCP, skills)
// and returns a ready-to-serve *api.App, a cleanup function, and an error.
//
// The returned cleanup function tears down the query client, vector DB (if any),
// and the primary database. It must be called on shutdown.
func BuildApp(ctx context.Context, config appconfig.Config) (*api.App, func() error, error) {
	var cleanups []func() error
	cleanup := func() error {
		for i := len(cleanups) - 1; i >= 0; i-- {
			_ = cleanups[i]()
		}
		return nil
	}

	otelShutdown, err := monitoring.InitTracer(ctx, "seshat")
	if err != nil {
		fmt.Fprintf(os.Stderr, "[API] Avertissement OTel: %v\n", err)
	}
	cleanups = append(cleanups, func() error { return otelShutdown(context.Background()) })

	logProviderDiscovery(ctx)

	storageCfg := storage.Config{
		Provider:          storage.ProviderType(config.StorageProvider),
		LocalPath:         appconfig.EffectiveStorageLocalPath(config),
		S3Endpoint:        config.S3Endpoint,
		S3Bucket:          config.S3Bucket,
		S3AccessKeyID:     config.S3AccessKeyID,
		S3SecretAccessKey: config.S3SecretAccessKey,
		S3Region:          config.S3Region,
		S3KeyPrefix:       config.S3KeyPrefix,
	}
	storage.SetConfig(storageCfg)

	if err := storage.HealthCheck(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "[API] Avertissement storage: %v\n", err)
	} else {
		fmt.Printf("[API] Storage initialisé: %s\n", storage.GetProviderType())
		fmt.Printf("[API] Runtime root: %s\n", appconfig.EffectiveRuntimeRoot(config))
	}

	workingDir := config.Cwd
	if strings.TrimSpace(workingDir) == "" {
		workingDir = "."
	}

	var dbConfig db.Config
	switch db.Driver(config.DBDriver) {
	case db.DriverPostgres:
		dbConfig = db.DefaultPostgresConfig(config.DBDSN)
	case db.DriverMySQL:
		dbConfig = db.DefaultMySQLConfig(config.DBDSN)
	default:
		dbConfig = db.DefaultSQLiteConfig(appconfig.EffectiveBackendSQLitePath(config))
	}
	dbConfig.AutoMigrate = config.DBAutoMigrate
	database, err := db.Open(ctx, dbConfig)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init DB: %w", err)
	}
	cleanups = append(cleanups, database.Close)

	identityStore, err := db.NewIdentityStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init identity store: %w", err)
	}

	apiKeyStore, err := db.NewAPIKeyStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init api key store: %w", err)
	}

	groupStore, err := db.NewGroupStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init group store: %w", err)
	}

	sessionOwnershipStore, err := db.NewSessionOwnershipStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init session ownership store: %w", err)
	}

	fileStore, err := db.NewFileStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init file store: %w", err)
	}

	corpusStore, err := db.NewCorpusStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init corpus store: %w", err)
	}

	ingestionJobStore, err := db.NewKnowledgeIngestionJobStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init ingestion job store: %w", err)
	}

	channelAccountStore, err := db.NewChannelAccountStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init channel account store: %w", err)
	}
	inboxContactStore, err := db.NewInboxContactStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init inbox contact store: %w", err)
	}
	inboxThreadStore, err := db.NewInboxThreadStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init inbox thread store: %w", err)
	}
	inboxMessageStore, err := db.NewInboxMessageStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init inbox message store: %w", err)
	}
	inboxService := inbox.NewService(channelAccountStore, inboxContactStore, inboxThreadStore, inboxMessageStore)
	// Each channel connector is registered only when its credentials are
	// actually configured - same pattern as Docling/web search providers
	// below: an unconfigured channel just doesn't show up as connectable,
	// rather than the whole inbox domain failing to start.
	if inboxgmail.IsConfigured() {
		gmailOAuthConfig, err := inboxgmail.BaseOAuthConfig()
		if err != nil {
			_ = cleanup()
			return nil, nil, fmt.Errorf("init gmail oauth config: %w", err)
		}
		inboxService.RegisterConnector(inboxgmail.NewConnector(gmailOAuthConfig))
		fmt.Printf("[API] Inbox: connecteur Gmail activé\n")

		// Gmail is poll-based (unlike WhatsApp's persistent push connection),
		// and there is no local job scheduler anymore for standalone
		// deployments - automation now runs exclusively through a connected
		// seshat-server, configured via seshat-console (see
		// internal/cloudautomation's package doc), which a standalone
		// desktop install (like a first pilot customer's) won't have. This
		// loop is deliberately narrow - keeping one connector's data fresh
		// in the background, the way any ordinary email client polls, not a
		// general-purpose automation system. Connected-mode users get this
		// for free too; a seshat-console-configured job is a future,
		// additive option for them, not a requirement.
		go runGmailSyncLoop(inboxService)
	}

	// WhatsApp shares this app's own database connection for whatsmeow's
	// session tables (see inboxwhatsapp.NewManager's doc) - only possible
	// when the main DB is one whatsmeow's dbutil actually understands
	// (SQLite or Postgres, not MySQL). On an unsupported driver, WhatsApp
	// just doesn't register as connectable, same graceful-skip pattern as
	// every other optional integration here.
	var whatsappManager *inboxwhatsapp.Manager
	if waDialect, ok := whatsappDialectFor(database.Driver()); ok {
		sqlDB, err := database.GormDB().DB()
		if err != nil {
			_ = cleanup()
			return nil, nil, fmt.Errorf("get sql.DB for whatsapp manager: %w", err)
		}
		whatsappManager, err = inboxwhatsapp.NewManager(ctx, sqlDB, waDialect, inboxService.IngestMessage, inboxService.MarkAccountError)
		if err != nil {
			_ = cleanup()
			return nil, nil, fmt.Errorf("init whatsapp manager: %w", err)
		}
		inboxService.RegisterConnector(inboxwhatsapp.NewConnector(whatsappManager))
		fmt.Printf("[API] Inbox: connecteur WhatsApp activé\n")

		// Reconnect every already-paired WhatsApp account so incoming
		// messages resume flowing immediately on restart, without waiting
		// for a user action - mirrors how Gmail's connector is stateless
		// per-call, except WhatsApp needs its persistent connection
		// actually re-established, not just "available to call".
		if accounts, err := inboxService.ListConnectedAccountsByChannel(ctx, inbox.ChannelWhatsApp); err == nil {
			for _, account := range accounts {
				if err := whatsappManager.Reconnect(ctx, account.ID, account.ExternalAccountID); err != nil {
					fmt.Fprintf(os.Stderr, "[API] Avertissement: reconnexion WhatsApp échouée pour %s: %v\n", account.DisplayName, err)
				}
			}
		}
		cleanups = append(cleanups, func() error { whatsappManager.DisconnectAll(); return nil })
	} else {
		fmt.Printf("[API] Inbox: connecteur WhatsApp désactivé (base de données %q non supportée par whatsmeow)\n", database.Driver())
	}

	prospectingCacheStore, err := db.NewProspectingCacheStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init prospecting cache store: %w", err)
	}
	prospectingUsageStore, err := db.NewProspectingUsageStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init prospecting usage store: %w", err)
	}
	prospectingSweepStore, err := db.NewProspectingSweepStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init prospecting sweep store: %w", err)
	}
	prospectingBusinessStore, err := db.NewProspectingBusinessStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init prospecting business store: %w", err)
	}
	var prospectingService *prospecting.Service
	if prospecting.IsConfigured() {
		dailyCap := 100
		if raw := strings.TrimSpace(os.Getenv("PROSPECTING_PLACES_DAILY_CAP")); raw != "" {
			if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
				dailyCap = parsed
			}
		}
		prospectingService = prospecting.NewService(prospectingSweepStore, prospectingBusinessStore, prospectingCacheStore, prospectingUsageStore, os.Getenv("GOOGLE_PLACES_API_KEY"), dailyCap)
		fmt.Printf("[API] Prospecting: Google Places configuré (cap quotidien=%d)\n", dailyCap)
	} else {
		fmt.Printf("[API] Prospecting: désactivé (GOOGLE_PLACES_API_KEY non configurée)\n")
	}

	settingStore, err := db.NewProviderSettingStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init setting store: %w", err)
	}

	oauthStore, err := db.NewProviderOAuthConnectionStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init provider oauth store: %w", err)
	}

	// Identity mode: standalone (default) vs connected to a seshat-server.
	// This is a boot-time deployment decision, not a live toggle — see
	// helps/seshat-architecture-target.md §1: swapping the identity source of
	// truth while local sessions are active risks leaving the system in a
	// half-migrated state, unlike the automation domain's runtime pairing.
	// Resolved here (rather than closer to where NewApp is called) because
	// the long-term memory store below also needs to know serverURL to pick
	// its own local-vs-remote implementation.
	var authProvider backendauth.Provider
	var settingsProvider backendsettings.Provider
	var preferencesProvider backendpreferences.Provider
	var webSearchCloudClient *cloudwebsearch.Client
	var mcpCloudClient *cloudmcp.Client
	var memoriesProvider backendmemories.Provider
	var agentsCloudClient *cloudagents.Client
	var quotaProvider backendquotas.Provider
	serverURL := ""
	if serverReachable(ctx, defaultServerURL) {
		serverURL = defaultServerURL
	}
	if serverURL != "" {
		// No organization id configured here - seshat-server enforces at
		// most one organization per user account, so it's resolved fresh
		// per login/request from the caller's own principal instead (see
		// auth.Principal.OrganizationID). A fixed, deployment-time org id
		// used to be required here; it silently produced the wrong role for
		// anyone whose actual membership didn't match it.
		authProvider = cloudidentity.NewProvider(serverURL, cloudidentity.NewCache(database), identityStore)
		localSettingsProvider := backendsettings.NewLocalProvider(settingStore, oauthStore, nil)
		settingsProvider = cloudsettings.NewProvider(serverURL, localSettingsProvider)
		preferencesProvider = cloudpreferences.NewProvider(serverURL)
		webSearchCloudClient = cloudwebsearch.NewClient(serverURL)
		mcpCloudClient = cloudmcp.NewClient(serverURL)
		memoriesProvider = cloudmemories.NewProvider(serverURL)
		agentsCloudClient = cloudagents.NewClient(serverURL)
		quotaProvider = cloudquotas.NewProvider(serverURL)
		fmt.Printf("[API] Identité en mode connected (seshat-server: %s)\n", serverURL)
	}

	// Long-term memory store: db.LongTermMemoryStore (standalone) or
	// cloudlongterm.RemoteStore (connected) — both implement the SDK's
	// longterm.Store interface, so everything downstream (the query
	// runtime's session context and internal/memories.Service) is agnostic
	// to which one it got.
	var longTermMemStore longterm.Store
	if serverURL != "" {
		longTermMemStore = cloudlongterm.NewRemoteStore(serverURL)
	} else {
		localLongTermMemStore, err := db.NewLongTermMemoryStore(database)
		if err != nil {
			_ = cleanup()
			return nil, nil, fmt.Errorf("init long-term memory store: %w", err)
		}
		longTermMemStore = localLongTermMemStore
	}

	// Long-term memory extractor: creates a lightweight provider client dedicated to
	// async entity/observation extraction at session end. Best-effort only.
	var longTermExtractor *longterm.Extractor
	if strings.TrimSpace(config.APIKey) != "" {
		parsedModel := appconfig.ParseModelIdentifier(config.Model)
		extractionClient := providers.NewClient(config.APIKey, parsedModel.Provider)
		extractorCfg := longterm.DefaultExtractorConfig()
		extractorCfg.Model = parsedModel
		longTermExtractor = longterm.NewExtractor(longTermMemStore, extractionClient, extractorCfg)
		fmt.Printf("[API] Long-term memory extractor initialisé (provider=%s)\n", parsedModel.Provider)
	}

	modelStore, err := db.NewProviderModelStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init provider model store: %w", err)
	}

	webSearchSettingStore, err := db.NewWebSearchSettingStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init web search setting store: %w", err)
	}

	webSearchLogStore, err := db.NewWebSearchLogStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init web search log store: %w", err)
	}

	searchProviderConfigStore, err := db.NewSearchProviderConfigStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init search provider config store: %w", err)
	}

	embedderConfigStore, err := db.NewEmbedderConfigStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init embedder config store: %w", err)
	}

	doclingConfigStore, err := db.NewDoclingConfigStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init docling config store: %w", err)
	}

	localSTTConfigStore, err := db.NewLocalSTTConfigStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init local stt config store: %w", err)
	}

	userMemoryStore, err := db.NewUserMemoryStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init user memory store: %w", err)
	}

	storageConfigStore, err := db.NewStorageConfigStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init storage config store: %w", err)
	}

	userPreferencesStore, err := db.NewUserPreferencesStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init user preferences store: %w", err)
	}

	mcpServerStore, err := db.NewMCPServerStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init mcp server store: %w", err)
	}

	mcpOrgServerApprovalStore, err := db.NewMCPOrgServerApprovalStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init mcp org server approval store: %w", err)
	}

	agentDefinitionStore, err := db.NewAgentDefinitionStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init agent definition store: %w", err)
	}

	auditLogStore, err := db.NewAuditLogStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init audit log store: %w", err)
	}

	usageCounterStore, err := db.NewUsageCounterStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init usage counter store: %w", err)
	}

	planDocumentStore, err := db.NewPlanDocumentStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init plan document store: %w", err)
	}

	artifactStore, artifactErr := storage.DefaultArtifactStore()
	if artifactErr != nil {
		if config.StorageProvider != "" && config.StorageProvider != string(storage.ProviderLocal) {
			_ = cleanup()
			return nil, nil, fmt.Errorf("artifact store: %w", artifactErr)
		}
		fmt.Fprintf(os.Stderr, "[API] Avertissement: artifact store non disponible (%v)\n", artifactErr)
		fmt.Fprintf(os.Stderr, "[API] Domaine files désactivé — uploads/downloads ne fonctionneront pas\n")
		artifactStore = nil
	} else {
		fmt.Printf("[API] Artifact store initialisé: %s\n", storage.GetProviderType())
	}

	// Documents (knowledge): standalone local knowledge.Service, or
	// cloudknowledge.RemoteService proxying to a connected seshat-server's
	// own org-wide corpora — both implement knowledge.Backend, and NewApp
	// falls back to the local one when this is nil. See
	// internal/cloudknowledge's package doc for why this is a clean swap
	// rather than an additive merge like MCP.
	//
	// Declared as the knowledge.Backend interface (not *cloudknowledge.
	// RemoteService) so that leaving it unset in standalone mode is a true
	// nil interface — assigning a nil *RemoteService to an interface-typed
	// Dependencies field would produce a non-nil interface holding a nil
	// pointer, defeating NewApp's `if knowledgeService == nil` fallback
	// check. Same reasoning as longTermMemStore above.
	var knowledgeCloudBackend backendknowledge.Backend
	if serverURL != "" {
		knowledgeCloudBackend = cloudknowledge.NewRemoteService(serverURL, fileStore, artifactStore)
	}

	vectorDatabase := database
	if vector.Backend(config.VectorBackend) == vector.BackendPgVector && strings.TrimSpace(config.PgVectorDSN) != "" {
		vectorDB, err := db.Open(ctx, db.Config{
			Driver:      db.DriverPostgres,
			DSN:         strings.TrimSpace(config.PgVectorDSN),
			AutoMigrate: false,
		})
		if err != nil {
			_ = cleanup()
			return nil, nil, fmt.Errorf("init pgvector DB: %w", err)
		}
		vectorDatabase = vectorDB
		cleanups = append(cleanups, vectorDB.Close)
		fmt.Printf("[API] pgvector utilise une DB dédiée PostgreSQL\n")
	}

	var ragService *rag.Service
	embedderCfg := &ragembedder.Config{
		BaseURL:  config.EmbedderBaseURL,
		APIKey:   config.EmbedderAPIKey,
		Model:    config.EmbedderModel,
		Provider: ragembedder.Provider(config.EmbedderProvider),
	}
	if dbEmb, dbErr := embedderConfigStore.Get(ctx); dbErr == nil && dbEmb != nil && dbEmb.Enabled && dbEmb.BaseURL != "" && dbEmb.Model != "" {
		apiKeyFromDB, _ := embedderConfigStore.GetDecryptedAPIKey(ctx)
		embedderCfg = &ragembedder.Config{
			BaseURL:  dbEmb.BaseURL,
			APIKey:   apiKeyFromDB,
			Model:    dbEmb.Model,
			Provider: ragembedder.Provider(dbEmb.Provider),
		}
		fmt.Printf("[API] Embedder config chargée depuis DB: provider=%s model=%s\n", dbEmb.Provider, dbEmb.Model)
	}
	// The vector store (and so ragService) is built regardless of whether an
	// embedder is configured — rag.Service itself already degrades to
	// vectorless/BM25-only ingest+search when its embedder is nil (see the
	// SDK's internal/rag/service.go), so gating construction on
	// embedderCfg.IsConfigured() used to disable the whole knowledge feature
	// instead of just skipping vector search. Configuring an embedder later
	// and re-ingesting upgrades existing chunks in place (Ingest upserts by
	// deterministic key), no need to re-upload anything.
	pgvectorCreateExtension := config.PgVectorCreateExtension
	vectorDim := 1536
	if raw := strings.TrimSpace(os.Getenv("SESHAT_VECTOR_DIM")); raw != "" {
		if n, err := fmt.Sscanf(raw, "%d", &vectorDim); n != 1 || err != nil {
			fmt.Fprintf(os.Stderr, "[API] Avertissement: SESHAT_VECTOR_DIM invalide (%q), utilise 1536\n", raw)
			vectorDim = 1536
		} else if vectorDim < 64 || vectorDim > 4096 {
			fmt.Fprintf(os.Stderr, "[API] Avertissement: SESHAT_VECTOR_DIM hors limites (%d, accepté: 64-4096), utilise 1536\n", vectorDim)
			vectorDim = 1536
		}
	}
	vectorCfg := vector.Config{
		Backend:                    vector.Backend(config.VectorBackend),
		DB:                         vector.NewDBHandle(string(vectorDatabase.Driver()), vectorDatabase.DSN()),
		Dim:                        vectorDim,
		QdrantHost:                 config.QdrantHost,
		QdrantPort:                 config.QdrantPort,
		QdrantAPIKey:               config.QdrantAPIKey,
		QdrantPrefix:               config.QdrantPrefix,
		PgVectorCreateExtension:    &pgvectorCreateExtension,
		PgVectorIndexMethod:        config.PgVectorIndexMethod,
		PgVectorHNSWM:              config.PgVectorHNSWM,
		PgVectorHNSWEfConstruction: config.PgVectorHNSWEF,
		PgVectorIVFFlatLists:       config.PgVectorIVFFlatLists,
		ChromaURL:                  config.ChromaURL,
		ChromaAPIKey:               config.ChromaAPIKey,
		ChromaTenant:               config.ChromaTenant,
		ChromaDatabase:             config.ChromaDatabase,
	}
	if vs, err := vector.NewStore(ctx, vectorCfg); err == nil {
		var embedder rag.Embedder
		if embedderCfg.IsConfigured() {
			embedder = ragembedder.New(embedderCfg)
		}
		ragService = rag.NewService(artifactStore, vs, embedder, nil)
		backendName := string(vectorCfg.Backend)
		if backendName == "" {
			backendName = "sqlite"
		}
		if embedderCfg.IsConfigured() {
			fmt.Printf("[API] RAG service initialisé: embedder=%s model=%s backend=%s\n", embedderCfg.Provider, embedderCfg.Model, backendName)
		} else {
			fmt.Printf("[API] RAG service initialisé en mode vectorless (BM25) — aucun embedder configuré, backend=%s\n", backendName)
		}

		// RAG_RERANK_URL points at any Cohere/TEI-compatible endpoint
		// (self-hosted TEI/vLLM serving BAAI/bge-reranker-v2-m3, free and
		// no API key needed) - falls back to LangSearch's hosted API if
		// only LANGSEARCH_API_KEY is set. See reranker.FromEnv's doc.
		if r := reranker.NewFromEnv(); r.IsConfigured() {
			ragService.SetReranker(r)
			fmt.Printf("[API] RAG reranker actif (second passage sur les résultats de recherche)\n")
		}
	} else {
		fmt.Fprintf(os.Stderr, "[API] Avertissement: vector store non disponible (%v)\n", err)
	}

	// Auto-import mcp.json into DB so the UI and runtime share the same state.
	// Idempotent: ON CONFLICT (name) DO UPDATE — user edits in the UI are preserved.
	if localCfg, localErrs := mcpLoadLocalJSON(); len(localCfg.MCPServers) > 0 && len(localErrs) == 0 {
		if n, importErr := mcpServerStore.ImportFromMcpJSON(ctx, localCfg); importErr != nil {
			fmt.Fprintf(os.Stderr, "[API] Avertissement MCP: import mcp.json: %v\n", importErr)
		} else if n > 0 {
			fmt.Printf("[API] MCP: %d server(s) importés depuis mcp.json\n", n)
		}
	}

	var startupMCPServers []sdk.MCPServerConfig
	if dbServers, dbErr := mcpServerStore.ListEnabled(ctx); dbErr == nil && len(dbServers) > 0 {
		startupMCPServers = append(startupMCPServers, dbMCPServersToSDKConfigs(dbServers)...)
		fmt.Printf("[API] MCP: %d server(s) chargés depuis la DB\n", len(dbServers))
	}

	queryClientConfig := &sdk.ClientConfig{
		APIKey:                  config.APIKey,
		Model:                   appconfig.ParseModelIdentifier(config.Model),
		PermissionMode:          sdk.PermissionModeNever,
		AutoCompact:             true,
		PersistSessions:         true,
		SessionSQLitePath:       appconfig.EffectiveSessionDBPath(config),
		WorkingDir:              workingDir,
		BrowserRemoteControlURL: strings.TrimSpace(config.BrowserRemoteControlURL),
		BrowserExecutablePath:   strings.TrimSpace(config.BrowserExecutablePath),
		StorageGCEnabled:        config.StorageGCEnabled,
		StorageGCInterval:       parseDurationOrDefault(config.StorageGCInterval, time.Hour),
		StorageGCLimit:          config.StorageGCLimit,
		StorageGCNamespaces:     splitCommaList(config.StorageGCNamespaces),
		RAGService:              ragService,
		MCPServers:              startupMCPServers,
		PlanStore:               &dbPlanStoreAdapter{store: planDocumentStore},
		LongTermMemory:          longTermMemStore,
		DoclingURL:              strings.TrimSpace(config.DoclingURL),
		AutomationServiceURL:    strings.TrimSpace(config.AutomationServiceURL),
		AutomationAPIKey:        strings.TrimSpace(os.Getenv("AUTOMATION_API_KEY")),
		ImageGeneration:         defaultImageGenerationConfig(),
		TextToSpeech:            defaultTextToSpeechConfig(),
		SpeechToText:            defaultSpeechToTextConfig(),
		// The SDK auto-generates a short AI title after a session's first
		// turn completes (see its own generateTitleAsync) and was already
		// running unconditionally - just silently discarded, since nothing
		// here used to set this callback. This is the only thing that
		// writes it into session_ownership.Title, the column the API and
		// UI actually read (the SDK's own internal session store, which it
		// updates on its own, is invisible to this backend). Client is nil
		// during this call, so context.Background() is the only option.
		OnSessionTitled: func(id sdk.SessionID, title string) {
			if err := sessionOwnershipStore.UpdateTitle(context.Background(), id.String(), title); err != nil {
				fmt.Fprintf(os.Stderr, "[API] session %s auto-title: %v\n", id, err)
			}
		},
	}
	queryClient, err := sdk.NewClient(queryClientConfig)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init query runtime: %w", err)
	}
	cleanups = append(cleanups, func() error { queryClient.Close(); return nil })

	if err := managedskills.EnsureExtracted(skillsloader.GetBuiltinSkillsPath()); err != nil {
		fmt.Fprintf(os.Stderr, "[API] Avertissement builtin skills: %v\n", err)
	} else {
		fmt.Printf("[API] Builtin skills extraits vers: %s\n", skillsloader.GetBuiltinSkillsPath())
	}

	// Clone the official Seshat skills collection in the background so startup is
	// never blocked.
	go func() {
		defaultRepoURL := api.DefaultSeshatSkillsRepo
		if config.DefaultSkillRepo != "" {
			defaultRepoURL = strings.TrimSpace(config.DefaultSkillRepo)
		}
		if defaultRepoURL != "" && strings.ToLower(defaultRepoURL) != "none" {
			repo := skillrepos.RepoFromURL(defaultRepoURL)
			skillrepos.EnsureCloned(ctx, skillsloader.GetSkillReposPath(), []skillrepos.Repo{repo})
			fmt.Printf("[API] Seshat skills: %s disponible\n", repo.Name)
		}
	}()

	if repos := skillrepos.ParseRepos(config.SkillRepos); len(repos) > 0 {
		var secureRepos []skillrepos.Repo
		for _, repo := range repos {
			if repo.URL != "" && !strings.HasPrefix(repo.URL, "https://") {
				fmt.Fprintf(os.Stderr, "[API] AVERTISSEMENT SÉCURITÉ: skill repo non-HTTPS ignoré: %s\n", repo.URL)
				continue
			}
			secureRepos = append(secureRepos, repo)
		}
		if len(secureRepos) > 0 {
			cloned := skillrepos.EnsureCloned(ctx, skillsloader.GetSkillReposPath(), secureRepos)
			fmt.Printf("[API] Skill repos: %d/%d disponibles\n", len(cloned), len(repos))
		}
	}

	if entries, err := os.ReadDir(skillsloader.GetSkillReposPath()); err == nil {
		var installed []skillrepos.Repo
		for _, e := range entries {
			// skillrepos.EnsureCloned keeps its own bookkeeping in a
			// ".pull-stamps" subdir of the same directory - skip dotfiles so
			// it isn't re-listed here as a fake repo with no URL.
			if e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
				installed = append(installed, skillrepos.Repo{Name: e.Name()})
			}
		}
		if len(installed) > 0 {
			skillrepos.EnsureCloned(ctx, skillsloader.GetSkillReposPath(), installed)
		}
	}

	featuredRepos := append([]api.FeaturedSkillRepo(nil), api.DefaultFeaturedRepos...)
	if config.FeaturedSkillRepos != "" {
		var extra []api.FeaturedSkillRepo
		for _, raw := range strings.Split(config.FeaturedSkillRepos, ",") {
			raw = strings.TrimSpace(raw)
			if raw == "" {
				continue
			}
			repo := skillrepos.RepoFromURL(raw)
			found := false
			for _, d := range featuredRepos {
				if d.Name == repo.Name {
					found = true
					break
				}
			}
			if !found {
				extra = append(extra, api.FeaturedSkillRepo{Name: repo.Name, URL: repo.URL})
			}
		}
		featuredRepos = append(featuredRepos, extra...)
	}

	if config.AdminEmail != "" {
		if strings.TrimSpace(config.AdminPassword) != "" && strings.TrimSpace(config.AdminPasswordHash) == "" {
			fmt.Fprintf(os.Stderr, "[API] AVERTISSEMENT SÉCURITÉ: SESHAT_ADMIN_PASSWORD est défini en clair dans l'environnement.\n")
			fmt.Fprintf(os.Stderr, "[API]   Préférez SESHAT_ADMIN_PASSWORD_HASH (bcrypt) pour la production.\n")
			fmt.Fprintf(os.Stderr, "[API]   Générez-le avec: htpasswd -bnBC 12 '' <mot_de_passe> | tr -d ':\\n' | sed 's/$2y/$2a/'\n")
			if strings.EqualFold(strings.TrimSpace(os.Getenv("SESHAT_ENV")), "production") {
				_ = cleanup()
				return nil, nil, fmt.Errorf("SESHAT_ENV=production interdit SESHAT_ADMIN_PASSWORD en clair")
			}
		}
		if h := strings.TrimSpace(config.AdminPasswordHash); h != "" {
			if _, err := bcrypt.Cost([]byte(h)); err != nil {
				_ = cleanup()
				return nil, nil, fmt.Errorf("SESHAT_ADMIN_PASSWORD_HASH n'est pas un hash bcrypt valide: %w", err)
			}
			if strings.TrimSpace(config.AdminPassword) != "" {
				fmt.Fprintf(os.Stderr, "[API] AVERTISSEMENT: SESHAT_ADMIN_PASSWORD et SESHAT_ADMIN_PASSWORD_HASH sont tous les deux définis. SESHAT_ADMIN_PASSWORD_HASH sera utilisé.\n")
			}
		}
		if _, err := identityStore.EnsureBootstrap(ctx, db.BootstrapOptions{
			AdminEmail:           config.AdminEmail,
			AdminPassword:        config.AdminPassword,
			AdminPasswordHash:    config.AdminPasswordHash,
			AdminDisplayName:     "Administrator",
			DefaultOrgName:       "Default Organization",
			DefaultOrgSlug:       "default",
			DefaultWorkspaceName: "Main Workspace",
			DefaultWorkspaceSlug: "main",
		}); err != nil {
			_ = cleanup()
			return nil, nil, fmt.Errorf("bootstrap DB: %w", err)
		}
	}

	runtime := backendquery.NewSDKRuntime(queryClient, queryClientConfig)
	// Shared with api.NewApp below (via AppConfig.TerminalRelay) - the WS
	// handler there registers a session's Electron relay connection into the
	// same instance runtime.applyRemoteExecutor reads from per turn.
	terminalRelay := backendquery.NewTerminalRelay()
	runtime.SetTerminalRelay(terminalRelay)

	// Mirrors resolveDocling below: Settings > Capabilities can point the
	// agent's own speech_to_text tool at a locally running whisper.cpp
	// server (see api.handleLocalSTTConfig, set by the Electron main
	// process) instead of the operator's OPENAI_API_KEY default, without a
	// restart. No API key needed - the engine no longer requires one when a
	// custom BaseURL is set (KPO-Tech/seshat#101), and whisper-server
	// doesn't check the Authorization header anyway.
	runtime.SetLocalSTTResolver(func(ctx context.Context) *sdk.SpeechToTextConfig {
		cfg, err := localSTTConfigStore.Get(ctx)
		if err != nil || cfg == nil || !cfg.Enabled || cfg.BaseURL == "" {
			return nil
		}
		return &sdk.SpeechToTextConfig{
			Provider: "openai",
			BaseURL:  cfg.BaseURL,
		}
	})

	// resolveDocling lets Settings > Knowledge override, at runtime, which
	// docling-serve instance to use (self-hosted, on the local network, or
	// an organization's own) — without needing an env var or a restart.
	// bootDoclingClient is the fallback: whatever config.DoclingURL resolved
	// to at boot, which already reflects the managed local venv if
	// cmd/api/main.go auto-started one (see docling_config.go's doc comment
	// for the full priority order).
	bootDoclingClient := buildDoclingClient(config.DoclingURL)
	resolveDocling := func(ctx context.Context) *docling.Client {
		if cfg, err := doclingConfigStore.Get(ctx); err == nil && cfg != nil {
			if !cfg.Enabled {
				return nil
			}
			if cfg.BaseURL != "" {
				return docling.NewClient(cfg.BaseURL, docling.WithTimeout(doclingConversionTimeout))
			}
		}
		return bootDoclingClient
	}

	backendApp := seshat.NewApp(seshat.Dependencies{
		Identity:            identityStore,
		APIKeyStore:         apiKeyStore,
		GroupStore:          groupStore,
		AuthProvider:        authProvider,
		SettingsProvider:    settingsProvider,
		PreferencesProvider: preferencesProvider,
		MemoriesProvider:    memoriesProvider,
		AgentsCloudClient:   agentsCloudClient,
		QuotaProvider:       quotaProvider,
		AuthConfig: backendauth.ServiceConfig{
			EnableSignup:    config.EnableSignup,
			DefaultUserRole: config.DefaultUserRole,
			EnableAPIKeys:   config.EnableAPIKeys,
		},
		QueryRuntime:             runtime,
		SessionManager:           runtime,
		SessionOwnership:         sessionOwnershipStore,
		FileStore:                fileStore,
		CorpusStore:              corpusStore,
		IngestionJobStore:        ingestionJobStore,
		KnowledgeBackend:         knowledgeCloudBackend,
		SettingStore:             settingStore,
		OAuthStore:               oauthStore,
		WebSearchSettings:        webSearchSettingStore,
		WebSearchLogs:            webSearchLogStore,
		WebSearchProviderConfigs: searchProviderConfigStore,
		WebSearchCloudClient:     webSearchCloudClient,
		AuditLogStore:            auditLogStore,
		UsageCounterStore:        usageCounterStore,
		ArtifactStore:            artifactStore,
		RAGService:               ragService,
		Monitoring:               queryClient.GetMonitoring(),
		ResolveDoclingClient:     resolveDocling,
		UserMemoryStore:          userMemoryStore,
		LongTermMemoryStore:      longTermMemStore,
		LongTermExtractor:        longTermExtractor,
		PlanDocumentStore:        planDocumentStore,
		MCPServerStore:           mcpServerStore,
		MCPRuntime:               runtime,
		MCPCloudClient:           mcpCloudClient,
		MCPOrgServerApprovals:    mcpOrgServerApprovalStore,
		UserPreferencesStore:     userPreferencesStore,
		AgentDefinitionStore:     agentDefinitionStore,
		Inbox:                    inboxService,
	})

	// Knowledge Agent: unlike the Inbox Agent (provisioned lazily on first
	// channel connection, see api/inbox.go's ensureInboxAgent), the
	// knowledge base has no "first connection" event to hook into - it's
	// always available - so it's provisioned once, eagerly, right here.
	if backendApp.Agents != nil {
		if err := backendApp.Agents.EnsureDefault(ctx, agents.DefaultKnowledgeAgentParams()); err != nil {
			fmt.Fprintf(os.Stderr, "[API] Avertissement: création du Knowledge Agent échouée: %v\n", err)
		}
	}

	// knowledge_search: lets the Company Assistant (and any other session on
	// this shared query client) search across every corpus the calling
	// principal can access, not just one - see internal/knowledgetool's
	// package doc. Registered here (not next to sdk.NewClient above) because
	// it needs the fully-resolved backendApp.Knowledge (local
	// *knowledge.Service or connected-mode *cloudknowledge.RemoteService),
	// which only exists after seshat.NewApp runs its own fallback logic.
	if backendApp.Knowledge != nil {
		if err := queryClient.RegisterTool(knowledgetool.NewSearchTool(backendApp.Knowledge)); err != nil {
			fmt.Fprintf(os.Stderr, "[API] Avertissement: knowledge_search tool non enregistré: %v\n", err)
		}
	}

	// Inbox Agent tools - same registration point/reasoning as
	// knowledge_search above. Registered whenever the inbox domain itself
	// is configured, independent of which channel connectors ended up
	// active - a tool call against a channel with no connector fails
	// clearly through inbox.Service, same as any other inbox error.
	if backendApp.Inbox != nil {
		inboxAgentTools := []sdk.Tool{
			inboxtool.NewListThreadsTool(backendApp.Inbox),
			inboxtool.NewGetThreadTool(backendApp.Inbox),
			inboxtool.NewUpdateThreadStatusTool(backendApp.Inbox),
			inboxtool.NewDraftReplyTool(backendApp.Inbox),
			inboxtool.NewSendReplyTool(backendApp.Inbox),
			inboxtool.NewListAccountsTool(backendApp.Inbox),
			inboxtool.NewSearchContactsTool(backendApp.Inbox),
		}
		for _, tool := range inboxAgentTools {
			if err := queryClient.RegisterTool(tool); err != nil {
				fmt.Fprintf(os.Stderr, "[API] Avertissement: tool inbox non enregistré: %v\n", err)
			}
		}
	}

	// Prospecting tools are registered globally (like web_search/
	// knowledge_search) rather than tied to a dedicated agent persona - any
	// agent can use them via its tool-slug list.
	if prospectingService != nil {
		prospectingAgentTools := []sdk.Tool{
			prospectingtool.NewSweepAreaTool(prospectingService),
			prospectingtool.NewListBusinessesTool(prospectingService),
		}
		for _, tool := range prospectingAgentTools {
			if err := queryClient.RegisterTool(tool); err != nil {
				fmt.Fprintf(os.Stderr, "[API] Avertissement: tool prospecting non enregistré: %v\n", err)
			}
		}
	}

	// Cloud automation: this machine executes execution_target=device jobs
	// claimed from a connected seshat-server, using its own locally
	// configured LLM credentials — see helps/seshat-architecture-target.md
	// and internal/cloudautomation's package doc. The executor closure
	// captures backendApp so the cloudautomation package never needs to
	// import query/settings directly, mirroring the old scheduler's pattern.
	cloudAutomationStore := cloudautomation.NewStore(database)
	cloudAutomationExecutor := cloudautomation.JobExecutor(func(ctx context.Context, p cloudautomation.ExecParams) (string, error) {
		principal := &backendauth.Principal{
			User: backendauth.User{ID: p.UserID},
		}
		providerSettingID, modelID := resolveCloudJobModel(ctx, backendApp.Settings, principal, p.ModelOverride)
		input, _ := backendApp.Query.BuildContextInput(ctx, backendquery.ContextBuildParams{
			Principal:         principal,
			Prompt:            p.Prompt,
			ProviderSettingID: providerSettingID,
			ModelID:           modelID,
			ExecutionOrigin:   enginetypes.ExecutionOriginAutomation,
		})
		result, err := backendApp.Query.RunPrompt(ctx, principal, input)
		if err != nil {
			return "", err
		}
		return result.Content, nil
	})
	cloudAutomationWorker := cloudautomation.NewWorker(cloudAutomationStore, cloudAutomationExecutor)
	cloudAutomationWorker.Start()
	cleanups = append(cleanups, func() error { cloudAutomationWorker.Stop(); return nil })
	cloudAutomationService := cloudautomation.NewService(cloudAutomationStore)
	fmt.Printf("[API] Cloud automation worker démarré\n")

	// Abandoned-session sweep: a session (plus any files attached to it) is
	// created the instant a file is attached, before the user ever sends a
	// message (see Home.tsx/Conversation.tsx) - if they change their mind or
	// just close the app, nothing else ever cleans that up. Sweeping
	// sessions with zero turns older than the grace window reclaims that
	// dead weight without any risk of deleting a conversation someone is
	// actively about to use (see query.Service.SweepAbandonedSessions).
	const abandonedSessionGracePeriod = 24 * time.Hour
	sweepCtx, stopSweep := context.WithCancel(context.Background())
	go func() {
		// Run once at startup too, not just on the hourly tick - this is a
		// desktop app, so most sessions are shorter than an hour and would
		// otherwise never live long enough to trigger the ticker even once.
		// Startup is exactly when abandoned sessions from the *previous*
		// run are most likely waiting to be cleaned up.
		if n, err := backendApp.Query.SweepAbandonedSessions(sweepCtx, abandonedSessionGracePeriod); err != nil {
			fmt.Fprintf(os.Stderr, "[API] abandoned-session sweep: %v\n", err)
		} else if n > 0 {
			fmt.Printf("[API] abandoned-session sweep: removed %d session(s)\n", n)
		}

		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-sweepCtx.Done():
				return
			case <-ticker.C:
				n, err := backendApp.Query.SweepAbandonedSessions(sweepCtx, abandonedSessionGracePeriod)
				if err != nil {
					fmt.Fprintf(os.Stderr, "[API] abandoned-session sweep: %v\n", err)
				} else if n > 0 {
					fmt.Printf("[API] abandoned-session sweep: removed %d session(s)\n", n)
				}
			}
		}
	}()
	cleanups = append(cleanups, func() error { stopSweep(); return nil })

	app := api.NewApp(api.AppConfig{
		Backend:               backendApp,
		DB:                    database,
		ModelStore:            modelStore,
		GroupStore:            groupStore,
		EmbedderStore:         embedderConfigStore,
		DoclingStore:          doclingConfigStore,
		LocalSTTStore:         localSTTConfigStore,
		StorageConfigStore:    storageConfigStore,
		LongTermExtractor:     longTermExtractor,
		CloudAutomation:       cloudAutomationService,
		RateLimiter:           api.NewRateLimiter(config.RateLimitPerMinute, time.Minute),
		LoginRateLimiter:      api.NewRateLimiter(10, 15*time.Minute),
		EnableSignup:          config.EnableSignup,
		EnableAPIKeys:         config.EnableAPIKeys,
		FeaturedRepos:         featuredRepos,
		TrustedProxyCIDRs:     api.ParseTrustedProxies(config.TrustedProxies),
		AllowedSkillRepoHosts: api.ParseSkillRepoHosts(config.SkillRepoHosts),
		ConnectedServerURL:    serverURL,
		TerminalRelay:         terminalRelay,
		WhatsAppManager:       whatsappManager,
	})

	// Only the local knowledge.Service has a queue for this runner to drain —
	// in connected mode backendApp.Knowledge is a *cloudknowledge.RemoteService
	// instead, and a connected seshat-server already runs its own ingestion
	// pipeline server-side (internal/server/knowledge.Runner), so there is
	// nothing for a local runner to do.
	if localKnowledge, ok := backendApp.Knowledge.(*backendknowledge.Service); ok {
		knowledgeRunner := backendknowledge.NewRunner(localKnowledge, backendknowledge.RunnerConfig{
			PollInterval: 500 * time.Millisecond,
			MaxPerTick:   4,
		})
		knowledgeRunner.Start(ctx)
	}

	return app, cleanup, nil
}

// ─── MCP helpers ──────────────────────────────────────────────────────────────

// dbMCPServersToSDKConfigs converts enabled DB MCPServer records to sdk.MCPServerConfig slice.
func dbMCPServersToSDKConfigs(servers []db.MCPServer) []sdk.MCPServerConfig {
	out := make([]sdk.MCPServerConfig, 0, len(servers))
	for _, s := range servers {
		if !s.Enabled {
			continue
		}
		out = append(out, sdk.MCPServerConfig{
			Name:      s.Name,
			Command:   s.Command,
			Args:      s.Args,
			URL:       s.URL,
			Transport: mcp.TransportType(s.ServerType),
			Env:       s.Env,
			Headers:   s.Headers,
			Timeout:   time.Duration(s.TimeoutSecs) * time.Second,
		})
	}
	return out
}

// mcpLoadLocalJSON loads the local mcp.json if it exists (best-effort, no error on missing).
func mcpLoadLocalJSON() (mcp.McpJsonConfig, []mcp.ValidationError) {
	path := api.DefaultMCPJsonPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return mcp.McpJsonConfig{}, nil
	}
	return mcp.ParseMcpConfigFromFile(path)
}

// ─── Plan store adapter ───────────────────────────────────────────────────────

// dbPlanStoreAdapter bridges db.PlanDocumentStore to the sdk.PlanStore interface.
type dbPlanStoreAdapter struct {
	store *db.PlanDocumentStore
}

func (a *dbPlanStoreAdapter) CreateOrUpdate(ctx context.Context, planID, sessionID, userID, slug, filename, content string) (string, int, error) {
	if planID == "" {
		b := make([]byte, 12)
		_, _ = rand.Read(b)
		planID = hex.EncodeToString(b)
	}
	doc, err := a.store.Upsert(ctx, db.CreatePlanParams{
		ID:        planID,
		SessionID: sessionID,
		UserID:    userID,
		Slug:      slug,
		Filename:  filename,
		Content:   content,
	})
	if err != nil {
		return "", 0, err
	}
	return doc.ID, doc.Version, nil
}

func (a *dbPlanStoreAdapter) SetStatus(ctx context.Context, planID string, status string) error {
	return a.store.SetStatus(ctx, planID, status)
}

// ─── Infrastructure helpers ───────────────────────────────────────────────────

// doclingConversionTimeout replaces the SDK client's 120s default. This
// same client serves both the ephemeral chat-attachment path (files.Service)
// and RAG corpus ingestion (knowledge.Service, ResolveDoclingClient is
// shared between them - see NewApp), and the latter now routes every
// document through docling unconditionally (see internal/knowledge's
// extractTextWithDocling doc comment for why). A several-hundred-page PDF
// on a CPU-only docling-serve - layout detection runs on every page's
// rasterized image regardless of native text - can genuinely take longer
// than two minutes; 120s would fail it outright rather than let it finish.
const doclingConversionTimeout = 15 * time.Minute

// buildDoclingClient creates a docling client from a URL string.
// Returns nil if the URL is empty (docling integration disabled).
func buildDoclingClient(url string) *docling.Client {
	url = strings.TrimSpace(url)
	if url == "" {
		return nil
	}
	return docling.NewClient(url, docling.WithTimeout(doclingConversionTimeout))
}

// logProviderDiscovery scans env vars and local services at startup and logs a
// summary so operators know which providers are ready without manual inspection.
func logProviderDiscovery(ctx context.Context) {
	results := providers.DiscoverProviders(ctx)

	var available, missing []string
	for _, r := range results {
		if !r.Recommended {
			continue
		}
		if r.Available {
			available = append(available, r.DisplayName)
		} else {
			missing = append(missing, fmt.Sprintf("%s (%s)", r.DisplayName, r.Hint))
		}
	}

	if len(available) > 0 {
		fmt.Printf("[providers] Available: %s\n", strings.Join(available, ", "))
	} else {
		fmt.Fprintln(os.Stderr, "[providers] Warning: no providers configured. Set at least one API key.")
	}
	if len(missing) > 0 {
		for _, m := range missing {
			fmt.Printf("[providers] Not configured: %s\n", m)
		}
	}
}

// ─── Config parsing helpers ───────────────────────────────────────────────────

func parseDurationOrDefault(raw string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(raw)
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func splitCommaList(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			result = append(result, part)
		}
	}
	return result
}

// defaultImageGenerationConfig, defaultTextToSpeechConfig and
// defaultSpeechToTextConfig enable the engine's generate_image/text_to_speech/
// speech_to_text built-in tools whenever the operator already has the
// corresponding provider key set — same env vars the chat model itself
// resolves against (see pkg/config/provider_catalog.go), so a working
// OPENAI_API_KEY/GOOGLE_API_KEY makes these tools visible to the LLM with no
// extra configuration. Without this, ClientConfig.ImageGeneration/
// .TextToSpeech/.SpeechToText stay nil and the tools are never initialized,
// regardless of which API keys are configured.
func defaultImageGenerationConfig() *sdk.ImageGenerationConfig {
	if key := strings.TrimSpace(os.Getenv("OPENAI_API_KEY")); key != "" {
		return &sdk.ImageGenerationConfig{Provider: "openai", APIKey: key}
	}
	if key := strings.TrimSpace(os.Getenv("GOOGLE_API_KEY")); key != "" {
		return &sdk.ImageGenerationConfig{Provider: "gemini", APIKey: key}
	}
	return nil
}

func defaultTextToSpeechConfig() *sdk.TextToSpeechConfig {
	if key := strings.TrimSpace(os.Getenv("OPENAI_API_KEY")); key != "" {
		return &sdk.TextToSpeechConfig{Provider: "openai", APIKey: key}
	}
	return nil
}

func defaultSpeechToTextConfig() *sdk.SpeechToTextConfig {
	if key := strings.TrimSpace(os.Getenv("OPENAI_API_KEY")); key != "" {
		return &sdk.SpeechToTextConfig{Provider: "openai", APIKey: key}
	}
	return nil
}

// resolveCloudJobModel maps a cloud job's model_override ("provider:model",
// optional) onto this machine's own locally configured provider settings —
// a device-targeted job runs with whoever connected this machine's own LLM
// credentials, never credentials fetched from seshat-server. An empty
// override, or no matching local provider, falls back to the default
// provider/model the same as an ordinary chat turn would.
func resolveCloudJobModel(ctx context.Context, settingsService *backendsettings.Service, principal *backendauth.Principal, modelOverride string) (providerSettingID, modelID string) {
	provider, model, ok := strings.Cut(strings.TrimSpace(modelOverride), ":")
	if !ok || provider == "" {
		return "", ""
	}
	settingsList, err := settingsService.List(ctx, principal)
	if err != nil {
		return "", ""
	}
	for _, setting := range settingsList {
		if strings.EqualFold(setting.Provider, provider) {
			return setting.ID, model
		}
	}
	return "", ""
}

// gmailSyncInterval mirrors a typical email client's background poll
// cadence - frequent enough that new mail shows up promptly, cheap enough
// (Gmail's History API returns just a delta) not to matter at this rate.
const gmailSyncInterval = 2 * time.Minute

// runGmailSyncLoop periodically syncs every connected Gmail account across
// every user - see its call site's comment for why this exists instead of
// relying on cloudautomation. Runs for the process's lifetime with no
// explicit shutdown, matching this file's other daemon-style background
// loops (e.g. api.NewApp's artifactPreviews.Sweep ticker).
func runGmailSyncLoop(inboxService *inbox.Service) {
	syncAllGmailAccounts(inboxService)
	ticker := time.NewTicker(gmailSyncInterval)
	defer ticker.Stop()
	for range ticker.C {
		syncAllGmailAccounts(inboxService)
	}
}

func syncAllGmailAccounts(inboxService *inbox.Service) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	accounts, err := inboxService.ListConnectedAccountsByChannel(ctx, inbox.ChannelGmail)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[API] Gmail sync loop: échec de la liste des comptes: %v\n", err)
		return
	}
	for _, account := range accounts {
		principal := &backendauth.Principal{User: backendauth.User{ID: account.UserID}}
		if _, err := inboxService.SyncAccount(ctx, principal, account.ID); err != nil {
			fmt.Fprintf(os.Stderr, "[API] Gmail sync loop: échec de sync pour %s: %v\n", account.DisplayName, err)
		}
	}
}

// whatsappDialectFor maps this app's database driver to the dialect string
// whatsmeow's sqlstore understands, so its session tables can live in the
// same physical database as everything else rather than a second one.
// whatsmeow only supports SQLite and Postgres (not MySQL) - see
// go.mau.fi/util/dbutil's ParseDialect.
func whatsappDialectFor(driver db.Driver) (string, bool) {
	switch driver {
	case db.DriverSQLite:
		return "sqlite", true
	case db.DriverPostgres:
		return "postgres", true
	default:
		return "", false
	}
}
