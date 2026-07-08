package config

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
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
}

func LoadFromEnv() Config {
	return Config{
		Port:               envInt("SESHAT_SERVER_PORT", 8081),
		ReadTimeout:        15 * time.Second,
		WriteTimeout:       15 * time.Second,
		IdleTimeout:        60 * time.Second,
		DB:                 dbConfigFromEnv(),
		SessionTTL:         envDuration("SESHAT_SERVER_SESSION_TTL", 24*time.Hour),
		CORSAllowedOrigins: corsAllowedOriginsFromEnv(),
		SchedulerInterval:  envDuration("SESHAT_SERVER_SCHEDULER_INTERVAL", 30*time.Second),
		StaleRunTimeout:    envDuration("SESHAT_SERVER_STALE_RUN_TIMEOUT", 10*time.Minute),
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
