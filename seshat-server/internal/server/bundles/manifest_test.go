package bundles

import (
	"encoding/json"
	"testing"
)

func TestManifestJSONRoundTrip(t *testing.T) {
	original := Manifest{
		Name:        "Jira Integration",
		Description: "MCP server + agent preset + hook for internal Jira",
		MCPServers: []ManifestMCPServer{
			{Name: "jira", ServerType: "http", URL: "https://jira.example.com/mcp", TimeoutSecs: 30},
		},
		Hooks: []ManifestHook{
			{Name: "block-rm", Matcher: "bash", Command: "exit 0", TimeoutSecs: 30},
		},
		Skills: []ManifestSkillRepo{
			{Name: "jira-helpers", URL: "https://github.com/example/jira-helpers", Description: "Jira workflow skills"},
		},
		AgentPresets: []ManifestAgentPreset{
			{Slug: "jira-triage", Name: "Jira Triage", SystemPrompt: "You triage Jira tickets.", McpServers: []string{"jira"}},
		},
	}

	raw, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var decoded Manifest
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded.Name != original.Name || decoded.ItemCount() != original.ItemCount() {
		t.Fatalf("round trip mismatch: got %+v, want %+v", decoded, original)
	}
	if len(decoded.MCPServers) != 1 || decoded.MCPServers[0].URL != "https://jira.example.com/mcp" {
		t.Fatalf("mcp server round trip mismatch: %+v", decoded.MCPServers)
	}
	if len(decoded.AgentPresets) != 1 || decoded.AgentPresets[0].McpServers[0] != "jira" {
		t.Fatalf("agent preset round trip mismatch: %+v", decoded.AgentPresets)
	}
}

// TestManifestJSONNeverContainsSecretFieldNames guards the deliberate
// omission of Env/Headers from ManifestMCPServer at the wire level, not
// just by code review - if someone ever adds those fields back to the
// struct, this test fails loudly instead of silently starting to leak
// encrypted secrets into exported files.
func TestManifestJSONNeverContainsSecretFieldNames(t *testing.T) {
	m := Manifest{
		Name:       "test",
		MCPServers: []ManifestMCPServer{{Name: "x", ServerType: "http", URL: "https://example.com"}},
	}
	raw, err := json.Marshal(m)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var generic map[string]any
	if err := json.Unmarshal(raw, &generic); err != nil {
		t.Fatalf("unmarshal to generic map: %v", err)
	}
	servers, _ := generic["mcp_servers"].([]any)
	if len(servers) != 1 {
		t.Fatalf("expected exactly one mcp server in the encoded output, got %+v", generic)
	}
	server, _ := servers[0].(map[string]any)
	for _, forbidden := range []string{"env", "headers", "connector_kind"} {
		if _, present := server[forbidden]; present {
			t.Fatalf("manifest JSON must never contain %q - found it in %+v", forbidden, server)
		}
	}
}

func TestManifestValidateRejectsEmptyName(t *testing.T) {
	m := Manifest{Skills: []ManifestSkillRepo{{Name: "x", URL: "https://example.com"}}}
	if err := m.Validate(); err == nil {
		t.Fatal("expected an error for an empty manifest name")
	}
}

func TestManifestValidateRejectsEmptyManifest(t *testing.T) {
	m := Manifest{Name: "Empty"}
	if err := m.Validate(); err == nil {
		t.Fatal("expected an error for a manifest with no items")
	}
}

func TestManifestValidateAcceptsAWellFormedManifest(t *testing.T) {
	m := Manifest{
		Name:   "Valid",
		Skills: []ManifestSkillRepo{{Name: "x", URL: "https://example.com"}},
	}
	if err := m.Validate(); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
}

func TestManifestValidateRejectsHookWithoutCommand(t *testing.T) {
	m := Manifest{Name: "Valid", Hooks: []ManifestHook{{Name: "x"}}}
	if err := m.Validate(); err == nil {
		t.Fatal("expected an error for a hook with no command")
	}
}

func TestManifestValidateRejectsSkillWithoutURL(t *testing.T) {
	m := Manifest{Name: "Valid", Skills: []ManifestSkillRepo{{Name: "x"}}}
	if err := m.Validate(); err == nil {
		t.Fatal("expected an error for a skill with no url")
	}
}

func TestManifestValidateRejectsAgentPresetWithoutSystemPrompt(t *testing.T) {
	m := Manifest{Name: "Valid", AgentPresets: []ManifestAgentPreset{{Slug: "x"}}}
	if err := m.Validate(); err == nil {
		t.Fatal("expected an error for an agent preset with no system_prompt")
	}
}

func TestManifestValidateRejectsMCPServerWithoutName(t *testing.T) {
	m := Manifest{Name: "Valid", MCPServers: []ManifestMCPServer{{URL: "https://example.com"}}}
	if err := m.Validate(); err == nil {
		t.Fatal("expected an error for an mcp server with no name")
	}
}
