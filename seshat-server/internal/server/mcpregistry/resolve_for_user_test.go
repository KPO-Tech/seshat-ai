package mcpregistry

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func TestResolveServerConfigsForUserRequiresOrgIDAndUserID(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.svc.ResolveServerConfigsForUser(context.Background(), "", env.adminPrincipal.User.ID); !errors.Is(err, iam.ErrInvalidInput("")) {
		t.Fatalf("expected invalid-input for an empty organization id, got %v", err)
	}
	if _, err := env.svc.ResolveServerConfigsForUser(context.Background(), env.orgID, ""); !errors.Is(err, iam.ErrInvalidInput("")) {
		t.Fatalf("expected invalid-input for an empty user id, got %v", err)
	}
}

func TestResolveServerConfigsForUserRejectsNonMember(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	outsider := env.addOutsider(t)

	if _, err := env.svc.ResolveServerConfigsForUser(context.Background(), env.orgID, outsider.User.ID); !errors.Is(err, iam.ErrForbidden("")) {
		t.Fatalf("expected a non-member's user id to be rejected, got %v", err)
	}
}

// TestResolveServerConfigsForUserBridgesConnectorToken proves the
// principal-less path (a scheduled cloud job resolving on behalf of its
// creator, see automation.MCPResolver) behaves identically to
// ResolveServerConfigs' own principal-based bridging - same Bearer
// injection, same "no connected account degrades to not-connected, not an
// error" posture - and that its result already comes back as
// sdk.MCPServerConfig, not this package's own ResolvedMCPServerConfig.
func TestResolveServerConfigsForUserBridgesConnectorToken(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	if _, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "slack-actions", ServerType: "http", URL: "https://mcp.slack.com/mcp",
		Headers:       map[string]string{"X-Static": "always-present"},
		ConnectorKind: "slack",
		TimeoutSecs:   30,
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	stub := &stubConnectorTokenResolver{tokensByUser: map[string]string{
		member.User.ID: "member-slack-token",
	}}
	env.svc.SetConnectorTokenResolver(stub)

	// The job's creator has a connected account.
	resolved, err := env.svc.ResolveServerConfigsForUser(context.Background(), env.orgID, member.User.ID)
	if err != nil {
		t.Fatalf("resolve for member: %v", err)
	}
	if len(resolved) != 1 {
		t.Fatalf("expected 1 server config, got %+v", resolved)
	}
	if resolved[0].Name != "slack-actions" || resolved[0].URL != "https://mcp.slack.com/mcp" {
		t.Fatalf("unexpected server config: %+v", resolved[0])
	}
	if resolved[0].Headers["Authorization"] != "Bearer member-slack-token" {
		t.Fatalf("expected the member's own token bridged as a Bearer header, got %+v", resolved[0].Headers)
	}
	if resolved[0].Headers["X-Static"] != "always-present" {
		t.Fatalf("expected the static header to survive bridging, got %+v", resolved[0].Headers)
	}
	if resolved[0].Timeout != 30*time.Second {
		t.Fatalf("expected timeout_secs to convert to a time.Duration, got %v", resolved[0].Timeout)
	}

	// The job's creator has no connected account - degrades, doesn't error.
	resolvedNoAccount, err := env.svc.ResolveServerConfigsForUser(context.Background(), env.orgID, env.adminPrincipal.User.ID)
	if err != nil {
		t.Fatalf("resolve for admin (no connected account): %v", err)
	}
	if len(resolvedNoAccount) != 1 {
		t.Fatalf("expected 1 server config even without a connected account, got %+v", resolvedNoAccount)
	}
	if _, ok := resolvedNoAccount[0].Headers["Authorization"]; ok {
		t.Fatalf("expected no Authorization header for a creator with no connected account, got %+v", resolvedNoAccount[0].Headers)
	}
}

func TestToSDKServerConfigsMapsFields(t *testing.T) {
	converted := ToSDKServerConfigs([]ResolvedMCPServerConfig{
		{
			Name: "internal-jira", ServerType: "stdio", Command: "npx", Args: []string{"-y", "mcp-server-jira"},
			Env: map[string]string{"JIRA_TOKEN": "secret"}, TimeoutSecs: 45,
		},
	})
	if len(converted) != 1 {
		t.Fatalf("expected 1 converted config, got %+v", converted)
	}
	c := converted[0]
	if c.Name != "internal-jira" || c.Command != "npx" || len(c.Args) != 2 {
		t.Fatalf("unexpected conversion: %+v", c)
	}
	if string(c.Transport) != "stdio" {
		t.Fatalf("expected ServerType to map to Transport, got %q", c.Transport)
	}
	if c.Env["JIRA_TOKEN"] != "secret" {
		t.Fatalf("expected Env to survive conversion, got %+v", c.Env)
	}
	if c.Timeout != 45*time.Second {
		t.Fatalf("expected TimeoutSecs to convert to a time.Duration, got %v", c.Timeout)
	}
}
