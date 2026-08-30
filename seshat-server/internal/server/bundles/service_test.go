package bundles

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/agentregistry"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/hookregistry"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mcpregistry"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/skillregistry"
)

const (
	testEncryptionEnvVar = "SESHAT_SERVER_ENCRYPTION_KEY"
	testEncryptionKey    = "g/t9EsDxTTJSTu6Q+Kne06PBHoGmhH3yAJaEuHmFl9A="
)

type testEnv struct {
	svc            *Service
	skills         *skillregistry.Service
	mcp            *mcpregistry.Service
	agents         *agentregistry.Service
	hooks          *hookregistry.Service
	iam            *iam.Service
	adminPrincipal *iam.Principal
	orgID          string
}

func newTestEnv(t *testing.T) testEnv {
	t.Helper()
	database, err := sdb.Open(sdb.Config{Driver: sdb.DriverSQLite, DSN: ":memory:"})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	iamService := iam.New(database, time.Hour)
	boot, err := iamService.Bootstrap(context.Background(), iam.BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	principal, err := iamService.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve admin principal: %v", err)
	}

	skills := skillregistry.New(database, iamService)
	mcp := mcpregistry.New(database, iamService)
	agents := agentregistry.New(database, iamService)
	hooks := hookregistry.New(database, iamService)

	return testEnv{
		svc:            New(database, iamService, skills, mcp, agents, hooks),
		skills:         skills,
		mcp:            mcp,
		agents:         agents,
		hooks:          hooks,
		iam:            iamService,
		adminPrincipal: principal,
		orgID:          boot.Organizations[0].ID,
	}
}

func TestExportRejectsEmptySelection(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.svc.Export(context.Background(), env.adminPrincipal, ExportSelection{
		OrganizationID: env.orgID, Name: "Empty",
	})
	if err == nil {
		t.Fatal("expected an error for an empty selection")
	}
}

func TestExportRejectsUnknownID(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.svc.Export(context.Background(), env.adminPrincipal, ExportSelection{
		OrganizationID: env.orgID, Name: "Bad", MCPServerIDs: []string{"does-not-exist"},
	})
	if err == nil {
		t.Fatal("expected an error for a nonexistent mcp server id")
	}
}

func TestExportBuildsAManifestFromRealRegistryData(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	skill, err := env.skills.CreateSkillRepo(context.Background(), env.adminPrincipal, skillregistry.CreateSkillRepoParams{
		OrganizationID: env.orgID, Name: "jira-helpers", URL: "https://github.com/example/jira-helpers", Description: "Jira workflow skills",
	})
	if err != nil {
		t.Fatalf("create skill repo: %v", err)
	}
	server, err := env.mcp.CreateServerConfig(context.Background(), env.adminPrincipal, mcpregistry.CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "jira", ServerType: "http", URL: "https://jira.example.com/mcp",
		Headers: map[string]string{"Authorization": "Bearer super-secret-token"},
	})
	if err != nil {
		t.Fatalf("create mcp server: %v", err)
	}
	hook, err := env.hooks.CreateHookConfig(context.Background(), env.adminPrincipal, hookregistry.CreateHookConfigParams{
		OrganizationID: env.orgID, Name: "block-rm", Matcher: "bash", Command: "exit 0",
	})
	if err != nil {
		t.Fatalf("create hook: %v", err)
	}
	preset, err := env.agents.CreatePreset(context.Background(), env.adminPrincipal, agentregistry.CreatePresetParams{
		OrganizationID: env.orgID, Slug: "jira-triage", Name: "Jira Triage", SystemPrompt: "You triage Jira tickets.",
		McpServers: []string{"jira"},
	})
	if err != nil {
		t.Fatalf("create agent preset: %v", err)
	}

	manifest, err := env.svc.Export(context.Background(), env.adminPrincipal, ExportSelection{
		OrganizationID: env.orgID, Name: "Jira Integration",
		SkillRepoIDs: []string{skill.ID}, MCPServerIDs: []string{server.ID},
		HookConfigIDs: []string{hook.ID}, AgentPresetIDs: []string{preset.ID},
	})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	if manifest.ItemCount() != 4 {
		t.Fatalf("expected 4 items in the manifest, got %+v", manifest)
	}
	if len(manifest.MCPServers) != 1 || manifest.MCPServers[0].Name != "jira" {
		t.Fatalf("unexpected mcp servers in manifest: %+v", manifest.MCPServers)
	}
	if len(manifest.AgentPresets) != 1 || manifest.AgentPresets[0].McpServers[0] != "jira" {
		t.Fatalf("unexpected agent presets in manifest: %+v", manifest.AgentPresets)
	}
}

// TestExportNeverIncludesMCPSecrets is a real end-to-end proof (not just the
// manifest-shape test in manifest_test.go): a real MCP server created with
// a real secret header, exported through the actual Export path and
// JSON-encoded, must never surface that secret anywhere in the output.
func TestExportNeverIncludesMCPSecrets(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	const secret = "super-secret-token"
	server, err := env.mcp.CreateServerConfig(context.Background(), env.adminPrincipal, mcpregistry.CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "jira", ServerType: "http", URL: "https://jira.example.com/mcp",
		Headers: map[string]string{"Authorization": "Bearer " + secret},
	})
	if err != nil {
		t.Fatalf("create mcp server: %v", err)
	}
	manifest, err := env.svc.Export(context.Background(), env.adminPrincipal, ExportSelection{
		OrganizationID: env.orgID, Name: "Test", MCPServerIDs: []string{server.ID},
	})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	raw, err := json.Marshal(manifest)
	if err != nil {
		t.Fatalf("marshal manifest: %v", err)
	}
	if strings.Contains(string(raw), secret) {
		t.Fatalf("exported manifest leaked the secret header value: %s", raw)
	}
}
