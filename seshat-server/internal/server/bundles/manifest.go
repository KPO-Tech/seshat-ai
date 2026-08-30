// Package bundles lets an admin export a chosen selection of skill repos,
// MCP server configs, agent presets and hooks from their organization into
// one portable JSON manifest, and import that manifest into another
// organization (or the same one, later) in one action - see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 7. There is no
// hosted marketplace/catalog here (no CDN, no public registry, no
// moderation exists for this product) - a bundle is a file an admin
// downloads and hands to another admin, not something browsed online.
//
// A manifest item is always the resource's own definition fields, never a
// database ID - an ID is only ever meaningful inside the organization that
// created it. Every created row is tagged via BundleImport/BundleImportItem
// (see db.BundleImport's doc comment) for later traceability ("this came
// from bundle X") and removal as one unit, without adding a bundle_id
// column to any of the four registry tables themselves.
package bundles

import (
	"fmt"
	"strings"
)

// Manifest is the portable, exported/imported unit. Field order here also
// controls import order - hooks and MCP servers are imported before agent
// presets deliberately, since AgentPreset.McpServers references MCP server
// names by convention (not a foreign key, but importing an agent preset
// before the servers it names exist would leave a dangling reference with
// no error to catch it).
type Manifest struct {
	Name         string                `json:"name"`
	Description  string                `json:"description,omitempty"`
	MCPServers   []ManifestMCPServer   `json:"mcp_servers,omitempty"`
	Hooks        []ManifestHook        `json:"hooks,omitempty"`
	Skills       []ManifestSkillRepo   `json:"skills,omitempty"`
	AgentPresets []ManifestAgentPreset `json:"agent_presets,omitempty"`
}

// ManifestSkillRepo mirrors skillregistry.CreateSkillRepoParams, minus
// OrganizationID.
type ManifestSkillRepo struct {
	Name        string `json:"name"`
	URL         string `json:"url"`
	Description string `json:"description,omitempty"`
}

// ManifestMCPServer mirrors mcpregistry.CreateServerConfigParams, minus
// OrganizationID and - deliberately - Env/Headers. Those are encrypted
// secrets (API keys, bearer tokens); a bundle manifest is a portable file
// that leaves the organization's control once exported, so it must never
// carry cleartext credentials. The imported server is created with empty
// Env/Headers - the receiving admin fills them in afterward, same
// disclosed limitation a shared "here's my MCP config" screenshot would
// have anyway. ConnectorKind is also omitted: it names a specific org's own
// OAuth-linked connector accounts, meaningless in a different organization.
type ManifestMCPServer struct {
	Name        string   `json:"name"`
	DisplayName string   `json:"display_name,omitempty"`
	ServerType  string   `json:"server_type,omitempty"`
	Command     string   `json:"command,omitempty"`
	Args        []string `json:"args,omitempty"`
	URL         string   `json:"url,omitempty"`
	TimeoutSecs int      `json:"timeout_secs,omitempty"`
	Icon        string   `json:"icon,omitempty"`
}

// ManifestHook mirrors hookregistry.CreateHookConfigParams, minus
// OrganizationID. Command is exported in full - unlike MCP's Env/Headers,
// a hook's command is authored source code the admin wrote to be read, not
// a secret (see hookregistry.HookConfig's own doc comment on this
// distinction).
type ManifestHook struct {
	Name        string `json:"name"`
	Matcher     string `json:"matcher,omitempty"`
	Command     string `json:"command"`
	TimeoutSecs int    `json:"timeout_secs,omitempty"`
}

// ManifestAgentPreset mirrors agentregistry.CreatePresetParams, minus
// OrganizationID. No secrets here - nothing omitted.
type ManifestAgentPreset struct {
	Slug            string   `json:"slug"`
	Name            string   `json:"name"`
	WhenToUse       string   `json:"when_to_use,omitempty"`
	SystemPrompt    string   `json:"system_prompt"`
	Model           string   `json:"model,omitempty"`
	Tools           []string `json:"tools,omitempty"`
	DisallowedTools []string `json:"disallowed_tools,omitempty"`
	MaxTurns        int      `json:"max_turns,omitempty"`
	PermissionMode  string   `json:"permission_mode,omitempty"`
	Isolation       string   `json:"isolation,omitempty"`
	McpServers      []string `json:"mcp_servers,omitempty"`
	Icon            string   `json:"icon,omitempty"`
}

// ItemCount is the total number of items across all four categories -
// used to reject an empty manifest and to size progress/result reporting.
func (m Manifest) ItemCount() int {
	return len(m.MCPServers) + len(m.Hooks) + len(m.Skills) + len(m.AgentPresets)
}

// Validate checks structural correctness only (required fields, no empty
// names) - it has no access to a principal or the database, so it cannot
// check permissions or name conflicts; see bundles.Service.Import for the
// preflight that does. Never mutates m.
func (m Manifest) Validate() error {
	if strings.TrimSpace(m.Name) == "" {
		return fmt.Errorf("manifest name is required")
	}
	if m.ItemCount() == 0 {
		return fmt.Errorf("manifest has no items - nothing to import")
	}
	for i, s := range m.MCPServers {
		if strings.TrimSpace(s.Name) == "" {
			return fmt.Errorf("mcp_servers[%d]: name is required", i)
		}
	}
	for i, h := range m.Hooks {
		if strings.TrimSpace(h.Name) == "" {
			return fmt.Errorf("hooks[%d]: name is required", i)
		}
		if strings.TrimSpace(h.Command) == "" {
			return fmt.Errorf("hooks[%d] (%s): command is required", i, h.Name)
		}
	}
	for i, s := range m.Skills {
		if strings.TrimSpace(s.Name) == "" {
			return fmt.Errorf("skills[%d]: name is required", i)
		}
		if strings.TrimSpace(s.URL) == "" {
			return fmt.Errorf("skills[%d] (%s): url is required", i, s.Name)
		}
	}
	for i, p := range m.AgentPresets {
		if strings.TrimSpace(p.Slug) == "" {
			return fmt.Errorf("agent_presets[%d]: slug is required", i)
		}
		if strings.TrimSpace(p.SystemPrompt) == "" {
			return fmt.Errorf("agent_presets[%d] (%s): system_prompt is required", i, p.Slug)
		}
	}
	return nil
}
