package agents

import (
	"context"
	"strings"

	pkgagent "github.com/EngineerProjects/nexus-engine/pkg/agent"
	"github.com/EngineerProjects/nexus-engine/pkg/types"
	"github.com/EngineerProjects/nexus_ai/internal/bkerr"
	"github.com/EngineerProjects/nexus_ai/internal/db"
)

// Service manages user-defined agent definitions.
type Service struct {
	store *db.AgentDefinitionStore
}

func NewService(store *db.AgentDefinitionStore) *Service {
	return &Service{store: store}
}

func (s *Service) List(ctx context.Context) ([]Agent, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("agent store not available", nil)
	}
	rows, err := s.store.List(ctx)
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	out := make([]Agent, 0, len(rows))
	for _, r := range rows {
		out = append(out, fromDB(r))
	}
	return out, nil
}

func (s *Service) GetBySlug(ctx context.Context, slug string) (*Agent, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("agent store not available", nil)
	}
	row, err := s.store.GetBySlug(ctx, strings.TrimSpace(slug))
	if err != nil {
		if strings.Contains(err.Error(), "not found") || strings.Contains(err.Error(), "record not found") {
			return nil, bkerr.NotFound("agent not found", err)
		}
		return nil, bkerr.Internal(err.Error(), err)
	}
	a := fromDB(*row)
	return &a, nil
}

func (s *Service) GetByID(ctx context.Context, id string) (*Agent, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("agent store not available", nil)
	}
	row, err := s.store.GetByID(ctx, strings.TrimSpace(id))
	if err != nil {
		if strings.Contains(err.Error(), "not found") || strings.Contains(err.Error(), "record not found") {
			return nil, bkerr.NotFound("agent not found", err)
		}
		return nil, bkerr.Internal(err.Error(), err)
	}
	a := fromDB(*row)
	return &a, nil
}

func (s *Service) Create(ctx context.Context, p CreateParams) (*Agent, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("agent store not available", nil)
	}
	slug := strings.TrimSpace(p.Slug)
	if slug == "" {
		return nil, bkerr.InvalidInput("slug is required", nil)
	}
	if !isValidSlug(slug) {
		return nil, bkerr.InvalidInput("slug must be lowercase letters, digits, and hyphens only", nil)
	}
	maxTurns := p.MaxTurns
	if maxTurns <= 0 {
		maxTurns = 50
	}
	created, err := s.store.Create(ctx, db.CreateAgentDefinitionParams{
		Slug:            slug,
		Name:            strings.TrimSpace(p.Name),
		WhenToUse:       p.WhenToUse,
		SystemPrompt:    p.SystemPrompt,
		Model:           strings.TrimSpace(p.Model),
		Tools:           p.Tools,
		DisallowedTools: p.DisallowedTools,
		MaxTurns:        maxTurns,
		PermissionMode:  strings.TrimSpace(p.PermissionMode),
		Isolation:       strings.TrimSpace(p.Isolation),
		McpServers:      p.McpServers,
		Icon:            strings.TrimSpace(p.Icon),
		Enabled:         p.Enabled,
	})
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") || strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			return nil, bkerr.InvalidInput("an agent with this slug already exists", err)
		}
		return nil, bkerr.Internal(err.Error(), err)
	}
	a := fromDB(*created)
	return &a, nil
}

func (s *Service) Update(ctx context.Context, id string, p UpdateParams) (*Agent, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("agent store not available", nil)
	}
	if p.MaxTurns != nil && *p.MaxTurns <= 0 {
		zero := 50
		p.MaxTurns = &zero
	}
	updated, err := s.store.Update(ctx, id, db.UpdateAgentDefinitionParams{
		Name:            p.Name,
		WhenToUse:       p.WhenToUse,
		SystemPrompt:    p.SystemPrompt,
		Model:           p.Model,
		Tools:           p.Tools,
		DisallowedTools: p.DisallowedTools,
		MaxTurns:        p.MaxTurns,
		PermissionMode:  p.PermissionMode,
		Isolation:       p.Isolation,
		McpServers:      p.McpServers,
		Icon:            p.Icon,
		Enabled:         p.Enabled,
	})
	if err != nil {
		if strings.Contains(err.Error(), "not found") || strings.Contains(err.Error(), "record not found") {
			return nil, bkerr.NotFound("agent not found", err)
		}
		return nil, bkerr.Internal(err.Error(), err)
	}
	a := fromDB(*updated)
	return &a, nil
}

func (s *Service) Delete(ctx context.Context, id string) error {
	if s == nil || s.store == nil {
		return bkerr.Unavailable("agent store not available", nil)
	}
	if err := s.store.Delete(ctx, id); err != nil {
		if strings.Contains(err.Error(), "not found") || strings.Contains(err.Error(), "record not found") {
			return bkerr.NotFound("agent not found", err)
		}
		return bkerr.Internal(err.Error(), err)
	}
	return nil
}

// GetDefinition returns an SDK AgentDefinition for the given slug.
// It checks the DB first, then falls back to the SDK built-in registry.
// Returns (nil, false) when the slug is unknown in both sources.
func (s *Service) GetDefinition(ctx context.Context, slug string) (*pkgagent.AgentDefinition, bool) {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return nil, false
	}

	// Check DB-stored custom agents first.
	if s != nil && s.store != nil {
		row, err := s.store.GetBySlug(ctx, slug)
		if err == nil && row != nil && row.Enabled {
			return toSDKDefinition(fromDB(*row)), true
		}
	}

	// Fall back to the SDK built-in registry.
	reg := pkgagent.NewAgentRegistry()
	if def, ok := reg.Get(slug); ok {
		return def, true
	}
	return nil, false
}

// ─── SDK conversion ───────────────────────────────────────────────────────────

// toSDKDefinition converts a domain Agent to an SDK AgentDefinition that the
// query runtime can use directly.
func toSDKDefinition(a Agent) *pkgagent.AgentDefinition {
	prompt := a.SystemPrompt
	return &pkgagent.AgentDefinition{
		AgentType:       a.Slug,
		WhenToUse:       a.WhenToUse,
		Source:          "user",
		Model:           a.Model,
		Tools:           a.Tools,
		DisallowedTools: a.DisallowedTools,
		MaxTurns:        a.MaxTurns,
		PermissionMode:  types.PermissionMode(a.PermissionMode),
		Isolation:       a.Isolation,
		McpServers:      a.McpServers,
		GetSystemPrompt: func() string { return prompt },
	}
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func fromDB(r db.AgentDefinition) Agent {
	return Agent{
		ID:              r.ID,
		Slug:            r.Slug,
		Name:            r.Name,
		WhenToUse:       r.WhenToUse,
		SystemPrompt:    r.SystemPrompt,
		Model:           r.Model,
		Tools:           r.Tools,
		DisallowedTools: r.DisallowedTools,
		MaxTurns:        r.MaxTurns,
		PermissionMode:  r.PermissionMode,
		Isolation:       r.Isolation,
		McpServers:      r.McpServers,
		Icon:            r.Icon,
		Enabled:         r.Enabled,
		Source:          "user",
		CreatedAt:       r.CreatedAt,
		UpdatedAt:       r.UpdatedAt,
	}
}

func isValidSlug(s string) bool {
	if len(s) == 0 || len(s) > 64 {
		return false
	}
	for _, c := range s {
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-') {
			return false
		}
	}
	return true
}
