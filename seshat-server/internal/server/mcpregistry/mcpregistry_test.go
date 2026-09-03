package mcpregistry

import (
	"context"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

const (
	testEncryptionEnvVar = "SESHAT_SERVER_ENCRYPTION_KEY"
	testEncryptionKey    = "g/t9EsDxTTJSTu6Q+Kne06PBHoGmhH3yAJaEuHmFl9A="
)

type testEnv struct {
	svc            *Service
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

	return testEnv{
		svc: New(database, iamService), iam: iamService,
		adminPrincipal: principal, orgID: boot.Organizations[0].ID,
	}
}

func (env testEnv) addMember(t *testing.T, role string) *iam.Principal {
	t.Helper()
	email := role + "@example.com"
	user, err := env.iam.CreateUser(context.Background(), env.adminPrincipal, iam.CreateUserParams{
		Email: email, Password: "password123", DisplayName: role,
		OrganizationID: env.orgID, Role: role,
	})
	if err != nil {
		t.Fatalf("create %s user: %v", role, err)
	}
	login, err := env.iam.Login(context.Background(), user.Email, "password123")
	if err != nil {
		t.Fatalf("login %s: %v", role, err)
	}
	principal, err := env.iam.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve %s principal: %v", role, err)
	}
	return principal
}

func (env testEnv) addOutsider(t *testing.T) *iam.Principal {
	t.Helper()
	otherOrg, err := env.iam.CreateOrganization(context.Background(), env.adminPrincipal, iam.CreateOrganizationParams{
		Name: "Other Org", Slug: "other-org",
	})
	if err != nil {
		t.Fatalf("create other org: %v", err)
	}
	user, err := env.iam.CreateUser(context.Background(), env.adminPrincipal, iam.CreateUserParams{
		Email: "outsider@example.com", Password: "password123", DisplayName: "Outsider",
		OrganizationID: otherOrg.ID, Role: "member",
	})
	if err != nil {
		t.Fatalf("create outsider user: %v", err)
	}
	login, err := env.iam.Login(context.Background(), user.Email, "password123")
	if err != nil {
		t.Fatalf("login outsider: %v", err)
	}
	principal, err := env.iam.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve outsider principal: %v", err)
	}
	return principal
}

func TestListServerConfigsDegradesToEmptyForMemberWithoutPermission(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	if _, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "internal-jira", ServerType: "stdio",
		Command: "npx", Args: []string{"-y", "mcp-server-jira"},
		Env: map[string]string{"JIRA_TOKEN": "secret-token"},
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	list, err := env.svc.ListServerConfigs(context.Background(), member, env.orgID)
	if err != nil {
		t.Fatalf("list as member: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("expected a member without mcp_registry.manage to see an empty list, got %+v", list)
	}

	list, err = env.svc.ListServerConfigs(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list as admin: %v", err)
	}
	if len(list) != 1 || list[0].Name != "internal-jira" {
		t.Fatalf("unexpected admin list: %+v", list)
	}
}

func TestCreateUpdateDeleteRequireManagePermission(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	if _, err := env.svc.CreateServerConfig(context.Background(), member, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "denied", ServerType: "stdio", Command: "echo",
	}); err == nil {
		t.Fatal("expected a member without mcp_registry.manage to be denied creating a config")
	}

	config, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "allowed", ServerType: "http", URL: "https://mcp.example.com",
		Headers: map[string]string{"Authorization": "Bearer xyz"},
	})
	if err != nil {
		t.Fatalf("create as admin: %v", err)
	}

	if _, err := env.svc.UpdateServerConfig(context.Background(), member, config.ID, UpdateServerConfigParams{DisplayName: "x"}); err == nil {
		t.Fatal("expected a member without mcp_registry.manage to be denied updating")
	}
	if err := env.svc.DeleteServerConfig(context.Background(), member, config.ID); err == nil {
		t.Fatal("expected a member without mcp_registry.manage to be denied deleting")
	}

	updated, err := env.svc.UpdateServerConfig(context.Background(), env.adminPrincipal, config.ID, UpdateServerConfigParams{
		DisplayName: "Allowed Server", ServerType: "http", URL: "https://mcp.example.com/v2",
	})
	if err != nil {
		t.Fatalf("update as admin: %v", err)
	}
	if updated.DisplayName != "Allowed Server" || updated.URL != "https://mcp.example.com/v2" {
		t.Fatalf("unexpected updated config: %+v", updated)
	}

	if err := env.svc.DeleteServerConfig(context.Background(), env.adminPrincipal, config.ID); err != nil {
		t.Fatalf("delete as admin: %v", err)
	}
}

func TestResolveServerConfigsMemberOpenNonMemberRejected(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	member := env.addMember(t, "member")
	outsider := env.addOutsider(t)

	if _, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "internal-jira", ServerType: "stdio",
		Command: "npx", Args: []string{"-y", "mcp-server-jira"},
		Env: map[string]string{"JIRA_TOKEN": "secret-token"},
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	resolved, err := env.svc.ResolveServerConfigs(context.Background(), member, env.orgID)
	if err != nil {
		t.Fatalf("expected a member to resolve the org's mcp server configs, got: %v", err)
	}
	if len(resolved) != 1 || resolved[0].Name != "internal-jira" {
		t.Fatalf("unexpected resolved configs: %+v", resolved)
	}
	if resolved[0].Env["JIRA_TOKEN"] != "secret-token" {
		t.Fatalf("expected decrypted env to round-trip, got: %+v", resolved[0].Env)
	}
	if resolved[0].Command != "npx" || len(resolved[0].Args) != 2 {
		t.Fatalf("unexpected resolved command/args: %+v", resolved[0])
	}

	if _, err := env.svc.ResolveServerConfigs(context.Background(), outsider, env.orgID); err == nil {
		t.Fatal("expected a non-member of the organization to be rejected")
	}
}

func TestCreateServerConfigRejectsDuplicateName(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	if _, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "dup", ServerType: "stdio", Command: "echo",
	}); err != nil {
		t.Fatalf("first create: %v", err)
	}
	if _, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "dup", ServerType: "stdio", Command: "echo",
	}); err == nil {
		t.Fatal("expected a second config with the same name in the same org to be rejected")
	}
}

func TestResolveServerConfigsFallsBackToPlatformDefault(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	defaultOrg, err := env.iam.CreateOrganization(context.Background(), env.adminPrincipal, iam.CreateOrganizationParams{
		Name: "Default Org", Slug: "default-org",
	})
	if err != nil {
		t.Fatalf("create default org: %v", err)
	}
	if _, err := env.iam.SetOrganizationDefault(context.Background(), env.adminPrincipal, defaultOrg.ID, true); err != nil {
		t.Fatalf("set organization default: %v", err)
	}
	if _, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: defaultOrg.ID, Name: "platform-playwright", ServerType: "http", URL: "https://mcp.example.com/playwright",
	}); err != nil {
		t.Fatalf("create config on the default org: %v", err)
	}

	// env.orgID has no MCP servers of its own yet - resolving should fall
	// back to the default org's.
	resolved, err := env.svc.ResolveServerConfigs(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("resolve with fallback: %v", err)
	}
	if len(resolved) != 1 || resolved[0].Name != "platform-playwright" {
		t.Fatalf("expected fallback to the default org's server, got: %+v", resolved)
	}

	// The admin CRUD list must NOT blend in the fallback - it's a resolve-
	// time only behavior.
	list, err := env.svc.ListServerConfigs(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("expected the admin list to stay empty (no blending), got: %+v", list)
	}

	// Once the org configures even one server of its own, the platform
	// default no longer shows up at all - all-or-nothing, not merged.
	if _, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "org-own-server", ServerType: "stdio", Command: "echo",
	}); err != nil {
		t.Fatalf("create org's own config: %v", err)
	}
	resolved, err = env.svc.ResolveServerConfigs(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("resolve after org configures its own: %v", err)
	}
	if len(resolved) != 1 || resolved[0].Name != "org-own-server" {
		t.Fatalf("expected only the org's own server, no fallback mixed in, got: %+v", resolved)
	}
}

// stubConnectorTokenResolver is a fake ConnectorTokenResolver - tests need
// no real connectors.Service dependency, matching the whole point of the
// interface (composition, no cross-import). tokensByUser lets a test give
// different principals different tokens, proving injection is genuinely
// per-caller and not accidentally shared/cached.
type stubConnectorTokenResolver struct {
	tokensByUser map[string]string // userID -> token; absent/empty = not connected
	err          error
	calls        []string // organizationID+":"+kind+":"+userID, for call-count assertions
}

func (r *stubConnectorTokenResolver) AccessTokenForUser(ctx context.Context, organizationID, kind, userID string) (string, bool, error) {
	r.calls = append(r.calls, organizationID+":"+kind+":"+userID)
	if r.err != nil {
		return "", false, r.err
	}
	token, ok := r.tokensByUser[userID]
	if !ok || token == "" {
		return "", false, nil
	}
	return token, true, nil
}

func TestResolveServerConfigsInjectsConnectorTokenPerPrincipal(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	if _, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "gdrive-actions", ServerType: "http", URL: "https://mcp.example.com/gdrive",
		Headers:       map[string]string{"X-Static": "always-present"},
		ConnectorKind: "gdrive",
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	stub := &stubConnectorTokenResolver{tokensByUser: map[string]string{
		env.adminPrincipal.User.ID: "admin-token",
		// member deliberately absent - not connected.
	}}
	env.svc.SetConnectorTokenResolver(stub)

	adminResolved, err := env.svc.ResolveServerConfigs(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil || len(adminResolved) != 1 {
		t.Fatalf("resolve as admin: %v %+v", err, adminResolved)
	}
	if !adminResolved[0].Connected {
		t.Fatalf("expected admin's resolved config to be marked connected, got %+v", adminResolved[0])
	}
	if adminResolved[0].Headers["Authorization"] != "Bearer admin-token" {
		t.Fatalf("expected admin's own token injected as a Bearer header, got %+v", adminResolved[0].Headers)
	}
	if adminResolved[0].Headers["X-Static"] != "always-present" {
		t.Fatalf("expected the static header to survive injection, got %+v", adminResolved[0].Headers)
	}

	memberResolved, err := env.svc.ResolveServerConfigs(context.Background(), member, env.orgID)
	if err != nil || len(memberResolved) != 1 {
		t.Fatalf("resolve as member: %v %+v", err, memberResolved)
	}
	if memberResolved[0].Connected {
		t.Fatalf("expected member (no connected account) to resolve as not connected, got %+v", memberResolved[0])
	}
	if _, ok := memberResolved[0].Headers["Authorization"]; ok {
		t.Fatalf("expected no Authorization header for a member with no connected account, got %+v", memberResolved[0].Headers)
	}
	if memberResolved[0].Headers["X-Static"] != "always-present" {
		t.Fatalf("expected the static header to still be present, got %+v", memberResolved[0].Headers)
	}

	if len(stub.calls) != 2 {
		t.Fatalf("expected AccessTokenForUser to be called once per ResolveServerConfigs call (2 total), got %v", stub.calls)
	}
}

func TestResolveServerConfigsWithoutConnectorKindNeverCallsResolver(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	if _, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "plain-jira", ServerType: "stdio", Command: "echo",
	}); err != nil {
		t.Fatalf("create: %v", err)
	}
	stub := &stubConnectorTokenResolver{}
	env.svc.SetConnectorTokenResolver(stub)

	resolved, err := env.svc.ResolveServerConfigs(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil || len(resolved) != 1 {
		t.Fatalf("resolve: %v %+v", err, resolved)
	}
	if !resolved[0].Connected {
		t.Fatalf("expected a plain (no ConnectorKind) server to resolve as connected, got %+v", resolved[0])
	}
	if len(stub.calls) != 0 {
		t.Fatalf("expected the resolver to never be called for a server with no ConnectorKind, got %v", stub.calls)
	}
}

func TestResolveServerConfigsToleratesNoResolverWired(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	// Deliberately never calling SetConnectorTokenResolver - production
	// default, must not panic or error.

	if _, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "gdrive-actions", ServerType: "http", URL: "https://mcp.example.com/gdrive",
		ConnectorKind: "gdrive",
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	resolved, err := env.svc.ResolveServerConfigs(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil || len(resolved) != 1 {
		t.Fatalf("resolve: %v %+v", err, resolved)
	}
	if resolved[0].Connected {
		t.Fatalf("expected not connected with no resolver wired, got %+v", resolved[0])
	}
	if _, ok := resolved[0].Headers["Authorization"]; ok {
		t.Fatalf("expected no Authorization header with no resolver wired, got %+v", resolved[0].Headers)
	}
}

// stubStaticSecretResolver mirrors stubConnectorTokenResolver above, for
// StaticSecretResolver instead - same fake-not-real-connectors.Service
// reasoning.
type stubStaticSecretResolver struct {
	secretsByUser map[string]string
	err           error
	calls         []string
}

func (r *stubStaticSecretResolver) StaticSecretForUser(ctx context.Context, organizationID, kind, userID string) (string, bool, error) {
	r.calls = append(r.calls, organizationID+":"+kind+":"+userID)
	if r.err != nil {
		return "", false, r.err
	}
	secret, ok := r.secretsByUser[userID]
	if !ok || secret == "" {
		return "", false, nil
	}
	return secret, true, nil
}

// TestResolveServerConfigsInjectsStaticSecretWhenOAuthResolverFindsNothing
// proves the fallback this fix adds: a static-secret connector kind
// (stripe/trello/airtable) has no OAuth account by definition, so the OAuth
// resolver alone would always leave it unconnected - the static resolver
// must be consulted too, not instead.
func TestResolveServerConfigsInjectsStaticSecretWhenOAuthResolverFindsNothing(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	if _, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "stripe-actions", ServerType: "http", URL: "https://mcp.stripe.com",
		ConnectorKind: "stripe",
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	oauthStub := &stubConnectorTokenResolver{} // no accounts at all - stripe is never OAuth
	staticStub := &stubStaticSecretResolver{secretsByUser: map[string]string{
		env.adminPrincipal.User.ID: "sk_live_admin",
	}}
	env.svc.SetConnectorTokenResolver(oauthStub)
	env.svc.SetStaticSecretResolver(staticStub)

	resolved, err := env.svc.ResolveServerConfigs(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil || len(resolved) != 1 {
		t.Fatalf("resolve: %v %+v", err, resolved)
	}
	if !resolved[0].Connected {
		t.Fatalf("expected static-secret fallback to mark this connected, got %+v", resolved[0])
	}
	if resolved[0].Headers["Authorization"] != "Bearer sk_live_admin" {
		t.Fatalf("expected the static secret injected as a Bearer header, got %+v", resolved[0].Headers)
	}
	if len(oauthStub.calls) != 1 {
		t.Fatalf("expected the OAuth resolver to still be tried first (and once), got %v", oauthStub.calls)
	}
	if len(staticStub.calls) != 1 {
		t.Fatalf("expected the static resolver to be tried after the OAuth one came back empty, got %v", staticStub.calls)
	}
}

// TestResolveServerConfigsPrefersOAuthOverStaticWhenBothWired proves the two
// resolvers don't double-inject or fight when a genuinely OAuth kind (never
// having a static account) is resolved with both wired, as production does.
func TestResolveServerConfigsPrefersOAuthOverStaticWhenBothWired(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	if _, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "slack-actions", ServerType: "http", URL: "https://mcp.slack.com/mcp",
		ConnectorKind: "slack",
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	oauthStub := &stubConnectorTokenResolver{tokensByUser: map[string]string{
		env.adminPrincipal.User.ID: "oauth-token",
	}}
	staticStub := &stubStaticSecretResolver{} // slack is never a static kind - no accounts
	env.svc.SetConnectorTokenResolver(oauthStub)
	env.svc.SetStaticSecretResolver(staticStub)

	resolved, err := env.svc.ResolveServerConfigs(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil || len(resolved) != 1 {
		t.Fatalf("resolve: %v %+v", err, resolved)
	}
	if resolved[0].Headers["Authorization"] != "Bearer oauth-token" {
		t.Fatalf("expected the OAuth token injected, got %+v", resolved[0].Headers)
	}
	if len(staticStub.calls) != 0 {
		t.Fatalf("expected the static resolver to never be tried once the OAuth one already connected, got %v", staticStub.calls)
	}
}

func TestHeadersEncryptionRoundTrip(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	config, err := env.svc.CreateServerConfig(context.Background(), env.adminPrincipal, CreateServerConfigParams{
		OrganizationID: env.orgID, Name: "http-server", ServerType: "http", URL: "https://mcp.example.com",
		Headers: map[string]string{"Authorization": "Bearer initial"},
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	resolved, err := env.svc.ResolveServerConfigs(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil || len(resolved) != 1 {
		t.Fatalf("resolve: %v %+v", err, resolved)
	}
	if resolved[0].Headers["Authorization"] != "Bearer initial" {
		t.Fatalf("expected initial header to round-trip, got %+v", resolved[0].Headers)
	}

	if _, err := env.svc.UpdateServerConfig(context.Background(), env.adminPrincipal, config.ID, UpdateServerConfigParams{
		ServerType: "http", URL: "https://mcp.example.com", Headers: map[string]string{"Authorization": "Bearer updated"},
	}); err != nil {
		t.Fatalf("update: %v", err)
	}
	resolved, err = env.svc.ResolveServerConfigs(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil || len(resolved) != 1 {
		t.Fatalf("resolve after update: %v %+v", err, resolved)
	}
	if resolved[0].Headers["Authorization"] != "Bearer updated" {
		t.Fatalf("expected updated header to round-trip, got %+v", resolved[0].Headers)
	}
}
