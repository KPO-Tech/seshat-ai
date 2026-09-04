// Package db owns the cloud control-plane's real SQL persistence: connection
// setup, GORM models and schema migration. It replaces the earlier bootstrap
// approach of keeping the entire control-plane state in one JSON file.
package db

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/glebarez/sqlite"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Driver identifies which SQL backend a DB connects to. The control plane is
// designed to run on either: SQLite for a single-instance bootstrap/self-host
// deployment, Postgres once the product needs multi-instance/HA operation.
type Driver string

const (
	DriverSQLite   Driver = "sqlite"
	DriverPostgres Driver = "postgres"
)

// Config describes how to open the control-plane database.
type Config struct {
	Driver Driver
	DSN    string
}

// DB wraps the GORM handle used across every iam/* domain file.
type DB struct {
	gormDB *gorm.DB
	driver Driver
}

// Open connects to the configured database. It does not run migrations;
// call Migrate explicitly once the connection is established.
func Open(cfg Config) (*DB, error) {
	if cfg.Driver == "" {
		return nil, fmt.Errorf("database driver is required")
	}
	if cfg.DSN == "" {
		return nil, fmt.Errorf("database DSN is required")
	}

	dialector, err := buildDialector(cfg)
	if err != nil {
		return nil, err
	}

	gdb, err := gorm.Open(dialector, &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if cfg.Driver == DriverSQLite {
		// SQLite has no real concurrent-writer story. A single pooled
		// connection avoids "database is locked" errors under concurrent
		// requests, and is required for an in-memory DSN to behave as one
		// shared database instead of a fresh empty one per connection.
		sqlDB, err := gdb.DB()
		if err != nil {
			return nil, fmt.Errorf("access sql.DB handle: %w", err)
		}
		sqlDB.SetMaxOpenConns(1)
	}

	return &DB{gormDB: gdb, driver: cfg.Driver}, nil
}

func buildDialector(cfg Config) (gorm.Dialector, error) {
	switch cfg.Driver {
	case DriverSQLite:
		if err := ensureSQLitePath(cfg.DSN); err != nil {
			return nil, err
		}
		return sqlite.Open(cfg.DSN), nil
	case DriverPostgres:
		return postgres.Open(cfg.DSN), nil
	default:
		return nil, fmt.Errorf("unsupported database driver: %s", cfg.Driver)
	}
}

func ensureSQLitePath(dsn string) error {
	dir := filepath.Dir(dsn)
	if dir == "." || dir == "" {
		return nil
	}
	return os.MkdirAll(dir, 0o755)
}

// Migrate applies the current schema. The schema is still young enough (no
// production rows to preserve across incompatible changes yet) that plain
// AutoMigrate is the right amount of migration machinery; a versioned
// migration ledger (like seshat-backend's) should replace this once the
// schema needs to evolve safely under real data.
func (d *DB) Migrate() error {
	return d.gormDB.AutoMigrate(
		&User{},
		&Organization{},
		&OrganizationDataKey{},
		&Membership{},
		&Session{},
		&Application{},
		&Provider{},
		&Invitation{},
		&Group{},
		&GroupMember{},
		&PolicyBinding{},
		&CustomRole{},
		&AuditEvent{},
		&Device{},
		&ScheduledJob{},
		&JobRun{},
		&ProviderSetting{},
		&Corpus{},
		&CorpusFile{},
		&KnowledgeIngestionJob{},
		&ConnectorAccount{},
		&ConnectorSyncJob{},
		&DataflowSecret{},
		&ScheduledJobMailCursor{},
		&ConnectorOAuthApp{},
		&ConnectorOAuthState{},
		&EmbedderSetting{},
		&UserPreference{},
		&OrganizationPreference{},
		&SkillRepo{},
		&WebSearchProviderSetting{},
		&WebSearchOrgPolicy{},
		&MCPServerConfig{},
		&HookConfig{},
		&BundleImport{},
		&BundleImportItem{},
		&UserMemory{},
		&MemoryEntity{},
		&MemoryObservation{},
		&MemoryRelation{},
		&AgentPreset{},
		&UsageCounter{},
		&WorkspaceChatSession{},
		&WorkspaceChatMessageRecord{},
		&WorkspaceChatSDKSessionMetadata{},
		&WorkspaceChatSDKTranscriptEntry{},
		&PasswordResetToken{},
		&OIDCLoginState{},
		&SAMLAuthRequestState{},
		&OIDCStepUpState{},
		&SAMLStepUpState{},
		&ProspectingSweep{},
		&ProspectingBusiness{},
		&ProspectingCache{},
		&ProspectingUsage{},
		&ProspectingSettings{},
		&ScimConnection{},
		&ScimSyncEvent{},
		&DesktopPolicyBinding{},
	)
}

// Gorm exposes the underlying handle for read-only queries that don't need
// an explicit transaction.
func (d *DB) Gorm() *gorm.DB {
	return d.gormDB
}

// Transaction runs fn inside a single SQL transaction, matching the
// atomicity the old FileStore.Update gave every multi-step mutation.
func (d *DB) Transaction(fn func(tx *gorm.DB) error) error {
	return d.gormDB.Transaction(fn)
}

// Close releases the underlying connection pool.
func (d *DB) Close() error {
	sqlDB, err := d.gormDB.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}
