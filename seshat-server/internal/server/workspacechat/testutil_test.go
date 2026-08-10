package workspacechat

import (
	"context"
	"testing"
	"time"

	sdkstorage "github.com/KPO-Tech/seshat/pkg/storage"
	sdkvector "github.com/KPO-Tech/seshat/pkg/vector"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/automation"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/websearchsettings"
)

type testEnv struct {
	db             *sdb.DB
	chat           *Service
	iam            *iam.Service
	adminPrincipal *iam.Principal
	orgID          string
}

// newTestEnv bootstraps a fresh in-memory database plus every dependency
// workspacechat.Service needs (iam, automation, websearchsettings, knowledge)
// — mirroring automation's and knowledge's own newTestEnv shape. No provider
// credentials are configured by default, so getOrCreateSession's call into
// automation.ResolveProviderSetting fails deterministically (same "not
// configured" path automation's own provider_settings_test.go exercises) -
// this repo doesn't fake the LLM provider HTTP boundary in tests, so
// StreamChat's happy path (an actual model turn) is intentionally out of
// scope here; these tests cover everything up to that boundary plus all the
// pure persistence/eviction/formatting logic around it.
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
	automationService := automation.New(database, iamService)
	webSearchService := websearchsettings.New(database, iamService)

	artifacts, err := sdkstorage.NewArtifactStoreFromConfig(sdkstorage.Config{
		Provider:  sdkstorage.ProviderLocal,
		LocalPath: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("open artifact store: %v", err)
	}
	knowledgeService := knowledge.New(database, iamService, artifacts, sdkvector.NewMemoryStore())

	chatService := New(database, iamService, automationService, webSearchService, knowledgeService, "")

	boot, err := iamService.Bootstrap(context.Background(), iam.BootstrapParams{
		Email:            "admin@example.com",
		Password:         "password123",
		DisplayName:      "Admin",
		OrganizationName: "Seshat",
		OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	principal, err := iamService.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve admin principal: %v", err)
	}

	return testEnv{
		db:             database,
		chat:           chatService,
		iam:            iamService,
		adminPrincipal: principal,
		orgID:          boot.Organizations[0].ID,
	}
}

// addOutsider creates a second organization and a member inside it, with no
// membership at all in env.orgID — for tests asserting that a genuine
// non-member gets rejected. Mirrors automation's testutil_test.go helper of
// the same name.
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
