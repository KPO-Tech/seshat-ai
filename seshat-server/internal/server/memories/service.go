// Package memories is a strictly personal, multi-row-per-user memory list —
// no organization, no permission catalog, self-service only (the same trust
// level as preferences/GET-PUT /auth/me). Mirrors seshat-backend's own
// internal/db/user_memories.go field-for-field so translation on the client
// side is trivial.
package memories

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/apperr"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

const (
	MemoryTypePreference  = "preference"
	MemoryTypeInstruction = "instruction"
	MemoryTypePattern     = "pattern"
	MemoryTypeFact        = "fact"
	MemoryTypeContext     = "context"
)

type UserMemory struct {
	ID         string    `json:"id"`
	UserID     string    `json:"user_id"`
	Type       string    `json:"type"`
	Key        string    `json:"key"`
	Value      string    `json:"value"`
	Importance float64   `json:"importance"`
	Source     string    `json:"source,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type CreateParams struct {
	Type       string
	Key        string
	Value      string
	Importance float64
	Source     string
}

type UpdateParams struct {
	Type       *string
	Key        *string
	Value      *string
	Importance *float64
	Source     *string
}

type Service struct {
	db *sdb.DB
}

func New(database *sdb.DB) *Service {
	return &Service{db: database}
}

// List returns the caller's own memories, most important/most recent first
// — same ordering as seshat-backend's local store.
func (s *Service) List(ctx context.Context, principal *iam.Principal) ([]UserMemory, error) {
	if principal == nil {
		return nil, apperr.Unauthorized("authentication required")
	}
	var rows []sdb.UserMemory
	if err := s.db.Gorm().WithContext(ctx).
		Where("user_id = ?", principal.User.ID).
		Order("importance DESC, created_at DESC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]UserMemory, 0, len(rows))
	for _, r := range rows {
		out = append(out, toUserMemory(r))
	}
	return out, nil
}

func (s *Service) Create(ctx context.Context, principal *iam.Principal, params CreateParams) (*UserMemory, error) {
	if principal == nil {
		return nil, apperr.Unauthorized("authentication required")
	}
	key := strings.TrimSpace(params.Key)
	if key == "" {
		return nil, apperr.InvalidInput("key is required")
	}
	if len(key) > 255 {
		return nil, apperr.InvalidInput("key exceeds maximum length (255 chars)")
	}
	if len(params.Value) > 4096 {
		return nil, apperr.InvalidInput("value exceeds maximum length (4096 chars)")
	}
	id, err := sdb.NewID("mem")
	if err != nil {
		return nil, err
	}
	record := sdb.UserMemory{
		ID: id, UserID: principal.User.ID,
		Type: normalizeMemoryType(params.Type), Key: key, Value: strings.TrimSpace(params.Value),
		Importance: normalizeMemoryImportance(params.Importance), Source: strings.TrimSpace(params.Source),
	}
	if err := s.db.Gorm().WithContext(ctx).Create(&record).Error; err != nil {
		return nil, err
	}
	result := toUserMemory(record)
	return &result, nil
}

func (s *Service) Update(ctx context.Context, principal *iam.Principal, id string, params UpdateParams) (*UserMemory, error) {
	if principal == nil {
		return nil, apperr.Unauthorized("authentication required")
	}
	var record sdb.UserMemory
	err := s.db.Gorm().WithContext(ctx).Where("id = ? AND user_id = ?", id, principal.User.ID).First(&record).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperr.NotFound("memory not found")
		}
		return nil, err
	}
	if params.Type != nil {
		record.Type = normalizeMemoryType(*params.Type)
	}
	if params.Key != nil {
		record.Key = strings.TrimSpace(*params.Key)
	}
	if params.Value != nil {
		record.Value = strings.TrimSpace(*params.Value)
	}
	if params.Importance != nil {
		record.Importance = normalizeMemoryImportance(*params.Importance)
	}
	if params.Source != nil {
		record.Source = strings.TrimSpace(*params.Source)
	}
	if record.Key == "" {
		return nil, apperr.InvalidInput("key is required")
	}
	if err := s.db.Gorm().WithContext(ctx).Save(&record).Error; err != nil {
		return nil, err
	}
	result := toUserMemory(record)
	return &result, nil
}

func (s *Service) Delete(ctx context.Context, principal *iam.Principal, id string) error {
	if principal == nil {
		return apperr.Unauthorized("authentication required")
	}
	res := s.db.Gorm().WithContext(ctx).Delete(&sdb.UserMemory{}, "id = ? AND user_id = ?", id, principal.User.ID)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return apperr.NotFound("memory not found")
	}
	return nil
}

func (s *Service) DeleteAll(ctx context.Context, principal *iam.Principal) (int64, error) {
	if principal == nil {
		return 0, apperr.Unauthorized("authentication required")
	}
	res := s.db.Gorm().WithContext(ctx).Delete(&sdb.UserMemory{}, "user_id = ?", principal.User.ID)
	return res.RowsAffected, res.Error
}

func toUserMemory(r sdb.UserMemory) UserMemory {
	return UserMemory{
		ID: r.ID, UserID: r.UserID, Type: r.Type, Key: r.Key, Value: r.Value,
		Importance: r.Importance, Source: r.Source, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}

func normalizeMemoryType(value string) string {
	t := strings.TrimSpace(value)
	if t == "" {
		return MemoryTypeFact
	}
	return t
}

func normalizeMemoryImportance(value float64) float64 {
	if value <= 0 {
		return 0.5
	}
	if value > 1 {
		return 1
	}
	return value
}
