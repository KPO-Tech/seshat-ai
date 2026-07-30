package db

import (
	"context"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm/clause"
)

func backendMigrations() []schemaMigration {
	return []schemaMigration{
		{
			ID:    "20260514_001_backend_schema",
			Scope: migrationScopeBackend,
			Run:   migrateBackendSchema,
		},
		{
			ID:    "20260514_002_seed_default_roles",
			Scope: migrationScopeBackend,
			Run:   seedDefaultRoles,
		},
		{
			ID:    "20260515_003_provider_models",
			Scope: migrationScopeBackend,
			Run:   migrateProviderModels,
		},
		{
			ID:    "20260515_004_user_profiles_apikeys_groups",
			Scope: migrationScopeBackend,
			Run:   migrateUserProfilesAPIKeysGroups,
		},
		{
			ID:    "20260515_005_provider_model_source",
			Scope: migrationScopeBackend,
			Run:   migrateProviderModelSource,
		},
		{
			ID:    "20260517_006_session_model_binding",
			Scope: migrationScopeBackend,
			Run:   migrateSessionModelBinding,
		},
		{
			ID:    "20260519_007_search_provider_configs",
			Scope: migrationScopeBackend,
			Run:   migrateSearchProviderConfigs,
		},
		{
			ID:    "20260519_008_embedder_config",
			Scope: migrationScopeBackend,
			Run:   migrateEmbedderConfig,
		},
		{
			ID:    "20260519_009_provider_setting_is_default",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gProviderSetting{})
			},
		},
		{
			ID:    "20260519_010_user_memories",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gUserMemory{})
			},
		},
		{
			ID:    "20260519_011_storage_config",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gStorageConfig{})
			},
		},
		{
			ID:    "20260519_012_user_preferences",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gUserPreferences{})
			},
		},
		{
			ID:    "20260519_013_mcp_servers",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gMCPServer{})
			},
		},
		{
			ID:    "20260525_014_mcp_server_secret_encryption",
			Scope: migrationScopeBackend,
			Run:   migrateMCPServerSecretEncryption,
		},
		{
			ID:    "20260525_015_session_execution_policy",
			Scope: migrationScopeBackend,
			Run:   migrateSessionExecutionPolicy,
		},
		{
			ID:    "20260526_016_api_key_hashing",
			Scope: migrationScopeBackend,
			Run:   migrateAPIKeyHashing,
		},
		{
			ID:    "20260527_017_plan_documents",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gPlanDocument{})
			},
		},
		{
			ID:    "20260527_018_workspace_path",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gSessionOwnership{})
			},
		},
		{
			ID:    "20260527_019_project_path",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gSessionOwnership{})
			},
		},
		{
			ID:    "20260527_020_session_files",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gFile{})
			},
		},
		{
			ID:    "20260527_021_file_markdown_path",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gFile{})
			},
		},
		{
			ID:    "20260531_022_user_preferences_max_sub_agent_depth",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gUserPreferences{})
			},
		},
		{
			ID:    "20260531_024_longterm_memory",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(
					&gMemoryEntity{},
					&gMemoryObservation{},
					&gMemoryRelation{},
				)
			},
		},
		{
			// Rename from_entity_id → from_name and to_entity_id → to_name to align
			// memory_relations with the CoreSQLite DDL used by the SDK session store.
			// SQLite 3.25+ supports ALTER TABLE RENAME COLUMN; errors are ignored so
			// this is idempotent on DBs that already have the correct column names.
			ID:    "20260618_027_memory_relations_rename_columns",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				for _, stmt := range []string{
					`ALTER TABLE memory_relations RENAME COLUMN from_entity_id TO from_name`,
					`ALTER TABLE memory_relations RENAME COLUMN to_entity_id TO to_name`,
				} {
					if err := db.gormDB.WithContext(ctx).Exec(stmt).Error; err != nil {
						// Column already renamed or never existed with the old name — skip.
						if !strings.Contains(err.Error(), "no such column") &&
							!strings.Contains(err.Error(), "no column named") &&
							!strings.Contains(err.Error(), "does not exist") {
							return fmt.Errorf("rename memory_relations column: %w", err)
						}
					}
				}
				return nil
			},
		},
		{
			ID:    "20260605_025_agent_definitions",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gAgentDefinition{})
			},
		},
		{
			ID:    "20260606_026_scheduled_jobs",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gScheduledJob{})
			},
		},
		{
			ID:    "20260618_028_searxng_auth_username",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gSearchProviderConfig{})
			},
		},
		{
			// Compound ownership indexes accelerate the two most common query patterns:
			//   1. list sessions for a user ordered by last update   → (user_id, updated_at DESC)
			//   2. title search within a user's sessions             → (user_id, title)
			// Both columns are individually indexed but compound indexes prevent
			// full-scans when both predicates are present simultaneously.
			ID:    "20260531_023_session_ownership_compound_indexes",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				sqls := []string{
					`CREATE INDEX IF NOT EXISTS idx_session_ownership_user_updated
					 ON session_ownership(user_id, updated_at_unix DESC)`,
					`CREATE INDEX IF NOT EXISTS idx_session_ownership_user_title
					 ON session_ownership(user_id, title)`,
				}
				for _, sql := range sqls {
					if err := db.gormDB.WithContext(ctx).Exec(sql).Error; err != nil {
						return fmt.Errorf("migration 022: %w", err)
					}
				}
				return nil
			},
		},
		{
			ID:    "20260629_029_automation_activations",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gAutomationActivation{})
			},
		},
		{
			ID:    "20260712_030_remote_principal_cache",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gRemotePrincipalCache{})
			},
		},
		{
			ID:    "20260713_031_mcp_org_server_approvals",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gMCPOrgServerApproval{})
			},
		},
		{
			ID:    "20260714_032_docling_config",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gDoclingConfig{})
			},
		},
		{
			ID:    "20260722_033_forced_execution_mode",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gSessionOwnership{})
			},
		},
		{
			ID:    "20260722_034_local_stt_config",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gLocalSTTConfig{})
			},
		},
		{
			ID:    "20260730_035_file_user_message_index",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gFile{})
			},
		},
	}
}

func migrateProviderModels(ctx context.Context, db *DB) error {
	return db.gormDB.WithContext(ctx).AutoMigrate(&gProviderModel{})
}

func migrateProviderModelSource(ctx context.Context, db *DB) error {
	// Adds the source column ("catalog"/"user") to provider_models
	return db.gormDB.WithContext(ctx).AutoMigrate(&gProviderModel{})
}

func migrateSessionModelBinding(ctx context.Context, db *DB) error {
	return db.gormDB.WithContext(ctx).AutoMigrate(&gSessionOwnership{})
}

func migrateSearchProviderConfigs(ctx context.Context, db *DB) error {
	return db.gormDB.WithContext(ctx).AutoMigrate(&gSearchProviderConfig{})
}

func migrateEmbedderConfig(ctx context.Context, db *DB) error {
	return db.gormDB.WithContext(ctx).AutoMigrate(&gEmbedderConfig{})
}

func migrateUserProfilesAPIKeysGroups(ctx context.Context, db *DB) error {
	return db.gormDB.WithContext(ctx).AutoMigrate(
		&gUser{},        // add new profile columns (username, bio, avatar_url, last_active_at_unix, settings_json)
		&gAPIKey{},      // new table
		&gUserGroup{},   // new table
		&gGroupMember{}, // new table
	)
}

func migrateBackendSchema(ctx context.Context, db *DB) error {
	return db.gormDB.WithContext(ctx).AutoMigrate(
		&gUser{},
		&gRole{},
		&gUserRole{},
		&gOrganization{},
		&gWorkspace{},
		&gWorkspaceMembership{},
		&gAuthSession{},
		&gSessionOwnership{},
		&gFile{},
		&gCredential{},
		&gCorpus{},
		&gCorpusFile{},
		&gKnowledgeIngestionJob{},
		&gProviderSetting{},
		&gProviderOAuthConnection{},
		&gWebSearchSetting{},
		&gWebSearchLog{},
		&gAuditLog{},
		&gUsageCounter{},
	)
}

func seedDefaultRoles(ctx context.Context, db *DB) error {
	now := time.Now().Unix()
	defaultRoles := []gRole{
		{ID: "role_admin", Name: "admin", Description: "Full administrative access", IsSystem: 1, CreatedAtUnix: now, UpdatedAtUnix: now, MetadataJSON: "{}"},
		{ID: "role_member", Name: "member", Description: "Default authenticated user role", IsSystem: 1, CreatedAtUnix: now, UpdatedAtUnix: now, MetadataJSON: "{}"},
		{ID: "role_viewer", Name: "viewer", Description: "Read-only access role", IsSystem: 1, CreatedAtUnix: now, UpdatedAtUnix: now, MetadataJSON: "{}"},
	}
	return db.gormDB.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&defaultRoles).Error
}

func migrateSessionExecutionPolicy(ctx context.Context, db *DB) error {
	return db.gormDB.WithContext(ctx).AutoMigrate(&gSessionOwnership{}, &gUserPreferences{})
}

func migrateAPIKeyHashing(ctx context.Context, db *DB) error {
	if err := db.gormDB.WithContext(ctx).AutoMigrate(&gAPIKey{}); err != nil {
		return fmt.Errorf("auto-migrate api keys: %w", err)
	}

	var rows []gAPIKey
	if err := db.gormDB.WithContext(ctx).Find(&rows).Error; err != nil {
		return fmt.Errorf("load api keys for hashing migration: %w", err)
	}

	for _, row := range rows {
		updates := map[string]any{}
		if !strings.HasPrefix(row.KeyHash, apiKeyHashPrefix) {
			updates["key"] = hashAPIKey(row.KeyHash)
			if row.KeySuffix == "" {
				updates["key_suffix"] = apiKeySuffix(row.KeyHash)
			}
		} else if row.KeySuffix == "" && strings.HasPrefix(row.KeyHash, "sk-") {
			updates["key_suffix"] = apiKeySuffix(row.KeyHash)
		}
		if len(updates) == 0 {
			continue
		}
		if err := db.gormDB.WithContext(ctx).
			Model(&gAPIKey{}).
			Where("id = ?", row.ID).
			Updates(updates).Error; err != nil {
			return fmt.Errorf("migrate api key %s: %w", row.ID, err)
		}
	}
	return nil
}
