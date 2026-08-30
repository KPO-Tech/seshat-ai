package bundles

import (
	"context"
	"strings"

	"gorm.io/gorm"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/agentregistry"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/hookregistry"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mcpregistry"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/skillregistry"
)

// ImportParams is one import request.
type ImportParams struct {
	OrganizationID string
	Manifest       Manifest
}

// ImportedItem is one row a bundle import actually created.
type ImportedItem struct {
	ResourceType string `json:"resource_type"`
	ResourceID   string `json:"resource_id"`
	Name         string `json:"name"`
}

// ImportItemError is one manifest item that failed to create - reported
// explicitly rather than silently dropped, and never prevents the rest of
// the manifest from being attempted (see Import's own doc comment on why
// this isn't a single all-or-nothing database transaction).
type ImportItemError struct {
	ResourceType string `json:"resource_type"`
	Name         string `json:"name"`
	Error        string `json:"error"`
}

// ImportResult reports exactly what an import did - a caller must never
// have to guess from a generic "ok" whether every item actually landed.
type ImportResult struct {
	BundleImportID string            `json:"bundle_import_id"`
	Created        []ImportedItem    `json:"created"`
	Failed         []ImportItemError `json:"failed"`
}

// Import validates a manifest, preflights permissions for every category it
// actually contains, then creates each item through its own registry's
// existing Create method (so every registry's own validation/uniqueness/
// audit-logging still runs exactly as it would for a manually created row).
//
// Deliberately not one atomic database transaction across all four
// registries: each registry's Create method already opens and commits its
// own transaction internally, and refactoring all four to accept an
// external transaction just for this feature would be a much larger,
// riskier change for a benefit that rarely matters in practice - the
// preflight below already turns the common failure mode (missing
// permission on one of the categories present) into a clean, total
// rejection before anything is created. What preflighting can't catch is a
// naming conflict discovered only at creation time (e.g. an item with the
// same name already exists); when that happens the item is skipped and
// reported in ImportResult.Failed, while every other item in the manifest
// still gets created and tagged normally - a partial result the caller can
// see and act on, never a silent partial import.
func (s *Service) Import(ctx context.Context, principal *iam.Principal, params ImportParams) (*ImportResult, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	if organizationID == "" {
		return nil, iam.ErrInvalidInput("organization_id is required")
	}
	manifest := params.Manifest
	if err := manifest.Validate(); err != nil {
		return nil, iam.ErrInvalidInput(err.Error())
	}

	tx := s.db.Gorm().WithContext(ctx)
	if len(manifest.MCPServers) > 0 {
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "mcp_registry.manage", "organization.manage"); err != nil {
			return nil, err
		}
	}
	if len(manifest.Hooks) > 0 {
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "hooks_registry.manage", "organization.manage"); err != nil {
			return nil, err
		}
	}
	if len(manifest.Skills) > 0 {
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "skills_registry.manage", "organization.manage"); err != nil {
			return nil, err
		}
	}
	if len(manifest.AgentPresets) > 0 {
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "agents_registry.manage", "organization.manage"); err != nil {
			return nil, err
		}
	}

	bundleImportID, err := sdb.NewID("bimp")
	if err != nil {
		return nil, err
	}
	result := &ImportResult{BundleImportID: bundleImportID}

	// Order matches Manifest's own field order/doc comment: MCP servers and
	// hooks before agent presets, since AgentPreset.McpServers references
	// MCP server names by convention.
	for _, m := range manifest.MCPServers {
		created, err := s.mcp.CreateServerConfig(ctx, principal, mcpregistry.CreateServerConfigParams{
			OrganizationID: organizationID, Name: m.Name, DisplayName: m.DisplayName, ServerType: m.ServerType,
			Command: m.Command, Args: m.Args, URL: m.URL, TimeoutSecs: m.TimeoutSecs, Icon: m.Icon,
		})
		if err != nil {
			result.Failed = append(result.Failed, ImportItemError{ResourceType: "mcp_server_config", Name: m.Name, Error: err.Error()})
			continue
		}
		result.Created = append(result.Created, ImportedItem{ResourceType: "mcp_server_config", ResourceID: created.ID, Name: created.Name})
	}

	for _, h := range manifest.Hooks {
		created, err := s.hooks.CreateHookConfig(ctx, principal, hookregistry.CreateHookConfigParams{
			OrganizationID: organizationID, Name: h.Name, Matcher: h.Matcher, Command: h.Command, TimeoutSecs: h.TimeoutSecs,
		})
		if err != nil {
			result.Failed = append(result.Failed, ImportItemError{ResourceType: "hook_config", Name: h.Name, Error: err.Error()})
			continue
		}
		result.Created = append(result.Created, ImportedItem{ResourceType: "hook_config", ResourceID: created.ID, Name: created.Name})
	}

	for _, sk := range manifest.Skills {
		created, err := s.skills.CreateSkillRepo(ctx, principal, skillregistry.CreateSkillRepoParams{
			OrganizationID: organizationID, Name: sk.Name, URL: sk.URL, Description: sk.Description,
		})
		if err != nil {
			result.Failed = append(result.Failed, ImportItemError{ResourceType: "skill_repo", Name: sk.Name, Error: err.Error()})
			continue
		}
		result.Created = append(result.Created, ImportedItem{ResourceType: "skill_repo", ResourceID: created.ID, Name: created.Name})
	}

	for _, p := range manifest.AgentPresets {
		created, err := s.agents.CreatePreset(ctx, principal, agentregistry.CreatePresetParams{
			OrganizationID: organizationID, Slug: p.Slug, Name: p.Name, WhenToUse: p.WhenToUse, SystemPrompt: p.SystemPrompt,
			Model: p.Model, Tools: p.Tools, DisallowedTools: p.DisallowedTools, MaxTurns: p.MaxTurns,
			PermissionMode: p.PermissionMode, Isolation: p.Isolation, McpServers: p.McpServers, Icon: p.Icon,
		})
		if err != nil {
			result.Failed = append(result.Failed, ImportItemError{ResourceType: "agent_preset", Name: p.Name, Error: err.Error()})
			continue
		}
		result.Created = append(result.Created, ImportedItem{ResourceType: "agent_preset", ResourceID: created.ID, Name: created.Name})
	}

	if len(result.Created) == 0 {
		// Nothing landed at all - don't leave an empty BundleImport header
		// behind with no items to ever tag it with.
		return result, nil
	}

	err = s.db.Transaction(func(gtx *gorm.DB) error {
		gtx = gtx.WithContext(ctx)
		record := sdb.BundleImport{
			ID: bundleImportID, OrganizationID: organizationID,
			BundleName: manifest.Name, ImportedByUserID: principal.User.ID,
		}
		if err := gtx.Create(&record).Error; err != nil {
			return err
		}
		items := make([]sdb.BundleImportItem, 0, len(result.Created))
		for _, c := range result.Created {
			itemID, err := sdb.NewID("bimpi")
			if err != nil {
				return err
			}
			items = append(items, sdb.BundleImportItem{
				ID: itemID, BundleImportID: bundleImportID, OrganizationID: organizationID,
				ResourceType: c.ResourceType, ResourceID: c.ResourceID,
			})
		}
		return gtx.Create(&items).Error
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
