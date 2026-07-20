package knowledge_test

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/knowledge"
	"github.com/KPO-Tech/seshat/pkg/rag"
	"github.com/KPO-Tech/seshat/pkg/storage"
	"github.com/KPO-Tech/seshat/pkg/vector"
)

// ─── Helpers ─────────────────────────────────────────────────────────────────

// fakeEmbedder returns a constant unit vector so tests don't need a live
// embedding API.
type fakeEmbedder struct{}

func (fakeEmbedder) EmbedTexts(_ context.Context, texts []string) ([][]float32, error) {
	out := make([][]float32, len(texts))
	for i := range texts {
		out[i] = []float32{1, 0, 0}
	}
	return out, nil
}

func openTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Open(
		context.Background(),
		db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")),
	)
	require.NoError(t, err, "open test db")
	t.Cleanup(func() { _ = database.Close() })
	return database
}

func newTestArtifactStore(t *testing.T) storage.ArtifactStore {
	t.Helper()
	p, err := storage.NewLocalProviderWithConfig(storage.Config{
		Provider:  storage.ProviderLocal,
		LocalPath: t.TempDir(),
	})
	require.NoError(t, err, "local storage provider")
	return storage.NewArtifactStore(p)
}

func newTestService(t *testing.T, database *db.DB, artifacts storage.ArtifactStore) *knowledge.Service {
	t.Helper()
	corpusStore, err := db.NewCorpusStore(database)
	require.NoError(t, err)
	fileStore, err := db.NewFileStore(database)
	require.NoError(t, err)
	jobStore, err := db.NewKnowledgeIngestionJobStore(database)
	require.NoError(t, err)

	vs := vector.NewMemoryStore()
	ragSvc := rag.NewService(artifacts, vs, fakeEmbedder{}, nil)

	return knowledge.NewService(corpusStore, fileStore, jobStore, artifacts, ragSvc)
}

// testPrincipal constructs a minimal authenticated user for service calls.
func testPrincipal(userID string) *backendauth.Principal {
	return &backendauth.Principal{
		User:  backendauth.User{ID: userID},
		Roles: []string{"member"},
	}
}

// seedFile uploads blob content to the artifact store and creates a DB file
// record. Returns the file ID.
func seedFile(
	t *testing.T,
	ctx context.Context,
	database *db.DB,
	artifacts storage.ArtifactStore,
	userID, filename, content string,
) string {
	t.Helper()
	key := "files/" + userID + "/" + filename
	_, err := artifacts.Put(ctx, key, []byte(content), "text/plain")
	require.NoError(t, err, "store artifact")

	fileStore, err := db.NewFileStore(database)
	require.NoError(t, err)
	f, err := fileStore.Create(ctx, db.CreateFileParams{
		UserID:      userID,
		Filename:    filename,
		ContentType: "text/plain",
		Size:        int64(len(content)),
		StorageKey:  key,
	})
	require.NoError(t, err, "create file record")
	return f.ID
}

// ─── Service tests ───────────────────────────────────────────────────────────

func TestService_CreateAndGetCorpus(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	principal := testPrincipal("user-1")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "my corpus"})
	require.NoError(t, err)
	require.NotEmpty(t, corpus.ID)
	require.Equal(t, "my corpus", corpus.Name)

	got, err := svc.GetCorpus(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Equal(t, corpus.ID, got.ID)
}

func TestService_AttachFile_AutoEnqueuesJob(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	principal := testPrincipal("user-2")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "docs"})
	require.NoError(t, err)

	fileID := seedFile(t, ctx, database, artifacts, "user-2", "readme.txt", "Hello world content for testing RAG ingestion.")

	cf, err := svc.AttachFile(ctx, principal, corpus.ID, fileID)
	require.NoError(t, err)
	require.Equal(t, db.CorpusFileStatusPending, cf.Status)

	// An ingestion job must have been auto-created.
	jobs, err := svc.ListIngestionJobs(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Len(t, jobs, 1, "AttachFile must auto-enqueue one ingestion job")
	require.Equal(t, db.IngestionJobStatusPending, jobs[0].Status)
	require.Equal(t, fileID, jobs[0].FileID)
}

func TestService_AttachFile_IdempotentJob(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	principal := testPrincipal("user-3")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "docs"})
	require.NoError(t, err)

	fileID := seedFile(t, ctx, database, artifacts, "user-3", "notes.txt", "Some notes.")

	_, err = svc.AttachFile(ctx, principal, corpus.ID, fileID)
	require.NoError(t, err)

	// Explicitly enqueueing again must not create a second job.
	_, err = svc.EnqueueIngest(ctx, principal, knowledge.IngestParams{CorpusID: corpus.ID, FileID: fileID})
	require.NoError(t, err)

	jobs, err := svc.ListIngestionJobs(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Len(t, jobs, 1, "duplicate enqueue must not create a second job")
}

func TestService_ProcessNextIngestionJob_CompletesJob(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	principal := testPrincipal("user-4")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "kb"})
	require.NoError(t, err)

	content := "Paragraph one.\n\nParagraph two.\n\nParagraph three."
	fileID := seedFile(t, ctx, database, artifacts, "user-4", "doc.txt", content)

	_, err = svc.AttachFile(ctx, principal, corpus.ID, fileID)
	require.NoError(t, err)

	// Process the job.
	processed, err := svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)
	require.True(t, processed, "expected one job to be processed")

	// Job must be completed.
	jobs, err := svc.ListIngestionJobs(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Len(t, jobs, 1)
	require.Equal(t, db.IngestionJobStatusCompleted, jobs[0].Status)
	require.Greater(t, jobs[0].ChunkCount, 0)

	// Corpus file must be ingested with chunk count > 0.
	files, err := svc.ListFiles(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Len(t, files, 1)
	require.Equal(t, db.CorpusFileStatusIngested, files[0].Status)
	require.Greater(t, files[0].ChunkCount, 0)
}

func TestService_ProcessNextIngestionJob_NoJobs(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)

	processed, err := svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)
	require.False(t, processed, "empty queue must return false")
}

func TestService_Search_AfterIngest(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	principal := testPrincipal("user-5")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "search-kb"})
	require.NoError(t, err)

	fileID := seedFile(t, ctx, database, artifacts, "user-5", "page.txt",
		"The quick brown fox jumps over the lazy dog.\n\nSecond paragraph about AI.")

	_, err = svc.AttachFile(ctx, principal, corpus.ID, fileID)
	require.NoError(t, err)

	_, err = svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)

	resp, err := svc.Search(ctx, principal, knowledge.SearchParams{
		CorpusID: corpus.ID,
		Query:    "fox",
		TopK:     5,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Greater(t, len(resp.Results), 0, "should find chunks after ingest")
}

func TestService_DetachFile_ClearsVectors(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	principal := testPrincipal("user-6")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "temp"})
	require.NoError(t, err)

	fileID := seedFile(t, ctx, database, artifacts, "user-6", "temp.txt", "Temporary content.")

	_, err = svc.AttachFile(ctx, principal, corpus.ID, fileID)
	require.NoError(t, err)

	_, err = svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)

	err = svc.DetachFile(ctx, principal, corpus.ID, fileID)
	require.NoError(t, err)

	files, err := svc.ListFiles(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Empty(t, files, "file should be removed from corpus after detach")
}

// ─── Runner tests ─────────────────────────────────────────────────────────────

func TestRunner_ProcessesAllPendingJobs(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	principal := testPrincipal("user-r1")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "runner-kb"})
	require.NoError(t, err)

	// Seed three files.
	for i, text := range []string{
		"First document content.",
		"Second document content.",
		"Third document content.",
	} {
		name := filepath.Join("file", string(rune('a'+i))+".txt")
		fileID := seedFile(t, ctx, database, artifacts, "user-r1", name, text)
		_, err = svc.AttachFile(ctx, principal, corpus.ID, fileID)
		require.NoError(t, err)
	}

	runner := knowledge.NewRunner(svc, knowledge.RunnerConfig{
		PollInterval:    20 * time.Millisecond,
		MaxPollInterval: 200 * time.Millisecond,
		MaxPerTick:      4,
	})
	runner.Start(ctx)

	// Wait until all three jobs are completed.
	require.Eventually(t, func() bool {
		jobs, err := svc.ListIngestionJobs(ctx, principal, corpus.ID)
		if err != nil || len(jobs) != 3 {
			return false
		}
		for _, j := range jobs {
			if j.Status != db.IngestionJobStatusCompleted {
				return false
			}
		}
		return true
	}, 8*time.Second, 50*time.Millisecond, "runner must process all 3 jobs")
}

func TestRunner_StopsOnContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)

	runner := knowledge.NewRunner(svc, knowledge.RunnerConfig{
		PollInterval:    20 * time.Millisecond,
		MaxPollInterval: 100 * time.Millisecond,
	})
	runner.Start(ctx)

	cancel()
	// Give the goroutine a moment to exit; the test just checks no panic/hang.
	time.Sleep(50 * time.Millisecond)
}
