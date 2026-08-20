package connectors

import (
	"context"
	"testing"
	"time"

	sdkstorage "github.com/KPO-Tech/seshat/pkg/storage"
	sdkvector "github.com/KPO-Tech/seshat/pkg/vector"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
)

const (
	testEncryptionEnvVar = "SESHAT_SERVER_ENCRYPTION_KEY"
	testEncryptionKey    = "g/t9EsDxTTJSTu6Q+Kne06PBHoGmhH3yAJaEuHmFl9A="
)

type testEnv struct {
	db             *sdb.DB
	knowledge      *knowledge.Service
	connectors     *Service
	iam            *iam.Service
	adminPrincipal *iam.Principal
	orgID          string
}

// newTestEnv mirrors knowledge's own newTestEnv shape: a fresh in-memory
// database, an iam.Service, a knowledge.Service (local-disk artifact store,
// in-memory vector store) and the connectors.Service under test.
func newTestEnv(t *testing.T) testEnv {
	t.Helper()
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	database, err := sdb.Open(sdb.Config{Driver: sdb.DriverSQLite, DSN: ":memory:"})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	iamService := iam.New(database, time.Hour)

	artifacts, err := sdkstorage.NewArtifactStoreFromConfig(sdkstorage.Config{
		Provider:  sdkstorage.ProviderLocal,
		LocalPath: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("open artifact store: %v", err)
	}
	knowledgeService := knowledge.New(database, iamService, artifacts, sdkvector.NewMemoryStore())
	connectorsService := New(database, iamService, knowledgeService)

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
		knowledge:      knowledgeService,
		connectors:     connectorsService,
		iam:            iamService,
		adminPrincipal: principal,
		orgID:          boot.Organizations[0].ID,
	}
}

// addMember creates a plain (non-admin) member inside env.orgID - for tests
// asserting that a self-service, org-membership-only flow (agent_action
// connect) works for someone without knowledge.manage/organization.manage,
// unlike the admin-gated knowledge_sync flow.
func (env testEnv) addMember(t *testing.T) *iam.Principal {
	t.Helper()
	user, err := env.iam.CreateUser(context.Background(), env.adminPrincipal, iam.CreateUserParams{
		Email: "member@example.com", Password: "password123", DisplayName: "Member",
		OrganizationID: env.orgID, Role: "member",
	})
	if err != nil {
		t.Fatalf("create member user: %v", err)
	}
	login, err := env.iam.Login(context.Background(), user.Email, "password123")
	if err != nil {
		t.Fatalf("login member: %v", err)
	}
	principal, err := env.iam.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve member principal: %v", err)
	}
	return principal
}
