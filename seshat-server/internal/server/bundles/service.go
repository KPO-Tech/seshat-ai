package bundles

import (
	"context"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/agentregistry"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/hookregistry"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mcpregistry"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/skillregistry"
)

// Service orchestrates export/import across the four existing registries -
// it deliberately holds no data of its own beyond BundleImport/
// BundleImportItem (see db.BundleImport's doc comment); every actual
// resource still lives in, and is still gated by, its own registry.
type Service struct {
	db     *sdb.DB
	iam    *iam.Service
	skills *skillregistry.Service
	mcp    *mcpregistry.Service
	agents *agentregistry.Service
	hooks  *hookregistry.Service
}

func New(database *sdb.DB, iamService *iam.Service, skills *skillregistry.Service, mcp *mcpregistry.Service, agents *agentregistry.Service, hooks *hookregistry.Service) *Service {
	return &Service{db: database, iam: iamService, skills: skills, mcp: mcp, agents: agents, hooks: hooks}
}

// ExportSelection names which existing rows to package into a manifest -
// never "everything," an admin always chooses explicitly what leaves the
// organization in the resulting file.
type ExportSelection struct {
	OrganizationID string
	Name           string
	Description    string
	SkillRepoIDs   []string
	MCPServerIDs   []string
	AgentPresetIDs []string
	HookConfigIDs  []string
}

// Export builds a Manifest from the selected rows. Each registry's own List
// method re-checks the caller's read permission for that category
// (degrading to an empty list rather than erroring on its own) - a
// requested ID that doesn't come back in that list, whether because it
// doesn't exist or because the caller lacks read access to that category,
// is reported explicitly here rather than silently dropped, so an export
// never quietly ships less than what the admin thinks they selected.
func (s *Service) Export(ctx context.Context, principal *iam.Principal, sel ExportSelection) (*Manifest, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(sel.OrganizationID)
	name := strings.TrimSpace(sel.Name)
	if organizationID == "" || name == "" {
		return nil, iam.ErrInvalidInput("organization_id and name are required")
	}

	manifest := &Manifest{Name: name, Description: strings.TrimSpace(sel.Description)}

	if len(sel.MCPServerIDs) > 0 {
		all, err := s.mcp.ListServerConfigs(ctx, principal, organizationID)
		if err != nil {
			return nil, err
		}
		byID := make(map[string]mcpregistry.MCPServerConfig, len(all))
		for _, r := range all {
			byID[r.ID] = r
		}
		for _, id := range sel.MCPServerIDs {
			r, ok := byID[id]
			if !ok {
				return nil, iam.ErrNotFound("mcp server config not found or not accessible: " + id)
			}
			manifest.MCPServers = append(manifest.MCPServers, ManifestMCPServer{
				Name: r.Name, DisplayName: r.DisplayName, ServerType: r.ServerType,
				Command: r.Command, Args: r.Args, URL: r.URL, TimeoutSecs: r.TimeoutSecs, Icon: r.Icon,
			})
		}
	}

	if len(sel.HookConfigIDs) > 0 {
		all, err := s.hooks.ListHookConfigs(ctx, principal, organizationID)
		if err != nil {
			return nil, err
		}
		byID := make(map[string]hookregistry.HookConfig, len(all))
		for _, r := range all {
			byID[r.ID] = r
		}
		for _, id := range sel.HookConfigIDs {
			r, ok := byID[id]
			if !ok {
				return nil, iam.ErrNotFound("hook not found or not accessible: " + id)
			}
			manifest.Hooks = append(manifest.Hooks, ManifestHook{
				Name: r.Name, Matcher: r.Matcher, Command: r.Command, TimeoutSecs: r.TimeoutSecs,
			})
		}
	}

	if len(sel.SkillRepoIDs) > 0 {
		all, err := s.skills.ListSkillRepos(ctx, principal, organizationID)
		if err != nil {
			return nil, err
		}
		byID := make(map[string]skillregistry.SkillRepo, len(all))
		for _, r := range all {
			byID[r.ID] = r
		}
		for _, id := range sel.SkillRepoIDs {
			r, ok := byID[id]
			if !ok {
				return nil, iam.ErrNotFound("skill repo not found or not accessible: " + id)
			}
			manifest.Skills = append(manifest.Skills, ManifestSkillRepo{
				Name: r.Name, URL: r.URL, Description: r.Description,
			})
		}
	}

	if len(sel.AgentPresetIDs) > 0 {
		all, err := s.agents.ListPresets(ctx, principal, organizationID)
		if err != nil {
			return nil, err
		}
		byID := make(map[string]agentregistry.AgentPreset, len(all))
		for _, r := range all {
			byID[r.ID] = r
		}
		for _, id := range sel.AgentPresetIDs {
			r, ok := byID[id]
			if !ok {
				return nil, iam.ErrNotFound("agent preset not found or not accessible: " + id)
			}
			manifest.AgentPresets = append(manifest.AgentPresets, ManifestAgentPreset{
				Slug: r.Slug, Name: r.Name, WhenToUse: r.WhenToUse, SystemPrompt: r.SystemPrompt,
				Model: r.Model, Tools: r.Tools, DisallowedTools: r.DisallowedTools, MaxTurns: r.MaxTurns,
				PermissionMode: r.PermissionMode, Isolation: r.Isolation, McpServers: r.McpServers, Icon: r.Icon,
			})
		}
	}

	if manifest.ItemCount() == 0 {
		return nil, iam.ErrInvalidInput("no items selected for export")
	}
	return manifest, nil
}
