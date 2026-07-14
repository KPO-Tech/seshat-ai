// Package agentregistry is an organization's shared catalog of agent
// presets (system prompt, model, permission mode, tools) — the server-hosted
// half of the "Agents registry" domain described in
// helps/seshat-architecture-target.md §7. This is purely additive: it never
// replaces seshat-backend's existing local agent_definitions table (which
// stays 100% unscoped, a preexisting and orthogonal issue), it just gives a
// connected seshat-backend one more source of presets, resolved at query
// time alongside the local DB and the SDK's built-in registry.
package agentregistry

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// AgentPreset is never secret (a system prompt, not a credential) — same
// trust level as SkillRepo, so unlike MCPServerConfig there is no separate
// "resolved" shape with decrypted fields.
type AgentPreset struct {
	ID              string    `json:"id"`
	OrganizationID  string    `json:"organization_id"`
	CreatedByUserID string    `json:"created_by_user_id"`
	Slug            string    `json:"slug"`
	Name            string    `json:"name"`
	WhenToUse       string    `json:"when_to_use"`
	SystemPrompt    string    `json:"system_prompt"`
	Model           string    `json:"model,omitempty"`
	Tools           []string  `json:"tools,omitempty"`
	DisallowedTools []string  `json:"disallowed_tools,omitempty"`
	MaxTurns        int       `json:"max_turns"`
	PermissionMode  string    `json:"permission_mode,omitempty"`
	Isolation       string    `json:"isolation,omitempty"`
	McpServers      []string  `json:"mcp_servers,omitempty"`
	Icon            string    `json:"icon,omitempty"`
	Enabled         bool      `json:"enabled"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type CreatePresetParams struct {
	OrganizationID  string
	Slug            string
	Name            string
	WhenToUse       string
	SystemPrompt    string
	Model           string
	Tools           []string
	DisallowedTools []string
	MaxTurns        int
	PermissionMode  string
	Isolation       string
	McpServers      []string
	Icon            string
	Enabled         *bool
}

type UpdatePresetParams struct {
	Name            *string
	WhenToUse       *string
	SystemPrompt    *string
	Model           *string
	Tools           []string
	DisallowedTools []string
	MaxTurns        *int
	PermissionMode  *string
	Isolation       *string
	McpServers      []string
	Icon            *string
	Enabled         *bool
}

type Service struct {
	db  *sdb.DB
	iam *iam.Service
}

func New(database *sdb.DB, iamService *iam.Service) *Service {
	return &Service{db: database, iam: iamService}
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

// ListPresets requires only org membership, not a specific permission — a
// preset's system prompt is not a secret, same reasoning as
// skillregistry.ListSkillRepos.
func (s *Service) ListPresets(ctx context.Context, principal *iam.Principal, organizationID string) ([]AgentPreset, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, iam.ErrInvalidInput("organization_id is required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	allowed, err := s.iam.CanAccessOrganization(tx, principal, organizationID)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, iam.ErrForbidden("not a member of this organization")
	}
	var records []sdb.AgentPreset
	if err := tx.Where("organization_id = ?", organizationID).Order("slug asc").Find(&records).Error; err != nil {
		return nil, err
	}
	out := make([]AgentPreset, 0, len(records))
	for _, r := range records {
		preset, err := toAgentPreset(r)
		if err != nil {
			return nil, err
		}
		out = append(out, preset)
	}
	return out, nil
}

func (s *Service) CreatePreset(ctx context.Context, principal *iam.Principal, params CreatePresetParams) (*AgentPreset, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	slug := strings.TrimSpace(params.Slug)
	if organizationID == "" || slug == "" {
		return nil, iam.ErrInvalidInput("organization_id and slug are required")
	}
	if !isValidSlug(slug) {
		return nil, iam.ErrInvalidInput("slug must be lowercase letters, digits, and hyphens only")
	}
	maxTurns := params.MaxTurns
	if maxTurns <= 0 {
		maxTurns = 50
	}
	icon := strings.TrimSpace(params.Icon)
	if icon == "" {
		icon = "🤖"
	}
	enabled := true
	if params.Enabled != nil {
		enabled = *params.Enabled
	}
	toolsJSON, err := json.Marshal(sdb.NonNilStrings(params.Tools))
	if err != nil {
		return nil, err
	}
	disallowedJSON, err := json.Marshal(sdb.NonNilStrings(params.DisallowedTools))
	if err != nil {
		return nil, err
	}
	mcpServersJSON, err := json.Marshal(sdb.NonNilStrings(params.McpServers))
	if err != nil {
		return nil, err
	}

	var record sdb.AgentPreset
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "agents_registry.manage", "organization.manage"); err != nil {
			return err
		}
		var conflicting int64
		if err := tx.Model(&sdb.AgentPreset{}).Where("organization_id = ? AND slug = ?", organizationID, slug).Count(&conflicting).Error; err != nil {
			return err
		}
		if conflicting > 0 {
			return iam.ErrConflict("an agent preset with this slug already exists in this organization")
		}
		id, err := sdb.NewID("agentpreset")
		if err != nil {
			return err
		}
		record = sdb.AgentPreset{
			ID:                  id,
			OrganizationID:      organizationID,
			CreatedByUserID:     principal.User.ID,
			Slug:                slug,
			Name:                strings.TrimSpace(params.Name),
			WhenToUse:           params.WhenToUse,
			SystemPrompt:        params.SystemPrompt,
			Model:               strings.TrimSpace(params.Model),
			ToolsJSON:           string(toolsJSON),
			DisallowedToolsJSON: string(disallowedJSON),
			MaxTurns:            maxTurns,
			PermissionMode:      strings.TrimSpace(params.PermissionMode),
			Isolation:           strings.TrimSpace(params.Isolation),
			McpServersJSON:      string(mcpServersJSON),
			Icon:                icon,
			Enabled:             enabled,
		}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "agent_preset.created", "agent_preset", record.ID, map[string]string{"slug": slug})
	})
	if err != nil {
		return nil, err
	}
	result, err := toAgentPreset(record)
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *Service) UpdatePreset(ctx context.Context, principal *iam.Principal, id string, params UpdatePresetParams) (*AgentPreset, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	var record sdb.AgentPreset
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := tx.First(&record, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return iam.ErrNotFound("agent preset not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "agents_registry.manage", "organization.manage"); err != nil {
			return err
		}
		if params.Name != nil {
			record.Name = strings.TrimSpace(*params.Name)
		}
		if params.WhenToUse != nil {
			record.WhenToUse = *params.WhenToUse
		}
		if params.SystemPrompt != nil {
			record.SystemPrompt = *params.SystemPrompt
		}
		if params.Model != nil {
			record.Model = strings.TrimSpace(*params.Model)
		}
		if params.Tools != nil {
			toolsJSON, err := json.Marshal(sdb.NonNilStrings(params.Tools))
			if err != nil {
				return err
			}
			record.ToolsJSON = string(toolsJSON)
		}
		if params.DisallowedTools != nil {
			disallowedJSON, err := json.Marshal(sdb.NonNilStrings(params.DisallowedTools))
			if err != nil {
				return err
			}
			record.DisallowedToolsJSON = string(disallowedJSON)
		}
		if params.MaxTurns != nil && *params.MaxTurns > 0 {
			record.MaxTurns = *params.MaxTurns
		}
		if params.PermissionMode != nil {
			record.PermissionMode = strings.TrimSpace(*params.PermissionMode)
		}
		if params.Isolation != nil {
			record.Isolation = strings.TrimSpace(*params.Isolation)
		}
		if params.McpServers != nil {
			mcpServersJSON, err := json.Marshal(sdb.NonNilStrings(params.McpServers))
			if err != nil {
				return err
			}
			record.McpServersJSON = string(mcpServersJSON)
		}
		if params.Icon != nil {
			record.Icon = strings.TrimSpace(*params.Icon)
		}
		if params.Enabled != nil {
			record.Enabled = *params.Enabled
		}
		if err := tx.Save(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "agent_preset.updated", "agent_preset", record.ID, map[string]string{"slug": record.Slug})
	})
	if err != nil {
		return nil, err
	}
	result, err := toAgentPreset(record)
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *Service) DeletePreset(ctx context.Context, principal *iam.Principal, id string) error {
	if principal == nil {
		return iam.ErrUnauthorized("authentication required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.AgentPreset
		if err := tx.First(&record, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return iam.ErrNotFound("agent preset not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "agents_registry.manage", "organization.manage"); err != nil {
			return err
		}
		if err := tx.Delete(&sdb.AgentPreset{}, "id = ?", id).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "agent_preset.deleted", "agent_preset", record.ID, map[string]string{"slug": record.Slug})
	})
}

func toAgentPreset(r sdb.AgentPreset) (AgentPreset, error) {
	var tools, disallowed, mcpServers []string
	if err := json.Unmarshal([]byte(r.ToolsJSON), &tools); err != nil {
		return AgentPreset{}, err
	}
	if err := json.Unmarshal([]byte(r.DisallowedToolsJSON), &disallowed); err != nil {
		return AgentPreset{}, err
	}
	if err := json.Unmarshal([]byte(r.McpServersJSON), &mcpServers); err != nil {
		return AgentPreset{}, err
	}
	return AgentPreset{
		ID:              r.ID,
		OrganizationID:  r.OrganizationID,
		CreatedByUserID: r.CreatedByUserID,
		Slug:            r.Slug,
		Name:            r.Name,
		WhenToUse:       r.WhenToUse,
		SystemPrompt:    r.SystemPrompt,
		Model:           r.Model,
		Tools:           tools,
		DisallowedTools: disallowed,
		MaxTurns:        r.MaxTurns,
		PermissionMode:  r.PermissionMode,
		Isolation:       r.Isolation,
		McpServers:      mcpServers,
		Icon:            r.Icon,
		Enabled:         r.Enabled,
		CreatedAt:       r.CreatedAt,
		UpdatedAt:       r.UpdatedAt,
	}, nil
}
