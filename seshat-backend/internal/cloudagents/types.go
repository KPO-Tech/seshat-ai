// Package cloudagents fetches an organization's shared agent-preset catalog
// from seshat-server, to enrich seshat-backend's own local agent resolution
// (internal/agents.Service). Like internal/cloudskillregistry, this is
// purely additive — the local agent_definitions table and the SDK's
// built-in registry stay authoritative; the org catalog is one more source
// resolved at query time, never a Provider that replaces anything (see
// helps/seshat-architecture-target.md §7, "Agents registry").
package cloudagents

// AgentPreset mirrors seshat-server's agentregistry.AgentPreset.
type AgentPreset struct {
	Slug            string   `json:"slug"`
	Name            string   `json:"name"`
	WhenToUse       string   `json:"when_to_use"`
	SystemPrompt    string   `json:"system_prompt"`
	Model           string   `json:"model,omitempty"`
	Tools           []string `json:"tools,omitempty"`
	DisallowedTools []string `json:"disallowed_tools,omitempty"`
	MaxTurns        int      `json:"max_turns"`
	PermissionMode  string   `json:"permission_mode,omitempty"`
	Isolation       string   `json:"isolation,omitempty"`
	McpServers      []string `json:"mcp_servers,omitempty"`
	Icon            string   `json:"icon,omitempty"`
	Enabled         bool     `json:"enabled"`
}

type listResponse struct {
	AgentPresets []AgentPreset `json:"agent_presets"`
}
