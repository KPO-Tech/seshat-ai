package connectors

import (
	"context"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
)

// fakeConnector stands in for a real knowledgeConnector (S3, gdrive, ...) so
// the sync-job -> IngestFromConnector wiring can be tested without a real
// external API. Installed via Service.connectorOverrides, test-only.
type fakeConnector struct {
	items      []syncItem
	nextCursor string
}

func (f *fakeConnector) Kind() connectorKind { return "s3" }

func (f *fakeConnector) Discover(ctx context.Context, account syncAccount, secret syncSecret) ([]resourceRef, error) {
	return nil, nil
}

func (f *fakeConnector) Sync(ctx context.Context, account syncAccount, secret syncSecret, cursor string) ([]syncItem, string, error) {
	return f.items, f.nextCursor, nil
}

func TestCreateS3AccountSyncIngestsIntoCorpus(t *testing.T) {
	env := newTestEnv(t)
	env.knowledge.WithDocling(nil) // plain-text extraction only, no docling needed for this test

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, knowledge.CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Vendor Docs",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	account, err := env.connectors.CreateS3Account(context.Background(), env.adminPrincipal, CreateS3AccountParams{
		OrganizationID:  env.orgID,
		CorpusID:        corpus.ID,
		DisplayName:     "Vendor Bucket",
		Bucket:          "vendor-docs",
		Endpoint:        "https://s3.example.com",
		AccessKeyID:     "AKIA_FAKE",
		SecretAccessKey: "fake-secret",
	})
	if err != nil {
		t.Fatalf("create s3 account: %v", err)
	}
	if account.Status != StatusConnected {
		t.Fatalf("expected a newly created s3 account to be connected immediately, got %q", account.Status)
	}

	env.connectors.connectorOverrides = map[string]knowledgeConnector{
		"s3": &fakeConnector{
			items: []syncItem{
				{resourceRef: resourceRef{ID: "docs/policy.txt", Name: "policy.txt"}, Text: "Refunds are processed within 14 business days."},
				{resourceRef: resourceRef{ID: "docs/faq.txt", Name: "faq.txt"}, Text: "Contact support@example.com for help."},
			},
			nextCursor: "cursor-1",
		},
	}

	job, err := env.connectors.TriggerSync(context.Background(), env.adminPrincipal, account.ID)
	if err != nil {
		t.Fatalf("trigger sync: %v", err)
	}
	if job.Status != SyncJobStatusQueued {
		t.Fatalf("expected a freshly triggered sync to be queued, got %q", job.Status)
	}

	// Triggering again while one is already queued must not create a
	// second job - same dedup contract as knowledge's enqueueIngestionJob.
	again, err := env.connectors.TriggerSync(context.Background(), env.adminPrincipal, account.ID)
	if err != nil {
		t.Fatalf("trigger sync again: %v", err)
	}
	if again.ID != job.ID {
		t.Fatalf("expected triggering sync twice to return the same queued job, got %q and %q", job.ID, again.ID)
	}

	processed, err := env.connectors.ProcessNextConnectorSyncJob(context.Background())
	if err != nil {
		t.Fatalf("process sync job: %v", err)
	}
	if !processed {
		t.Fatal("expected a queued sync job to be processed")
	}

	jobs, err := env.connectors.ListSyncJobs(context.Background(), env.adminPrincipal, account.ID)
	if err != nil {
		t.Fatalf("list sync jobs: %v", err)
	}
	if len(jobs) != 1 || jobs[0].Status != SyncJobStatusCompleted || jobs[0].ItemsSynced != 2 {
		t.Fatalf("expected one completed job with 2 items synced, got %+v", jobs)
	}

	files, err := env.knowledge.ListFiles(context.Background(), env.adminPrincipal, corpus.ID)
	if err != nil {
		t.Fatalf("list corpus files: %v", err)
	}
	if len(files) != 2 {
		t.Fatalf("expected 2 corpus files from the synced items, got %d", len(files))
	}
	for _, f := range files {
		if f.Source != "connector" {
			t.Fatalf("expected connector-synced files to report source=connector, got %+v", f)
		}
	}

	// Re-syncing the same items must upsert in place, not duplicate.
	processed, err = env.connectors.ProcessNextConnectorSyncJob(context.Background())
	if err != nil || processed {
		t.Fatalf("expected no job left to process, got processed=%v err=%v", processed, err)
	}
	if _, err := env.connectors.TriggerSync(context.Background(), env.adminPrincipal, account.ID); err != nil {
		t.Fatalf("trigger second sync: %v", err)
	}
	if _, err := env.connectors.ProcessNextConnectorSyncJob(context.Background()); err != nil {
		t.Fatalf("process second sync job: %v", err)
	}
	filesAfterResync, err := env.knowledge.ListFiles(context.Background(), env.adminPrincipal, corpus.ID)
	if err != nil {
		t.Fatalf("list corpus files after resync: %v", err)
	}
	if len(filesAfterResync) != 2 {
		t.Fatalf("expected re-sync to upsert in place (still 2 files), got %d", len(filesAfterResync))
	}

	if err := env.connectors.DeleteAccount(context.Background(), env.adminPrincipal, account.ID); err != nil {
		t.Fatalf("delete account: %v", err)
	}
	accounts, err := env.connectors.ListAccounts(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list accounts: %v", err)
	}
	if len(accounts) != 0 {
		t.Fatalf("expected no accounts left after delete, got %+v", accounts)
	}
	// Deleting the account must not retroactively delete already-ingested
	// files - see DeleteAccount's doc comment.
	filesAfterDelete, err := env.knowledge.ListFiles(context.Background(), env.adminPrincipal, corpus.ID)
	if err != nil {
		t.Fatalf("list corpus files after account delete: %v", err)
	}
	if len(filesAfterDelete) != 2 {
		t.Fatalf("expected connector-synced files to survive account deletion, got %d", len(filesAfterDelete))
	}
}

func TestCreateS3AccountValidation(t *testing.T) {
	env := newTestEnv(t)
	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, knowledge.CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Docs",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	cases := []struct {
		name   string
		params CreateS3AccountParams
	}{
		{"missing display name", CreateS3AccountParams{OrganizationID: env.orgID, CorpusID: corpus.ID, Bucket: "b", Endpoint: "http://e", AccessKeyID: "k", SecretAccessKey: "s"}},
		{"missing credentials", CreateS3AccountParams{OrganizationID: env.orgID, CorpusID: corpus.ID, DisplayName: "d", Bucket: "b", Endpoint: "http://e"}},
		{"missing bucket/endpoint", CreateS3AccountParams{OrganizationID: env.orgID, CorpusID: corpus.ID, DisplayName: "d", AccessKeyID: "k", SecretAccessKey: "s"}},
		{"unknown corpus", CreateS3AccountParams{OrganizationID: env.orgID, CorpusID: "does-not-exist", DisplayName: "d", Bucket: "b", Endpoint: "http://e", AccessKeyID: "k", SecretAccessKey: "s"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := env.connectors.CreateS3Account(context.Background(), env.adminPrincipal, tc.params); err == nil {
				t.Fatalf("expected %s to be rejected", tc.name)
			}
		})
	}
}
