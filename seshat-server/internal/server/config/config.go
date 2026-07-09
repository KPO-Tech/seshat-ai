package config

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	sdkstorage "github.com/EngineerProjects/seshat/pkg/storage"
	sdkvector "github.com/EngineerProjects/seshat/pkg/vector"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

type Config struct {
	Port                     int
	ReadTimeout              time.Duration
	WriteTimeout             time.Duration
	IdleTimeout              time.Duration
	DB                       sdb.Config
	SessionTTL               time.Duration
	CORSAllowedOrigins       []string
	SchedulerInterval        time.Duration
	StaleRunTimeout          time.Duration
	Storage                  sdkstorage.Config
	IngestionPollInterval    time.Duration
	IngestionMaxPollInterval time.Duration
	Vector                   sdkvector.Config
}

func LoadFromEnv() Config {
	return Config{
		Port:                     envInt("SESHAT_SERVER_PORT", 8081),
		ReadTimeout:              15 * time.Second,
		WriteTimeout:             15 * time.Second,
		IdleTimeout:              60 * time.Second,
		DB:                       dbConfigFromEnv(),
		SessionTTL:               envDuration("SESHAT_SERVER_SESSION_TTL", 24*time.Hour),
		CORSAllowedOrigins:       corsAllowedOriginsFromEnv(),
		SchedulerInterval:        envDuration("SESHAT_SERVER_SCHEDULER_INTERVAL", 30*time.Second),
		StaleRunTimeout:          envDuration("SESHAT_SERVER_STALE_RUN_TIMEOUT", 10*time.Minute),
		Storage:                  storageConfigFromEnv(),
		IngestionPollInterval:    envDuration("SESHAT_SERVER_INGESTION_POLL_INTERVAL", 500*time.Millisecond),
		IngestionMaxPollInterval: envDuration("SESHAT_SERVER_INGESTION_MAX_POLL_INTERVAL", 5*time.Second),
		Vector:                   vectorConfigFromEnv(),
	}
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
	backend := sdkvector.Backend(strings.ToLower(strings.TrimSpace(os.Getenv("SESHAT_SERVER_VECTOR_BACKEND"))))
	if backend == "" {
		backend = sdkvector.BackendHNSW
	}
	hnswDir := os.Getenv("SESHAT_SERVER_VECTOR_HNSW_DIR")
	if hnswDir == "" {
		runtimeRoot := os.Getenv("SESHAT_RUNTIME_ROOT")
		if runtimeRoot == "" {
			runtimeRoot = ".seshat"
		}
		hnswDir = filepath.Join(runtimeRoot, "server", "vectors")
	}
	return sdkvector.Config{Backend: backend, HNSWDir: hnswDir}
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
