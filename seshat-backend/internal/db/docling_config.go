package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

const doclingConfigID = "default"

type gDoclingConfig struct {
	ID            string `gorm:"primaryKey;size:64"`
	BaseURL       string `gorm:"column:base_url;type:text;not null;default:''"`
	Enabled       bool   `gorm:"column:enabled;not null;default:true"`
	UpdatedAtUnix int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
}

func (gDoclingConfig) TableName() string { return "docling_config" }

// DoclingConfig is the persisted, user-configurable override for which
// docling-serve instance to use — self-hosted, on the local network, or an
// organization's own. Empty BaseURL (the default) means "use whatever was
// resolved at boot" (the managed local venv, if running) — see
// internal/config/bootstrap.go's resolveDocling closure.
type DoclingConfig struct {
	BaseURL   string
	Enabled   bool
	UpdatedAt time.Time
	CreatedAt time.Time
}

type UpsertDoclingConfigParams struct {
	BaseURL string
	Enabled bool
}

type DoclingConfigStore struct {
	db *DB
}

func NewDoclingConfigStore(database *DB) (*DoclingConfigStore, error) {
	if database == nil {
		return nil, fmt.Errorf("docling config store: database is required")
	}
	return &DoclingConfigStore{db: database}, nil
}

func (s *DoclingConfigStore) Get(ctx context.Context) (*DoclingConfig, error) {
	var row gDoclingConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", doclingConfigID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	cfg := doclingConfigFromModel(row)
	return &cfg, nil
}

func (s *DoclingConfigStore) Upsert(ctx context.Context, p UpsertDoclingConfigParams) (*DoclingConfig, error) {
	baseURL := strings.TrimSpace(p.BaseURL)

	var row gDoclingConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", doclingConfigID).First(&row).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		row = gDoclingConfig{
			ID:      doclingConfigID,
			BaseURL: baseURL,
			Enabled: p.Enabled,
		}
		if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
			return nil, err
		}
		cfg := doclingConfigFromModel(row)
		return &cfg, nil
	}
	if err != nil {
		return nil, err
	}

	updates := map[string]any{
		"base_url": baseURL,
		"enabled":  p.Enabled,
	}
	if err := s.db.gormDB.WithContext(ctx).
		Model(&gDoclingConfig{}).
		Where("id = ?", doclingConfigID).
		Updates(updates).Error; err != nil {
		return nil, err
	}

	return s.Get(ctx)
}

func doclingConfigFromModel(row gDoclingConfig) DoclingConfig {
	return DoclingConfig{
		BaseURL:   row.BaseURL,
		Enabled:   row.Enabled,
		UpdatedAt: time.Unix(row.UpdatedAtUnix, 0).UTC(),
		CreatedAt: time.Unix(row.CreatedAtUnix, 0).UTC(),
	}
}
