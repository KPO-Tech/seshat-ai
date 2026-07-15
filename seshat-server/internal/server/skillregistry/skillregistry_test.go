package skillregistry

import (
	"context"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
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

func TestCreateSkillRepoRequiresManagePermission(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	if _, err := env.svc.CreateSkillRepo(context.Background(), member, CreateSkillRepoParams{
		OrganizationID: env.orgID, Name: "seshat-skills", URL: "https://github.com/EngineerProjects/seshat-skills",
	}); err == nil {
		t.Fatal("expected a member without skills_registry.manage to be denied creating a skill repo")
	}

	repo, err := env.svc.CreateSkillRepo(context.Background(), env.adminPrincipal, CreateSkillRepoParams{
		OrganizationID: env.orgID, Name: "seshat-skills", URL: "https://github.com/EngineerProjects/seshat-skills",
	})
	if err != nil {
		t.Fatalf("create as admin: %v", err)
	}
	if repo.Name != "seshat-skills" {
		t.Fatalf("unexpected repo: %+v", repo)
	}
}

func TestListSkillReposOpenToAnyMember(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	if _, err := env.svc.CreateSkillRepo(context.Background(), env.adminPrincipal, CreateSkillRepoParams{
		OrganizationID: env.orgID, Name: "seshat-skills", URL: "https://github.com/EngineerProjects/seshat-skills",
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	// Unlike ProviderSetting, a plain member (no skills_registry.manage) can
	// still list — these are public URLs, nothing to protect.
	repos, err := env.svc.ListSkillRepos(context.Background(), member, env.orgID)
	if err != nil {
		t.Fatalf("expected a member to list skill repos, got: %v", err)
	}
	if len(repos) != 1 || repos[0].Name != "seshat-skills" {
		t.Fatalf("unexpected repos: %+v", repos)
	}
}

func TestListSkillReposRejectsNonMember(t *testing.T) {
	env := newTestEnv(t)
	outsider := env.addOutsider(t)

	if _, err := env.svc.CreateSkillRepo(context.Background(), env.adminPrincipal, CreateSkillRepoParams{
		OrganizationID: env.orgID, Name: "seshat-skills", URL: "https://github.com/EngineerProjects/seshat-skills",
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	if _, err := env.svc.ListSkillRepos(context.Background(), outsider, env.orgID); err == nil {
		t.Fatal("expected a non-member of the organization to be rejected")
	}
}

func TestListSkillReposFallsBackToPlatformDefault(t *testing.T) {
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
	if _, err := env.svc.CreateSkillRepo(context.Background(), env.adminPrincipal, CreateSkillRepoParams{
		OrganizationID: defaultOrg.ID, Name: "platform-skills", URL: "https://github.com/EngineerProjects/platform-skills",
	}); err != nil {
		t.Fatalf("create repo on the default org: %v", err)
	}

	// env.orgID has no skill repos of its own yet - should fall back.
	repos, err := env.svc.ListSkillRepos(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list with fallback: %v", err)
	}
	if len(repos) != 1 || repos[0].Name != "platform-skills" || repos[0].Source != "platform" {
		t.Fatalf("expected fallback to the default org's repo marked platform, got: %+v", repos)
	}

	// Once the org configures even one repo of its own, the platform
	// default no longer shows up at all - all-or-nothing, not merged.
	if _, err := env.svc.CreateSkillRepo(context.Background(), env.adminPrincipal, CreateSkillRepoParams{
		OrganizationID: env.orgID, Name: "org-own-skills", URL: "https://github.com/example/org-own-skills",
	}); err != nil {
		t.Fatalf("create org's own repo: %v", err)
	}
	repos, err = env.svc.ListSkillRepos(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list after org configures its own: %v", err)
	}
	if len(repos) != 1 || repos[0].Name != "org-own-skills" || repos[0].Source != "organization" {
		t.Fatalf("expected only the org's own repo marked organization, no fallback mixed in, got: %+v", repos)
	}
}

func TestListSkillReposHonorsShareSkillReposOptOut(t *testing.T) {
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
	if _, err := env.svc.CreateSkillRepo(context.Background(), env.adminPrincipal, CreateSkillRepoParams{
		OrganizationID: defaultOrg.ID, Name: "platform-skills", URL: "https://github.com/EngineerProjects/platform-skills",
	}); err != nil {
		t.Fatalf("create repo on the default org: %v", err)
	}
	shareSkillRepos := false
	if _, err := env.iam.SetOrganizationSharedDomains(context.Background(), env.adminPrincipal, defaultOrg.ID, nil, nil, nil, nil, &shareSkillRepos); err != nil {
		t.Fatalf("opt out of sharing skill repos: %v", err)
	}

	repos, err := env.svc.ListSkillRepos(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(repos) != 0 {
		t.Fatalf("expected the fallback to be skipped once the default org opted out of sharing skill repos, got: %+v", repos)
	}
}

func TestCreateSkillRepoRejectsDuplicateName(t *testing.T) {
	env := newTestEnv(t)
	params := CreateSkillRepoParams{OrganizationID: env.orgID, Name: "seshat-skills", URL: "https://github.com/EngineerProjects/seshat-skills"}
	if _, err := env.svc.CreateSkillRepo(context.Background(), env.adminPrincipal, params); err != nil {
		t.Fatalf("first create: %v", err)
	}
	if _, err := env.svc.CreateSkillRepo(context.Background(), env.adminPrincipal, params); err == nil {
		t.Fatal("expected a second skill repo with the same name in the same org to be rejected")
	}
}

func TestUpdateAndDeleteSkillRepoRequireManagePermission(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	repo, err := env.svc.CreateSkillRepo(context.Background(), env.adminPrincipal, CreateSkillRepoParams{
		OrganizationID: env.orgID, Name: "seshat-skills", URL: "https://github.com/EngineerProjects/seshat-skills",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if _, err := env.svc.UpdateSkillRepo(context.Background(), member, repo.ID, UpdateSkillRepoParams{Description: "hacked"}); err == nil {
		t.Fatal("expected a member to be denied updating a skill repo")
	}
	if err := env.svc.DeleteSkillRepo(context.Background(), member, repo.ID); err == nil {
		t.Fatal("expected a member to be denied deleting a skill repo")
	}

	updated, err := env.svc.UpdateSkillRepo(context.Background(), env.adminPrincipal, repo.ID, UpdateSkillRepoParams{Description: "official collection"})
	if err != nil {
		t.Fatalf("update as admin: %v", err)
	}
	if updated.Description != "official collection" {
		t.Fatalf("unexpected updated repo: %+v", updated)
	}

	if err := env.svc.DeleteSkillRepo(context.Background(), env.adminPrincipal, repo.ID); err != nil {
		t.Fatalf("delete as admin: %v", err)
	}
	repos, err := env.svc.ListSkillRepos(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list after delete: %v", err)
	}
	if len(repos) != 0 {
		t.Fatalf("expected no repos after delete, got %+v", repos)
	}
}
