package knowledge

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	sdkdocling "github.com/EngineerProjects/seshat/pkg/docling"
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

// newTestEnv bootstraps a fresh in-memory database, an iam.Service and a
// knowledge.Service backed by a local-disk artifact store (a temp dir) and
// an in-memory vector store — mirroring automation's own newTestEnv shape.
// No embedder is configured by default; use configurePlatformEmbedder for
// tests that need the full ingest/search pipeline working.
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
	knowledgeService := New(database, iamService, artifacts, sdkvector.NewMemoryStore())

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

// startFakeEmbeddingServer serves an OpenAI-compatible POST /embeddings
// endpoint, returning a small deterministic vector per input text derived
// from a byte sum — real HTTP round-trip, no external network. Registered
// as t.Cleanup so it's torn down automatically.
func startFakeEmbeddingServer(t *testing.T) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Input []string `json:"input"`
			Model string   `json:"model"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		type embeddingItem struct {
			Embedding []float32 `json:"embedding"`
		}
		data := make([]embeddingItem, 0, len(req.Input))
		for _, text := range req.Input {
			vec := make([]float32, 8)
			for i, r := range text {
				vec[i%len(vec)] += float32(r % 97)
			}
			data = append(data, embeddingItem{Embedding: vec})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": data})
	}))
	t.Cleanup(server.Close)
	return server
}

// configurePlatformEmbedder sets the platform-wide default embedder to
// point at a fresh fake embedding server, so Ingest/Search/ProcessNextIngestionJob
// work end-to-end without any real embedding API.
func (env testEnv) configurePlatformEmbedder(t *testing.T) {
	t.Helper()
	server := startFakeEmbeddingServer(t)
	if _, err := env.knowledge.SetPlatformEmbedderSetting(context.Background(), env.adminPrincipal, SetEmbedderSettingParams{
		Provider: "openai",
		Model:    "fake-embed",
		BaseURL:  server.URL,
	}); err != nil {
		t.Fatalf("configure platform embedder: %v", err)
	}
}

// startFakeDoclingServer serves the two docling-serve endpoints this
// package's client actually calls: GET /health (availability check) and
// POST /v1/convert/file (returns markdownContent verbatim, regardless of
// what was uploaded — good enough to prove the wiring picks docling's
// output over raw-byte extraction, without needing the real Python service).
func startFakeDoclingServer(t *testing.T, markdownContent string) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("POST /v1/convert/file", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status": "success",
			"document": map[string]any{
				"md_content": markdownContent,
				"pages":      []any{},
				"pictures":   []any{},
			},
		})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

// configureDocling attaches a fake docling-serve client that always
// returns markdownContent for any binary-format file.
func (env testEnv) configureDocling(t *testing.T, markdownContent string) {
	t.Helper()
	server := startFakeDoclingServer(t, markdownContent)
	env.knowledge.WithDocling(sdkdocling.NewClient(server.URL))
}
