package connectors

import (
	"context"
	"fmt"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
)

// fakeRateLimitError satisfies syncRateLimited (coreconnectors.RateLimited)
// structurally - no need to import pkg/connectors just to construct
// one for a test.
type fakeRateLimitError struct{ delay time.Duration }

func (e *fakeRateLimitError) Error() string                     { return "rate limited" }
func (e *fakeRateLimitError) RetryAfter() (time.Duration, bool) { return e.delay, true }

// rateLimitedFakeConnector fails every Sync/RefreshPermissions call with a
// fakeRateLimitError carrying a distinctive, easy-to-assert-on delay.
type rateLimitedFakeConnector struct {
	fakeConnector
	delay time.Duration
}

func (f *rateLimitedFakeConnector) Sync(ctx context.Context, account syncAccount, secret syncSecret, cursor string) ([]syncItem, string, error) {
	return nil, "", &fakeRateLimitError{delay: f.delay}
}

func (f *rateLimitedFakeConnector) RefreshPermissions(ctx context.Context, secret syncSecret, externalResourceIDs []string) (map[string][]accessEntry, error) {
	return nil, &fakeRateLimitError{delay: f.delay}
}

func TestProcessContentSyncJobHonorsRateLimitDelayAndLeavesAccountHealthy(t *testing.T) {
	env := newTestEnv(t)
	env.knowledge.WithDocumentReader(nil)
	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, knowledge.CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Rate Limited Docs",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}
	account, err := env.connectors.CreateS3Account(context.Background(), env.adminPrincipal, CreateS3AccountParams{
		OrganizationID: env.orgID, CorpusID: corpus.ID, DisplayName: "Bucket",
		Bucket: "b", Endpoint: "https://example.com", AccessKeyID: "k", SecretAccessKey: "s",
	})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}

	distinctiveDelay := 7 * time.Minute // well outside the flat defaultSyncRetryDelay (2s)
	env.connectors.connectorOverrides = map[string]knowledgeConnector{
		"s3": &rateLimitedFakeConnector{delay: distinctiveDelay},
	}

	job, err := env.connectors.TriggerSync(context.Background(), env.adminPrincipal, account.ID)
	if err != nil {
		t.Fatalf("trigger sync: %v", err)
	}
	before := time.Now().UTC()
	if _, err := env.connectors.ProcessNextConnectorSyncJob(context.Background()); err != nil {
		t.Fatalf("process sync job: %v", err)
	}

	var reloadedJob sdb.ConnectorSyncJob
	if err := env.connectors.db.Gorm().WithContext(context.Background()).First(&reloadedJob, "id = ?", job.ID).Error; err != nil {
		t.Fatalf("reload job: %v", err)
	}
	if reloadedJob.Status != SyncJobStatusQueued {
		t.Fatalf("expected the job to be re-queued for retry, got status=%q", reloadedJob.Status)
	}
	if reloadedJob.NextRunAt == nil {
		t.Fatal("expected NextRunAt to be set")
	}
	gotDelay := reloadedJob.NextRunAt.Sub(before)
	// Allow a little slack for test execution time, but this must be
	// clearly the 7-minute suggested delay, not the flat 2s default.
	if gotDelay < 6*time.Minute || gotDelay > 8*time.Minute {
		t.Fatalf("expected NextRunAt ~7m out, got %v", gotDelay)
	}
	if reloadedJob.LastError == "" {
		t.Fatal("expected a descriptive last_error")
	}

	var reloadedAccount sdb.ConnectorAccount
	if err := env.connectors.db.Gorm().WithContext(context.Background()).First(&reloadedAccount, "id = ?", account.ID).Error; err != nil {
		t.Fatalf("reload account: %v", err)
	}
	if reloadedAccount.Status != StatusConnected {
		t.Fatalf("expected rate-limiting to leave the account status untouched (still %q), got %q", StatusConnected, reloadedAccount.Status)
	}
	if reloadedAccount.LastError != "" {
		t.Fatalf("expected rate-limiting to leave the account's last_error untouched, got %q", reloadedAccount.LastError)
	}
}

func TestProcessPermissionSyncJobHonorsRateLimitDelay(t *testing.T) {
	env := newTestEnv(t)
	account, corpusID := setUpAccountWithSyncedFiles(t, env, []syncItem{
		{ResourceRef: resourceRef{ID: "file-1", Name: "doc1.txt"}, Text: "content", ContentType: "text/plain"},
	})

	distinctiveDelay := 5 * time.Minute
	env.connectors.connectorOverrides = map[string]knowledgeConnector{
		"s3": &rateLimitedFakeConnector{delay: distinctiveDelay},
	}

	job, err := env.connectors.enqueuePermissionSyncJob(context.Background(), env.orgID, corpusID, account.ID)
	if err != nil {
		t.Fatalf("enqueue permission sync job: %v", err)
	}
	before := time.Now().UTC()
	if _, err := env.connectors.ProcessNextConnectorSyncJob(context.Background()); err != nil {
		t.Fatalf("process permission sync job: %v", err)
	}

	var reloadedJob sdb.ConnectorSyncJob
	if err := env.connectors.db.Gorm().WithContext(context.Background()).First(&reloadedJob, "id = ?", job.ID).Error; err != nil {
		t.Fatalf("reload job: %v", err)
	}
	if reloadedJob.Status != SyncJobStatusQueued {
		t.Fatalf("expected the job to be re-queued for retry, got status=%q", reloadedJob.Status)
	}
	gotDelay := reloadedJob.NextRunAt.Sub(before)
	if gotDelay < 4*time.Minute || gotDelay > 6*time.Minute {
		t.Fatalf("expected NextRunAt ~5m out, got %v", gotDelay)
	}

	var reloadedAccount sdb.ConnectorAccount
	if err := env.connectors.db.Gorm().WithContext(context.Background()).First(&reloadedAccount, "id = ?", account.ID).Error; err != nil {
		t.Fatalf("reload account: %v", err)
	}
	if reloadedAccount.Status != StatusConnected || reloadedAccount.LastError != "" {
		t.Fatalf("expected rate-limiting to leave the account healthy, got status=%q last_error=%q", reloadedAccount.Status, reloadedAccount.LastError)
	}
}

func TestRateLimitedDelayClampsExtremeValues(t *testing.T) {
	tooSmall, ok := rateLimitedDelay(&fakeRateLimitError{delay: 0})
	if !ok || tooSmall != minRateLimitRetryDelay {
		t.Fatalf("expected a zero/near-zero delay to clamp up to %v, got (%v, %v)", minRateLimitRetryDelay, tooSmall, ok)
	}
	tooLarge, ok := rateLimitedDelay(&fakeRateLimitError{delay: 24 * time.Hour})
	if !ok || tooLarge != maxRateLimitRetryDelay {
		t.Fatalf("expected a 24h delay to clamp down to %v, got (%v, %v)", maxRateLimitRetryDelay, tooLarge, ok)
	}
	if _, ok := rateLimitedDelay(fmt.Errorf("plain error, not rate limited")); ok {
		t.Fatal("expected a plain error to report ok=false")
	}
}
