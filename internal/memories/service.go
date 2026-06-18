package memories

import (
	"context"
	"strings"
	"time"

	longterm "github.com/EngineerProjects/nexus-engine/pkg/memory/longterm"
	"github.com/EngineerProjects/nexus-engine/pkg/types"
	backendauth "github.com/EngineerProjects/nexus_ai/internal/auth"
	"github.com/EngineerProjects/nexus_ai/internal/bkerr"
	"github.com/EngineerProjects/nexus_ai/internal/db"
)

type Service struct {
	userStore     *db.UserMemoryStore
	longTermStore *db.LongTermMemoryStore
	extractor     *longterm.Extractor
}

func NewService(userStore *db.UserMemoryStore, longTermStore *db.LongTermMemoryStore, extractor *longterm.Extractor) *Service {
	return &Service{userStore: userStore, longTermStore: longTermStore, extractor: extractor}
}

func (s *Service) List(ctx context.Context, principal *backendauth.Principal) ([]UserMemory, error) {
	if s == nil || s.userStore == nil {
		return nil, bkerr.Unavailable("memory store not available", nil)
	}
	rows, err := s.userStore.List(ctx, principal.User.ID)
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	out := make([]UserMemory, 0, len(rows))
	for _, m := range rows {
		out = append(out, fromDB(m))
	}
	return out, nil
}

func (s *Service) Create(ctx context.Context, principal *backendauth.Principal, p CreateParams) (*UserMemory, error) {
	if s == nil || s.userStore == nil {
		return nil, bkerr.Unavailable("memory store not available", nil)
	}
	if strings.TrimSpace(p.Key) == "" {
		return nil, bkerr.InvalidInput("key is required", nil)
	}
	if len(p.Key) > 255 {
		return nil, bkerr.InvalidInput("key exceeds maximum length (255 chars)", nil)
	}
	if len(p.Value) > 4096 {
		return nil, bkerr.InvalidInput("value exceeds maximum length (4096 chars)", nil)
	}
	m, err := s.userStore.Create(ctx, db.CreateUserMemoryParams{
		UserID:     principal.User.ID,
		Type:       p.Type,
		Key:        p.Key,
		Value:      p.Value,
		Importance: p.Importance,
		Source:     p.Source,
	})
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	result := fromDB(*m)
	return &result, nil
}

func (s *Service) Update(ctx context.Context, principal *backendauth.Principal, id string, p UpdateParams) (*UserMemory, error) {
	if s == nil || s.userStore == nil {
		return nil, bkerr.Unavailable("memory store not available", nil)
	}
	m, err := s.userStore.Update(ctx, principal.User.ID, id, db.UpdateUserMemoryParams{
		Type:       p.Type,
		Key:        p.Key,
		Value:      p.Value,
		Importance: p.Importance,
		Source:     p.Source,
	})
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return nil, bkerr.NotFound("memory not found", err)
		}
		return nil, bkerr.Internal(err.Error(), err)
	}
	result := fromDB(*m)
	return &result, nil
}

func (s *Service) Delete(ctx context.Context, principal *backendauth.Principal, id string) error {
	if s == nil || s.userStore == nil {
		return bkerr.Unavailable("memory store not available", nil)
	}
	if err := s.userStore.Delete(ctx, principal.User.ID, id); err != nil {
		if strings.Contains(err.Error(), "not found") {
			return bkerr.NotFound("memory not found", err)
		}
		return bkerr.Internal(err.Error(), err)
	}
	return nil
}

func (s *Service) DeleteAll(ctx context.Context, principal *backendauth.Principal) (int64, error) {
	if s == nil || s.userStore == nil {
		return 0, bkerr.Unavailable("memory store not available", nil)
	}
	n, err := s.userStore.DeleteAll(ctx, principal.User.ID)
	if err != nil {
		return 0, bkerr.Internal(err.Error(), err)
	}
	return n, nil
}

func (s *Service) BuildContextBlock(ctx context.Context, principal *backendauth.Principal, prompt string) (string, error) {
	if s == nil || s.longTermStore == nil || principal == nil {
		return "", nil
	}
	const maxTokens = 500
	block, err := s.longTermStore.RetrieveForContext(ctx, principal.User.ID, prompt, maxTokens)
	if err != nil {
		return "", nil
	}
	return block, nil
}

func (s *Service) TriggerExtraction(principal *backendauth.Principal, messages []types.Message) {
	if s == nil || s.extractor == nil || principal == nil || len(messages) == 0 {
		return
	}
	userID := principal.User.ID
	msgs := messages
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		_ = s.extractor.Extract(ctx, userID, msgs)
	}()
}

func fromDB(m db.UserMemory) UserMemory {
	return UserMemory{
		ID:         m.ID,
		UserID:     m.UserID,
		Type:       m.Type,
		Key:        m.Key,
		Value:      m.Value,
		Importance: m.Importance,
		Source:     m.Source,
		CreatedAt:  m.CreatedAt,
		UpdatedAt:  m.UpdatedAt,
	}
}
