package connectors

import (
	"context"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
)

// fakePermissionRefresher extends fakeConnector with a permissionRefresher
// implementation, standing in for gdriveConnector without a real Google
// account - records every batch of resourceIDs it's asked to refresh, and
// returns whatever refreshed map the test configured (an ID absent from
// that map simulates a failed/unconfirmed lookup for that resource).
type fakePermissionRefresher struct {
	fakeConnector
	refreshed    map[string][]accessEntry
	refreshCalls [][]string
}

func (f *fakePermissionRefresher) RefreshPermissions(_ context.Context, _ syncSecret, externalResourceIDs []string) (map[string][]accessEntry, error) {
	f.refreshCalls = append(f.refreshCalls, externalResourceIDs)
	return f.refreshed, nil
}

// setUpAccountWithSyncedFiles creates a corpus + connector account (kind
// "s3" - the fake's Kind() is fixed, only connectorOverrides["s3"] matters
// for dispatch) and runs one content sync so there are real CorpusFile rows
// linked to that account for a later permission-only pass to target.
func setUpAccountWithSyncedFiles(t *testing.T, env testEnv, items []syncItem) (*ConnectorAccount, string) {
	t.Helper()
	env.knowledge.WithDocling(nil)
	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, knowledge.CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Synced Docs",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}
	account, err := env.connectors.CreateS3Account(context.Background(), env.adminPrincipal, CreateS3AccountParams{
		OrganizationID: env.orgID, CorpusID: corpus.ID, DisplayName: "Stand-in account",
		Bucket: "n/a", Endpoint: "https://example.com", AccessKeyID: "k", SecretAccessKey: "s",
	})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}
	env.connectors.connectorOverrides = map[string]knowledgeConnector{
		"s3": &fakePermissionRefresher{fakeConnector: fakeConnector{items: items, nextCursor: "cursor-1"}},
	}
	if _, err := env.connectors.TriggerSync(context.Background(), env.adminPrincipal, account.ID); err != nil {
		t.Fatalf("trigger content sync: %v", err)
	}
	if processed, err := env.connectors.ProcessNextConnectorSyncJob(context.Background()); err != nil || !processed {
		t.Fatalf("process content sync job: processed=%v err=%v", processed, err)
	}
	return account, corpus.ID
}

func loadCorpusFileByExternalID(t *testing.T, env testEnv, externalResourceID string) sdb.CorpusFile {
	t.Helper()
	var file sdb.CorpusFile
	if err := env.connectors.db.Gorm().WithContext(context.Background()).
		First(&file, "external_resource_id = ?", externalResourceID).Error; err != nil {
		t.Fatalf("load corpus file %q: %v", externalResourceID, err)
	}
	return file
}

func TestPermissionSyncJobUpdatesOnlyExternalAccess(t *testing.T) {
	env := newTestEnv(t)
	items := []syncItem{
		{ResourceRef: resourceRef{ID: "file-1", Name: "doc1.txt"}, Text: "alpha content", ContentType: "text/plain"},
		{ResourceRef: resourceRef{ID: "file-2", Name: "doc2.txt"}, Text: "beta content", ContentType: "text/plain"},
	}
	account, _ := setUpAccountWithSyncedFiles(t, env, items)

	before1 := loadCorpusFileByExternalID(t, env, "file-1")
	before2 := loadCorpusFileByExternalID(t, env, "file-2")
	if len(before1.ExternalAccess) != 0 || len(before2.ExternalAccess) != 0 {
		t.Fatalf("expected no ExternalAccess yet (fake content sync reports none), got %+v / %+v", before1.ExternalAccess, before2.ExternalAccess)
	}

	refresher := &fakePermissionRefresher{
		fakeConnector: fakeConnector{},
		refreshed: map[string][]accessEntry{
			"file-1": {"user:alice@example.com"},
			// "file-2" deliberately absent - simulates a failed lookup.
		},
	}
	env.connectors.connectorOverrides = map[string]knowledgeConnector{"s3": refresher}

	if _, err := env.connectors.enqueuePermissionSyncJob(context.Background(), env.orgID, before1.CorpusID, account.ID); err != nil {
		t.Fatalf("enqueue permission sync job: %v", err)
	}
	processed, err := env.connectors.ProcessNextConnectorSyncJob(context.Background())
	if err != nil || !processed {
		t.Fatalf("process permission sync job: processed=%v err=%v", processed, err)
	}

	if len(refresher.refreshCalls) != 1 {
		t.Fatalf("expected exactly one RefreshPermissions call, got %d", len(refresher.refreshCalls))
	}
	gotIDs := refresher.refreshCalls[0]
	if len(gotIDs) != 2 {
		t.Fatalf("expected both known resource IDs to be requested, got %v", gotIDs)
	}

	after1 := loadCorpusFileByExternalID(t, env, "file-1")
	after2 := loadCorpusFileByExternalID(t, env, "file-2")

	if len(after1.ExternalAccess) != 1 || after1.ExternalAccess[0] != "user:alice@example.com" {
		t.Fatalf("expected file-1's ExternalAccess to be refreshed, got %+v", after1.ExternalAccess)
	}
	// file-2 was absent from the refreshed map (simulated failed lookup) -
	// must be left exactly as it was, not blanked/widened.
	if len(after2.ExternalAccess) != 0 {
		t.Fatalf("expected file-2's ExternalAccess to stay untouched after a failed lookup, got %+v", after2.ExternalAccess)
	}

	// Genuinely metadata-only: content/status/chunking fields untouched.
	if after1.Filename != before1.Filename || after1.ContentType != before1.ContentType ||
		after1.StorageKey != before1.StorageKey || after1.Status != before1.Status ||
		after1.ChunkCount != before1.ChunkCount {
		t.Fatalf("expected a permission-only sync to leave every other field untouched:\nbefore: %+v\nafter:  %+v", before1, after1)
	}

	// No new ingestion job should have been created by the permission pass.
	jobs, err := env.knowledge.ListIngestionJobs(context.Background(), env.adminPrincipal, before1.CorpusID)
	if err != nil {
		t.Fatalf("list ingestion jobs: %v", err)
	}
	if len(jobs) != 2 { // one per file, from the original content sync only
		t.Fatalf("expected no new ingestion jobs from the permission-only pass, got %d", len(jobs))
	}
}

func TestPermissionSyncJobRejectsConnectorWithoutCapability(t *testing.T) {
	env := newTestEnv(t)
	account, corpusID := setUpAccountWithSyncedFiles(t, env, nil)

	// Swap in a plain fakeConnector (no RefreshPermissions) for the same kind.
	env.connectors.connectorOverrides = map[string]knowledgeConnector{"s3": &fakeConnector{}}

	job, err := env.connectors.enqueuePermissionSyncJob(context.Background(), env.orgID, corpusID, account.ID)
	if err != nil {
		t.Fatalf("enqueue permission sync job: %v", err)
	}
	if _, err := env.connectors.ProcessNextConnectorSyncJob(context.Background()); err != nil {
		t.Fatalf("process permission sync job: %v", err)
	}

	var record sdb.ConnectorSyncJob
	if err := env.connectors.db.Gorm().WithContext(context.Background()).First(&record, "id = ?", job.ID).Error; err != nil {
		t.Fatalf("reload sync job: %v", err)
	}
	if record.Status != SyncJobStatusQueued && record.Status != SyncJobStatusFailed {
		t.Fatalf("expected the job to fail (or be re-queued for retry) rather than silently succeed, got status=%q", record.Status)
	}
	if record.LastError == "" {
		t.Fatal("expected a descriptive last_error explaining the missing capability")
	}
}

func TestEnqueueContentAndPermissionSyncJobsAreIndependent(t *testing.T) {
	env := newTestEnv(t)
	account, corpusID := setUpAccountWithSyncedFiles(t, env, nil)

	// A queued content job for this account must not block enqueuing (or
	// dedup against) a permissions job for the same account, and vice
	// versa - the two kinds are independent per enqueueSyncJobOfKind.
	if _, err := env.connectors.enqueueSyncJob(context.Background(), env.orgID, corpusID, account.ID); err != nil {
		t.Fatalf("enqueue content sync job: %v", err)
	}
	permJob, err := env.connectors.enqueuePermissionSyncJob(context.Background(), env.orgID, corpusID, account.ID)
	if err != nil {
		t.Fatalf("enqueue permission sync job: %v", err)
	}
	if permJob.SyncKind != SyncJobKindPermissions {
		t.Fatalf("expected the enqueued job's SyncKind to be %q, got %q", SyncJobKindPermissions, permJob.SyncKind)
	}

	var jobs []sdb.ConnectorSyncJob
	if err := env.connectors.db.Gorm().WithContext(context.Background()).
		Where("connector_account_id = ? AND status IN ?", account.ID, []string{SyncJobStatusQueued, SyncJobStatusRunning}).
		Find(&jobs).Error; err != nil {
		t.Fatalf("list queued/running jobs: %v", err)
	}
	if len(jobs) != 2 {
		t.Fatalf("expected one content job and one permissions job to coexist, got %d: %+v", len(jobs), jobs)
	}
}

func TestReapDueAccountsSchedulesPermissionSyncForCapableConnector(t *testing.T) {
	env := newTestEnv(t)
	account, _ := setUpAccountWithSyncedFiles(t, env, nil)
	// setUpAccountWithSyncedFiles's override is a fakePermissionRefresher -
	// capable. Backdate NextPermissionSyncAt so ReapDueAccounts finds it due.
	past := time.Now().UTC().Add(-time.Hour)
	if err := env.connectors.db.Gorm().WithContext(context.Background()).Model(&sdb.ConnectorAccount{}).
		Where("id = ?", account.ID).
		Updates(map[string]any{"next_permission_sync_at": &past, "permission_sync_interval_seconds": 900}).Error; err != nil {
		t.Fatalf("backdate account: %v", err)
	}

	if err := env.connectors.ReapDueAccounts(context.Background()); err != nil {
		t.Fatalf("reap due accounts: %v", err)
	}

	var permJobs []sdb.ConnectorSyncJob
	if err := env.connectors.db.Gorm().WithContext(context.Background()).
		Where("connector_account_id = ? AND sync_kind = ?", account.ID, SyncJobKindPermissions).
		Find(&permJobs).Error; err != nil {
		t.Fatalf("list permission jobs: %v", err)
	}
	if len(permJobs) != 1 {
		t.Fatalf("expected exactly one permission-sync job for a capable, due account, got %d: %+v", len(permJobs), permJobs)
	}

	var reloaded sdb.ConnectorAccount
	if err := env.connectors.db.Gorm().WithContext(context.Background()).First(&reloaded, "id = ?", account.ID).Error; err != nil {
		t.Fatalf("reload account: %v", err)
	}
	if reloaded.NextPermissionSyncAt == nil || !reloaded.NextPermissionSyncAt.After(past) {
		t.Fatalf("expected NextPermissionSyncAt to be rescheduled forward, still %v (was %v)", reloaded.NextPermissionSyncAt, past)
	}
}

// Note: capability gating happens once, at account-creation time
// (CompleteConnectorOAuth only sets NextPermissionSyncAt for a connector
// that implements permissionRefresher in the first place - see oauth.go) -
// ReapDueAccounts itself just schedules whatever has a due
// NextPermissionSyncAt, and processPermissionSyncJob defensively re-checks
// the capability at process time (TestPermissionSyncJobRejectsConnectorWithoutCapability
// above covers that path failing clearly rather than silently).
