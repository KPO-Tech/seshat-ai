package knowledge

import (
	"context"
	"testing"
	"time"

	sdkrag "github.com/EngineerProjects/seshat/pkg/rag"
	sdkstorage "github.com/EngineerProjects/seshat/pkg/storage"
	sdkvector "github.com/EngineerProjects/seshat/pkg/vector"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

type testEnv struct {
	db             *sdb.DB
	knowledge      *Service
	iam            *iam.Service
	adminPrincipal *iam.Principal
	orgID          string
}

// fakeEmbedder returns a fixed-length deterministic vector per text so RAG
// ingest/search work end-to-end in tests without a real embedding API.
type fakeEmbedder struct{}

func (fakeEmbedder) EmbedTexts(_ context.Context, texts []string) ([][]float32, error) {
	out := make([][]float32, len(texts))
	for i, text := range texts {
		vec := make([]float32, 8)
		for j, r := range text {
			vec[j%len(vec)] += float32(r % 97)
		}
		out[i] = vec
	}
	return out, nil
}

// newTestEnv bootstraps a fresh in-memory database, an iam.Service and a
// knowledge.Service backed by a local-disk artifact store (a temp dir) and
// an in-memory vector store + fake embedder — a fully working RAG pipeline
// with no network calls, mirroring automation's own newTestEnv shape.
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

	artifacts, err := sdkstorage.NewArtifactStoreFromConfig(sdkstorage.Config{
		Provider:  sdkstorage.ProviderLocal,
		LocalPath: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("open artifact store: %v", err)
	}
	ragService := sdkrag.NewService(artifacts, sdkvector.NewMemoryStore(), fakeEmbedder{}, nil)
	knowledgeService := New(database, iamService, artifacts, ragService)

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
		iam:            iamService,
		adminPrincipal: principal,
		orgID:          boot.Organizations[0].ID,
	}
}

// addMember attaches a second user to the same org under the given role and
// returns their resolved principal, for permission-boundary tests.
func (env testEnv) addMember(t *testing.T, role string) *iam.Principal {
	t.Helper()
	email := role + "@example.com"
	user, err := env.iam.CreateUser(context.Background(), env.adminPrincipal, iam.CreateUserParams{
		Email:          email,
		Password:       "password123",
		DisplayName:    role,
		OrganizationID: env.orgID,
		Role:           role,
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
