package db

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// gAutomationActivation tracks whether a user has automation enabled.
type gAutomationActivation struct {
	ID        string `gorm:"primaryKey;size:64"`
	UserID    string `gorm:"column:user_id;uniqueIndex;size:64;not null"`
	Enabled   bool   `gorm:"column:enabled;not null;default:false"`
	CreatedAt int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAt int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gAutomationActivation) TableName() string { return "automation_activations" }

// AutomationActivation is the public view of an activation record.
type AutomationActivation struct {
	ID        string
	UserID    string
	Enabled   bool
	CreatedAt time.Time
	UpdatedAt time.Time
}

// AutomationActivationStore manages per-user automation activation records.
type AutomationActivationStore struct {
	db *DB
}

func NewAutomationActivationStore(database *DB) (*AutomationActivationStore, error) {
	if database == nil {
		return nil, fmt.Errorf("automation activation store: database is required")
	}
	return &AutomationActivationStore{db: database}, nil
}

// IsEnabled returns true when the user has automation explicitly enabled.
// Returns false (not an error) for unknown users.
func (s *AutomationActivationStore) IsEnabled(ctx context.Context, userID string) (bool, error) {
	var row gAutomationActivation
	err := s.db.gormDB.WithContext(ctx).
		Where("user_id = ?", userID).
		First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check automation activation: %w", err)
	}
	return row.Enabled, nil
}

// Enable activates automation for userID, creating the record if needed.
func (s *AutomationActivationStore) Enable(ctx context.Context, userID string) error {
	var row gAutomationActivation
	err := s.db.gormDB.WithContext(ctx).
		Where("user_id = ?", userID).
		First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return s.db.gormDB.WithContext(ctx).Create(&gAutomationActivation{
			ID:      uuid.New().String(),
			UserID:  userID,
			Enabled: true,
		}).Error
	}
	if err != nil {
		return fmt.Errorf("enable automation activation: %w", err)
	}
	return s.db.gormDB.WithContext(ctx).
		Model(&gAutomationActivation{}).
		Where("user_id = ?", userID).
		Update("enabled", true).Error
}

// Disable deactivates automation for userID. No-op if the user is unknown.
func (s *AutomationActivationStore) Disable(ctx context.Context, userID string) error {
	return s.db.gormDB.WithContext(ctx).
		Model(&gAutomationActivation{}).
		Where("user_id = ?", userID).
		Update("enabled", false).Error
}

// List returns all activation records, enabled or not.
func (s *AutomationActivationStore) List(ctx context.Context) ([]AutomationActivation, error) {
	var rows []gAutomationActivation
	if err := s.db.gormDB.WithContext(ctx).
		Order("created_at_unix DESC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list automation activations: %w", err)
	}
	result := make([]AutomationActivation, len(rows))
	for i, r := range rows {
		result[i] = AutomationActivation{
			ID:        r.ID,
			UserID:    r.UserID,
			Enabled:   r.Enabled,
			CreatedAt: time.Unix(r.CreatedAt, 0).UTC(),
			UpdatedAt: time.Unix(r.UpdatedAt, 0).UTC(),
		}
	}
	return result, nil
}
