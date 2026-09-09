package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	sdkrag "github.com/KPO-Tech/seshat/pkg/rag"
	sdkstorage "github.com/KPO-Tech/seshat/pkg/storage"
	sdkvector "github.com/KPO-Tech/seshat/pkg/vector"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// OrgMode controls whether this deployment allows more than one
// Organization to ever exist. See orgModeFromEnv for the two valid values.
type OrgMode string

const (
	// OrgModeMulti is today's behavior - unlimited organizations (the SaaS
	// deployment: one per self-serve founder, plus admin-created ones). The
	// default, so an unset env var never changes existing behavior.
	OrgModeMulti OrgMode = "multi"
	// OrgModeSingle restricts the whole deployment to exactly one
	// Organization ever, for a company self-hosting seshat-server for
	// itself only. See iam.Service.SetOrgMode / iam.Service.CreateOrganization.
	OrgModeSingle OrgMode = "single"
)

type Config struct {
	Port               int
	ReadTimeout        time.Duration
	WriteTimeout       time.Duration
	IdleTimeout        time.Duration
	DB                 sdb.Config
	SessionTTL         time.Duration
	CORSAllowedOrigins []string
	SchedulerInterval  time.Duration
	StaleRunTimeout    time.Duration
	// JobRunMaxAge/JobRunMaxCountPerJob bound automation.JobRunPurge (Tier
	// 1.4, see docs/helps/audit-2026-09-04-n8n-gap-analysis.md) - either set
	// to 0 disables that criterion. Only completed/failed/cancelled runs are
	// ever eligible, regardless of age/count.
	JobRunMaxAge             time.Duration
	JobRunMaxCountPerJob     int
	JobRunPurgeInterval      time.Duration
	Storage                  sdkstorage.Config
	IngestionPollInterval    time.Duration
	IngestionMaxPollInterval time.Duration
	Vector                   sdkvector.Config
	// DoclingURL points at a running docling-serve instance for converting
	// binary documents (PDF, DOCX, PPTX, XLSX, audio, images) to markdown
	// before chunking. Empty disables it — plain-text/markdown/JSON files
	// still ingest fine either way.
	DoclingURL string
	// KnowledgeChunkProfile controls the document chunk size used by the
	// Knowledge RAG ingestion pipeline. Defaults to the runtime's medium
	// profile, which preserves the previous 768-token Docling setting while
	// making the strategy explicit and auditable.
	KnowledgeChunkProfile sdkrag.ChunkProfile
	// MembershipConfirmationWindow is how long a self-registered "pending"
	// membership (see iam.Service.Register) stays fully usable before
	// iam.Service.BlockExpiredPendingMemberships blocks it unconfirmed.
	MembershipConfirmationWindow time.Duration
	// BootstrapAdminEmail/BootstrapAdminPassword seed a platform super-admin
	// at startup (see iam.Service.EnsureSuperAdmin) so there's always a way
	// in without the one-shot POST /auth/bootstrap wizard. Empty means
	// seeding is skipped, not an error - safe to leave set across restarts,
	// idempotent by email (an existing account at that email is never
	// touched, including its password).
	BootstrapAdminEmail    string
	BootstrapAdminPassword string
	// SMTP* configure outbound transactional email (invitation accept
	// links, password reset links - see iam.Service.SetMailer). Empty
	// SMTPHost means "don't send," not an error - every flow that would
	// send mail already works without it (a manually copy-pasted
	// invitation token, an admin-driven password reset), so this is
	// opt-in, same convention as BootstrapAdminEmail above.
	SMTPHost     string
	SMTPPort     int
	SMTPUsername string
	SMTPPassword string
	// SMTPFrom is the full From header value, e.g.
	// "Seshat <noreply@seshat.local>".
	SMTPFrom string
	// PublicAppURL is this deployment's own console URL (e.g.
	// http://localhost:3000), used to build the links embedded in emails.
	PublicAppURL string
	// PublicAPIURL is this deployment's own API base URL (e.g.
	// http://localhost:8081, or the real internet-facing URL in production),
	// distinct from PublicAppURL above - used to build the redirect_uri this
	// server presents to an OIDC identity provider (iam.Service.BeginOIDCLogin),
	// which must point at an API route (/api/v1/auth/oidc/.../callback), not
	// the console frontend. Defaults to matching Port when unset, since a
	// local dev/single-instance deployment's own API is reachable at
	// localhost:Port by construction.
	PublicAPIURL string
	// OrgMode is "multi" (default - preserves today's behavior) or "single"
	// (for a company self-hosting seshat-server for itself only; restricts
	// the deployment to exactly one Organization ever - see
	// iam.Service.CreateOrganization). Unlike Storage/Vector's
	// provider/backend fields, an explicit-but-invalid value here is NOT
	// silently coerced to the default: that would leave a self-hoster's
	// deployment open to unlimited orgs without them knowing, which is the
	// one thing this flag exists to prevent. Validation happens at
	// iam.Service.SetOrgMode (called from app.New), the same fail-fast
	// point a bad SESHAT_SERVER_DB_DRIVER gets in sdb.Open - LoadFromEnv
	// itself stays error-free, consistent with every other field here.
	OrgMode OrgMode
}

func LoadFromEnv() Config {
	port := envInt("SESHAT_SERVER_PORT", 8081)
	return Config{
		Port:                         port,
		ReadTimeout:                  15 * time.Second,
		WriteTimeout:                 15 * time.Second,
		IdleTimeout:                  60 * time.Second,
		DB:                           dbConfigFromEnv(),
		SessionTTL:                   envDuration("SESHAT_SERVER_SESSION_TTL", 24*time.Hour),
		CORSAllowedOrigins:           corsAllowedOriginsFromEnv(),
		SchedulerInterval:            envDuration("SESHAT_SERVER_SCHEDULER_INTERVAL", 30*time.Second),
		StaleRunTimeout:              envDuration("SESHAT_SERVER_STALE_RUN_TIMEOUT", 10*time.Minute),
		JobRunMaxAge:                 envDurationAllowZero("SESHAT_SERVER_JOB_RUN_MAX_AGE", 336*time.Hour),
		JobRunMaxCountPerJob:         envIntAllowZero("SESHAT_SERVER_JOB_RUN_MAX_COUNT_PER_JOB", 10000),
		JobRunPurgeInterval:          envDuration("SESHAT_SERVER_JOB_RUN_PURGE_INTERVAL", time.Hour),
		Storage:                      storageConfigFromEnv(),
		IngestionPollInterval:        envDuration("SESHAT_SERVER_INGESTION_POLL_INTERVAL", 500*time.Millisecond),
		IngestionMaxPollInterval:     envDuration("SESHAT_SERVER_INGESTION_MAX_POLL_INTERVAL", 5*time.Second),
		Vector:                       vectorConfigFromEnv(),
		DoclingURL:                   strings.TrimSpace(os.Getenv("SESHAT_SERVER_DOCLING_URL")),
		KnowledgeChunkProfile:        knowledgeChunkProfileFromEnv(),
		MembershipConfirmationWindow: envDuration("SESHAT_SERVER_MEMBERSHIP_CONFIRMATION_WINDOW", 60*24*time.Hour),
		BootstrapAdminEmail:          strings.TrimSpace(os.Getenv("SESHAT_SERVER_BOOTSTRAP_ADMIN_EMAIL")),
		BootstrapAdminPassword:       strings.TrimSpace(os.Getenv("SESHAT_SERVER_BOOTSTRAP_ADMIN_PASSWORD")),
		SMTPHost:                     strings.TrimSpace(os.Getenv("SESHAT_SERVER_SMTP_HOST")),
		SMTPPort:                     envInt("SESHAT_SERVER_SMTP_PORT", 1025),
		SMTPUsername:                 strings.TrimSpace(os.Getenv("SESHAT_SERVER_SMTP_USERNAME")),
		SMTPPassword:                 strings.TrimSpace(os.Getenv("SESHAT_SERVER_SMTP_PASSWORD")),
		SMTPFrom:                     strings.TrimSpace(os.Getenv("SESHAT_SERVER_SMTP_FROM")),
		PublicAppURL:                 strings.TrimRight(strings.TrimSpace(os.Getenv("SESHAT_SERVER_PUBLIC_APP_URL")), "/"),
		PublicAPIURL:                 publicAPIURLFromEnv(port),
		OrgMode:                      orgModeFromEnv(),
	}
}

func knowledgeChunkProfileFromEnv() sdkrag.ChunkProfile {
	name := sdkrag.ChunkProfileName(strings.ToLower(strings.TrimSpace(os.Getenv("SESHAT_SERVER_KNOWLEDGE_CHUNK_PROFILE"))))
	profile, ok := sdkrag.RecommendedChunkProfile(name)
	if !ok {
		profile = sdkrag.DefaultChunkProfile()
	}
	maxTokens := envIntAllowZero("SESHAT_SERVER_KNOWLEDGE_CHUNK_MAX_TOKENS", 0)
	overlapTokens := envIntAllowZero("SESHAT_SERVER_KNOWLEDGE_CHUNK_OVERLAP_TOKENS", 0)
	if maxTokens == 0 && overlapTokens == 0 && name != sdkrag.ChunkProfileCustom {
		return profile
	}
	if maxTokens == 0 {
		maxTokens = profile.MaxTokens
	}
	custom, err := sdkrag.NewCustomChunkProfile(maxTokens, overlapTokens)
	if err != nil {
		return profile
	}
	return custom
}

// orgModeFromEnv defaults to OrgModeMulti when unset. A non-empty value is
// passed through verbatim (lowercased/trimmed) rather than validated here -
// iam.Service.SetOrgMode rejects anything other than "single"/"multi" at
// startup (see app.New), so a typo can't silently leave a deployment in
// unlimited-org mode.
func orgModeFromEnv() OrgMode {
	raw := strings.ToLower(strings.TrimSpace(os.Getenv("SESHAT_SERVER_ORG_MODE")))
	if raw == "" {
		return OrgModeMulti
	}
	return OrgMode(raw)
}

// publicAPIURLFromEnv defaults to localhost:port (matching Port's own
// default) rather than requiring every local/dev deployment to set this
// explicitly - only a real internet-facing production deployment behind a
// domain needs to override it.
func publicAPIURLFromEnv(port int) string {
	if explicit := strings.TrimRight(strings.TrimSpace(os.Getenv("SESHAT_SERVER_PUBLIC_API_URL")), "/"); explicit != "" {
		return explicit
	}
	return fmt.Sprintf("http://localhost:%d", port)
}

// corsAllowedOriginsFromEnv reads a comma-separated allow-list (e.g. the
// seshat-ui dev and prod origins). Unset means no CORS headers are sent,
// which matches today's behavior (a browser SPA on another origin is
// blocked) until an operator opts in explicitly.
func corsAllowedOriginsFromEnv() []string {
	raw := strings.TrimSpace(os.Getenv("SESHAT_SERVER_CORS_ALLOWED_ORIGINS"))
	if raw == "" {
		return nil
	}
	origins := make([]string, 0)
	for _, origin := range strings.Split(raw, ",") {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			origins = append(origins, origin)
		}
	}
	return origins
}

// storageConfigFromEnv reads knowledge-base file storage config from
// SESHAT_SERVER_-prefixed vars, deliberately separate from the runtime's
// own SESHAT_S3_*/SESHAT_STORAGE_LOCAL_PATH globals (pkg/storage.GetConfigFromEnv)
// so this control plane's storage location doesn't collide with whatever a
// co-located seshat-backend/seshat-ui process has configured for itself.
// Defaults to local disk under the same runtime root as the SQLite default.
func storageConfigFromEnv() sdkstorage.Config {
	provider := sdkstorage.ProviderType(strings.ToLower(strings.TrimSpace(os.Getenv("SESHAT_SERVER_STORAGE_PROVIDER"))))
	if provider == "" {
		provider = sdkstorage.ProviderLocal
	}
	localPath := os.Getenv("SESHAT_SERVER_STORAGE_LOCAL_PATH")
	if localPath == "" {
		runtimeRoot := os.Getenv("SESHAT_RUNTIME_ROOT")
		if runtimeRoot == "" {
			runtimeRoot = ".seshat"
		}
		localPath = filepath.Join(runtimeRoot, "server", "artifacts")
	}
	return sdkstorage.Config{
		Provider:          provider,
		LocalPath:         localPath,
		S3Endpoint:        os.Getenv("SESHAT_SERVER_S3_ENDPOINT"),
		S3Bucket:          os.Getenv("SESHAT_SERVER_S3_BUCKET"),
		S3AccessKeyID:     os.Getenv("SESHAT_SERVER_S3_ACCESS_KEY_ID"),
		S3SecretAccessKey: os.Getenv("SESHAT_SERVER_S3_SECRET_ACCESS_KEY"),
		S3Region:          os.Getenv("SESHAT_SERVER_S3_REGION"),
		S3KeyPrefix:       os.Getenv("SESHAT_SERVER_S3_KEY_PREFIX"),
	}
}

// vectorConfigFromEnv reads the RAG vector store backend, defaulting to
// the embedded HNSW backend (no CGO, no external service, no separate DB
// connection to bridge in) — the simplest thing that works for a
// single-instance self-hosted deployment. pgvector (sharing this server's
// own Postgres) is supported by the runtime and is the natural upgrade
// path for a real multi-instance deployment, but wiring seshat-server's
// GORM connection into the runtime's own low-level DB handle is follow-up
// work, not done here.
func vectorConfigFromEnv() sdkvector.Config {
	storeKind := vectorStoreKindFromEnv()
	if storeKind == "" {
		storeKind = sdkvector.StoreHNSW
	}
	hnswDir := os.Getenv("SESHAT_SERVER_VECTOR_HNSW_DIR")
	if hnswDir == "" {
		runtimeRoot := os.Getenv("SESHAT_RUNTIME_ROOT")
		if runtimeRoot == "" {
			runtimeRoot = ".seshat"
		}
		hnswDir = filepath.Join(runtimeRoot, "server", "vectors")
	}
	return sdkvector.Config{
		StoreKind:                    storeKind,
		Backend:                      storeKind,
		HNSWDir:                      hnswDir,
		Dim:                          envIntAllowZero("SESHAT_SERVER_VECTOR_DIM", 0),
		OpenSearchAddresses:          envCSV("SESHAT_SERVER_OPENSEARCH_ADDRESSES"),
		OpenSearchUsername:           strings.TrimSpace(os.Getenv("SESHAT_SERVER_OPENSEARCH_USERNAME")),
		OpenSearchPassword:           strings.TrimSpace(os.Getenv("SESHAT_SERVER_OPENSEARCH_PASSWORD")),
		OpenSearchAPIKey:             strings.TrimSpace(os.Getenv("SESHAT_SERVER_OPENSEARCH_API_KEY")),
		OpenSearchIndexPrefix:        strings.TrimSpace(os.Getenv("SESHAT_SERVER_OPENSEARCH_INDEX_PREFIX")),
		OpenSearchCreateIndex:        envBoolPointer("SESHAT_SERVER_OPENSEARCH_CREATE_INDEX"),
		OpenSearchKNN:                envBool("SESHAT_SERVER_OPENSEARCH_KNN", false),
		OpenSearchInsecureSkipVerify: envBool("SESHAT_SERVER_OPENSEARCH_INSECURE_SKIP_VERIFY", false),
		OpenSearchBulkSize:           envIntAllowZero("SESHAT_SERVER_OPENSEARCH_BULK_SIZE", 0),
	}
}

func vectorStoreKindFromEnv() sdkvector.StoreKind {
	raw := strings.TrimSpace(os.Getenv("SESHAT_SERVER_VECTOR_STORE"))
	if raw == "" {
		raw = strings.TrimSpace(os.Getenv("SESHAT_SERVER_VECTOR_BACKEND"))
	}
	return sdkvector.StoreKind(strings.ToLower(raw))
}

func dbConfigFromEnv() sdb.Config {
	driver := sdb.Driver(strings.ToLower(strings.TrimSpace(os.Getenv("SESHAT_SERVER_DB_DRIVER"))))
	if driver == "" {
		driver = sdb.DriverSQLite
	}
	dsn := os.Getenv("SESHAT_SERVER_DB_DSN")
	if dsn == "" && driver == sdb.DriverSQLite {
		dsn = defaultSQLitePath()
	}
	return sdb.Config{Driver: driver, DSN: dsn}
}

func defaultSQLitePath() string {
	if value := os.Getenv("SESHAT_SERVER_DATA_PATH"); value != "" {
		return value
	}
	runtimeRoot := os.Getenv("SESHAT_RUNTIME_ROOT")
	if runtimeRoot == "" {
		runtimeRoot = ".seshat"
	}
	return filepath.Join(runtimeRoot, "server", "state.db")
}

func envInt(key string, fallback int) int {
	if raw := os.Getenv(key); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			return parsed
		}
	}
	return fallback
}

func envDuration(key string, fallback time.Duration) time.Duration {
	if raw := os.Getenv(key); raw != "" {
		if parsed, err := time.ParseDuration(raw); err == nil && parsed > 0 {
			return parsed
		}
	}
	return fallback
}

// envIntAllowZero/envDurationAllowZero are envInt/envDuration but also
// accept an explicit "0" - unlike those settings (where zero would be a
// busy-loop or a no-op, so an unparseable/zero value falls back to a safe
// default instead), a purge criterion's zero is a legitimate, intentional
// "disabled" that operators must be able to set without a redeploy.
func envIntAllowZero(key string, fallback int) int {
	if raw := os.Getenv(key); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 0 {
			return parsed
		}
	}
	return fallback
}

func envDurationAllowZero(key string, fallback time.Duration) time.Duration {
	if raw := os.Getenv(key); raw != "" {
		if parsed, err := time.ParseDuration(raw); err == nil && parsed >= 0 {
			return parsed
		}
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	if raw := strings.TrimSpace(os.Getenv(key)); raw != "" {
		if parsed, err := strconv.ParseBool(raw); err == nil {
			return parsed
		}
	}
	return fallback
}

func envBoolPointer(key string) *bool {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return nil
	}
	parsed, err := strconv.ParseBool(raw)
	if err != nil {
		return nil
	}
	return &parsed
}

func envCSV(key string) []string {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return nil
	}
	values := make([]string, 0)
	for _, value := range strings.Split(raw, ",") {
		value = strings.TrimSpace(value)
		if value != "" {
			values = append(values, value)
		}
	}
	return values
}
