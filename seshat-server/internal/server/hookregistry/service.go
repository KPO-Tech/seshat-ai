// Package hookregistry lets an organization define shared PreToolUse hooks
// once, so every connected seshat-backend device can pick them up instead of
// each user configuring the same shell command locally. Structurally a
// mirror of mcpregistry (CRUD + a resolve endpoint), but desktop-only by
// design - see db.HookConfig's doc comment for why seshat-server's own
// workspacechat never resolves or executes these: the SDK's hook runner has
// no sandboxing, so running an org-configured command inside the shared
// multi-tenant server process would let one organization compromise every
// other organization's data on the same deployment.
//
// Unlike mcpregistry, there is deliberately no platform-default-organization
// fallback here: silently inheriting a shell command an org never configured
// itself is a materially different risk than inheriting an LLM provider
// credential or an MCP server URL, so an org with no hooks of its own simply
// has none, full stop.
package hookregistry

import (
	"context"
	"errors"
	"strings"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// HookConfig never includes anything encrypted - Command is shell source an
// admin explicitly wrote and expects to read back, not a secret like an API
// key (see mcpregistry.MCPServerConfig for the contrast).
type HookConfig struct {
	ID              string `json:"id"`
	OrganizationID  string `json:"organization_id"`
	CreatedByUserID string `json:"created_by_user_id"`
	Name            string `json:"name"`
	Matcher         string `json:"matcher,omitempty"`
	Command         string `json:"command"`
	TimeoutSecs     int    `json:"timeout_secs"`
	Enabled         bool   `json:"enabled"`
}

type Service struct {
	db  *sdb.DB
	iam *iam.Service
}

func New(database *sdb.DB, iamService *iam.Service) *Service {
	return &Service{db: database, iam: iamService}
}

type CreateHookConfigParams struct {
	OrganizationID, Name, Matcher, Command string
	TimeoutSecs                            int
	Enabled                                *bool
}

type UpdateHookConfigParams struct {
	Matcher, Command string
	TimeoutSecs      int
	Enabled          *bool
}

func (s *Service) ListHookConfigs(ctx context.Context, principal *iam.Principal, organizationID string) ([]HookConfig, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, iam.ErrInvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "hooks_registry.read", "hooks_registry.manage", "organization.manage"); err != nil {
			return []HookConfig{}, nil
		}
	}
	var records []sdb.HookConfig
	if err := s.db.Gorm().WithContext(ctx).Where("organization_id = ?", organizationID).Order("name asc").Find(&records).Error; err != nil {
		return nil, err
	}
	out := make([]HookConfig, 0, len(records))
	for _, r := range records {
		out = append(out, toHookConfig(r))
	}
	return out, nil
}

func (s *Service) CreateHookConfig(ctx context.Context, principal *iam.Principal, params CreateHookConfigParams) (*HookConfig, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	name := strings.TrimSpace(params.Name)
	command := strings.TrimSpace(params.Command)
	if organizationID == "" || name == "" || command == "" {
		return nil, iam.ErrInvalidInput("organization_id, name and command are required")
	}
	timeoutSecs := params.TimeoutSecs
	if timeoutSecs <= 0 {
		timeoutSecs = 30
	}
	enabled := true
	if params.Enabled != nil {
		enabled = *params.Enabled
	}

	var record sdb.HookConfig
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "hooks_registry.manage", "organization.manage"); err != nil {
			return err
		}
		var conflicting int64
		if err := tx.Model(&sdb.HookConfig{}).Where("organization_id = ? AND name = ?", organizationID, name).Count(&conflicting).Error; err != nil {
			return err
		}
		if conflicting > 0 {
			return iam.ErrConflict("a hook named " + name + " already exists in this organization; use update instead")
		}
		id, err := sdb.NewID("hookcfg")
		if err != nil {
			return err
		}
		record = sdb.HookConfig{
			ID: id, OrganizationID: organizationID, CreatedByUserID: principal.User.ID,
			Name: name, Matcher: strings.TrimSpace(params.Matcher), Command: command,
			TimeoutSecs: timeoutSecs, Enabled: true,
		}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		// A separate, explicit update when the caller actually asked for
		// Enabled=false: GORM's `gorm:"default:true"` tag on this column
		// makes a plain Create silently drop an explicit Enabled=false
		// (false is bool's zero value) and let the DB apply its column
		// default instead - a real, previously-hit gotcha elsewhere in this
		// codebase (see iam.CreateProvider's own Enabled:&false footgun,
		// documented in the network-diagnostics audit entry). Sidestepped
		// here by always inserting Enabled=true, then flipping it in a
		// second statement that Update (not Create) handles correctly.
		if !enabled {
			if err := tx.Model(&record).Update("enabled", false).Error; err != nil {
				return err
			}
			record.Enabled = false
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "hook_config.created", "hook_config", record.ID, map[string]string{"name": name})
	})
	if err != nil {
		return nil, err
	}
	result := toHookConfig(record)
	return &result, nil
}

func (s *Service) UpdateHookConfig(ctx context.Context, principal *iam.Principal, id string, params UpdateHookConfigParams) (*HookConfig, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	var record sdb.HookConfig
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := tx.First(&record, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return iam.ErrNotFound("hook not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "hooks_registry.manage", "organization.manage"); err != nil {
			return err
		}
		command := strings.TrimSpace(params.Command)
		if command == "" {
			return iam.ErrInvalidInput("command is required")
		}
		timeoutSecs := params.TimeoutSecs
		if timeoutSecs <= 0 {
			timeoutSecs = record.TimeoutSecs
		}
		record.Matcher = strings.TrimSpace(params.Matcher)
		record.Command = command
		record.TimeoutSecs = timeoutSecs
		if params.Enabled != nil {
			record.Enabled = *params.Enabled
		}
		if err := tx.Save(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "hook_config.updated", "hook_config", record.ID, map[string]string{"name": record.Name})
	})
	if err != nil {
		return nil, err
	}
	result := toHookConfig(record)
	return &result, nil
}

func (s *Service) DeleteHookConfig(ctx context.Context, principal *iam.Principal, id string) error {
	if principal == nil {
		return iam.ErrUnauthorized("authentication required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.HookConfig
		if err := tx.First(&record, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return iam.ErrNotFound("hook not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "hooks_registry.manage", "organization.manage"); err != nil {
			return err
		}
		if err := tx.Delete(&sdb.HookConfig{}, "id = ?", id).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "hook_config.deleted", "hook_config", record.ID, map[string]string{"name": record.Name})
	})
}

// ResolveHookConfigs is open to any org member, same trust level as
// mcpregistry.ResolveServerConfigs - a member needs to see every hook their
// org has defined so they can decide, locally on their own device, whether
// to approve it. Only Enabled rows are returned - a disabled hook is not
// "approved but paused," it's simply not offered at all. No
// platform-default fallback (see the package doc comment).
func (s *Service) ResolveHookConfigs(ctx context.Context, principal *iam.Principal, organizationID string) ([]HookConfig, error) {
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
	var records []sdb.HookConfig
	if err := tx.Where("organization_id = ? AND enabled = ?", organizationID, true).Order("name asc").Find(&records).Error; err != nil {
		return nil, err
	}
	out := make([]HookConfig, 0, len(records))
	for _, r := range records {
		out = append(out, toHookConfig(r))
	}
	return out, nil
}

func toHookConfig(r sdb.HookConfig) HookConfig {
	return HookConfig{
		ID: r.ID, OrganizationID: r.OrganizationID, CreatedByUserID: r.CreatedByUserID,
		Name: r.Name, Matcher: r.Matcher, Command: r.Command,
		TimeoutSecs: r.TimeoutSecs, Enabled: r.Enabled,
	}
}
