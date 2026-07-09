package preferences

import (
	"context"
	"fmt"
	"strings"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	"github.com/EngineerProjects/seshat/pkg/types"
)

type Service struct {
	store *db.UserPreferencesStore
}

func NewService(store *db.UserPreferencesStore) *Service {
	return &Service{store: store}
}

func (s *Service) Get(ctx context.Context, userID string) (*UserPreferences, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("user preferences store not available", nil)
	}
	row, err := s.store.Get(ctx, userID)
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	if row == nil {
		return &UserPreferences{UserID: userID}, nil
	}
	result := fromDB(row)
	return &result, nil
}

func (s *Service) Upsert(ctx context.Context, p UpsertParams) (*UserPreferences, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("user preferences store not available", nil)
	}
	maxDepth := p.MaxSubAgentDepth
	if maxDepth < 0 {
		maxDepth = 0
	}
	if maxDepth > 5 {
		maxDepth = 5
	}
	saved, err := s.store.Upsert(ctx, db.UpsertUserPreferencesParams{
		UserID:                    p.UserID,
		PreferredName:             p.PreferredName,
		Profession:                p.Profession,
		About:                     p.About,
		WorkingStyle:              p.WorkingStyle,
		ResponseStyle:             p.ResponseStyle,
		ExtraContext:              p.ExtraContext,
		InteractivePermissionMode: p.InteractivePermissionMode,
		AutomationPermissionMode:  p.AutomationPermissionMode,
		MaxSubAgentDepth:          maxDepth,
	})
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	result := fromDB(saved)
	return &result, nil
}

func (s *Service) BuildSystemPromptBlock(ctx context.Context, userID string) (string, error) {
	if s == nil || s.store == nil {
		return "", nil
	}
	row, err := s.store.Get(ctx, userID)
	if err != nil || row == nil {
		return "", nil
	}
	return row.BuildSystemPromptBlock(), nil
}

func (s *Service) ResolvePermissionModes(ctx context.Context, principal *backendauth.Principal, origin types.ExecutionOrigin) (types.PermissionMode, error) {
	if s == nil || s.store == nil || principal == nil {
		if origin == types.ExecutionOriginAutomation {
			return types.PermissionModeNever, nil
		}
		return types.PermissionModeOnRequest, nil
	}
	row, err := s.store.Get(ctx, principal.User.ID)
	if err != nil || row == nil {
		if origin == types.ExecutionOriginAutomation {
			return types.PermissionModeNever, nil
		}
		return types.PermissionModeOnRequest, nil
	}
	if origin == types.ExecutionOriginAutomation {
		return row.PreferredAutomationPermissionMode(), nil
	}
	return row.PreferredInteractivePermissionMode(), nil
}

func (s *Service) GetMaxSubAgentDepth(ctx context.Context, userID string) (int, error) {
	if s == nil || s.store == nil {
		return 0, nil
	}
	row, err := s.store.Get(ctx, userID)
	if err != nil || row == nil || row.MaxSubAgentDepth <= 0 {
		return 0, nil
	}
	return row.MaxSubAgentDepth, nil
}

func (s *Service) ValidatePermissionMode(raw string) bool {
	if raw == "" {
		return true
	}
	_, ok := types.NormalizePermissionMode(raw)
	return ok
}

func fromDB(p *db.UserPreferences) UserPreferences {
	if p == nil {
		return UserPreferences{}
	}
	return UserPreferences{
		UserID:                    p.UserID,
		PreferredName:             p.PreferredName,
		Profession:                p.Profession,
		About:                     p.About,
		WorkingStyle:              p.WorkingStyle,
		ResponseStyle:             p.ResponseStyle,
		ExtraContext:              p.ExtraContext,
		InteractivePermissionMode: p.InteractivePermissionMode,
		AutomationPermissionMode:  p.AutomationPermissionMode,
		MaxSubAgentDepth:          p.MaxSubAgentDepth,
		UpdatedAt:                 p.UpdatedAt,
	}
}

// ParsePermissionMode is a helper used by HTTP handlers.
func ParsePermissionMode(raw string) (types.PermissionMode, bool, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", false, nil
	}
	mode, ok := types.NormalizePermissionMode(trimmed)
	if !ok {
		return "", false, fmt.Errorf("invalid permission_mode %q", raw)
	}
	return mode, true, nil
}
