package connectors

import (
	"context"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
)

// fakeConnectorWithRefresh extends fakeConnector with a tokenRefreshReporter
// implementation, standing in for confluenceConnector without a real
// Atlassian tenant - proves processSyncJob's persistence path actually
// writes a rotated pair back to the account row.
type fakeConnectorWithRefresh struct {
	fakeConnector
	newAccessToken  string
	newRefreshToken string
	newExpiry       time.Time
}

func (f *fakeConnectorWithRefresh) RefreshedToken() (accessToken, refreshToken string, expiry time.Time, ok bool) {
	return f.newAccessToken, f.newRefreshToken, f.newExpiry, true
}

func TestProcessSyncJobPersistsRotatedRefreshToken(t *testing.T) {
	env := newTestEnv(t)
	env.knowledge.WithDocling(nil)

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, knowledge.CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Wiki Docs",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}
	account, err := env.connectors.CreateS3Account(context.Background(), env.adminPrincipal, CreateS3AccountParams{
		OrganizationID: env.orgID, CorpusID: corpus.ID, DisplayName: "Stand-in account",
		Bucket: "n/a", Endpoint: "https://example.com", AccessKeyID: "old-access", SecretAccessKey: "old-refresh",
	})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}

	newExpiry := time.Now().Add(time.Hour).UTC().Truncate(time.Second)
	env.connectors.connectorOverrides = map[string]knowledgeConnector{
		"s3": &fakeConnectorWithRefresh{
			fakeConnector:   fakeConnector{nextCursor: "cursor-1"},
			newAccessToken:  "rotated-access",
			newRefreshToken: "rotated-refresh",
			newExpiry:       newExpiry,
		},
	}

	if _, err := env.connectors.TriggerSync(context.Background(), env.adminPrincipal, account.ID); err != nil {
		t.Fatalf("trigger sync: %v", err)
	}
	processed, err := env.connectors.ProcessNextConnectorSyncJob(context.Background())
	if err != nil || !processed {
		t.Fatalf("process sync job: processed=%v err=%v", processed, err)
	}

	var record sdb.ConnectorAccount
	if err := env.connectors.db.Gorm().WithContext(context.Background()).First(&record, "id = ?", account.ID).Error; err != nil {
		t.Fatalf("reload account: %v", err)
	}
	accessToken, err := sdb.DecryptSecret(env.connectors.db.Gorm(), env.orgID, record.AccessTokenEncrypted)
	if err != nil {
		t.Fatalf("decrypt access token: %v", err)
	}
	if accessToken != "rotated-access" {
		t.Fatalf("expected the rotated access token to be persisted, got %q", accessToken)
	}
	refreshToken, err := sdb.DecryptSecret(env.connectors.db.Gorm(), env.orgID, record.RefreshTokenEncrypted)
	if err != nil {
		t.Fatalf("decrypt refresh token: %v", err)
	}
	if refreshToken != "rotated-refresh" {
		t.Fatalf("expected the rotated refresh token to be persisted, got %q", refreshToken)
	}
	if record.ExpiresAt == nil || !record.ExpiresAt.Equal(newExpiry) {
		t.Fatalf("expected expires_at to be updated to %v, got %v", newExpiry, record.ExpiresAt)
	}
}

// TestProcessSyncJobLeavesTokenUnchangedWithoutReporter proves the
// tokenRefreshReporter type-assert is a true no-op for every connector kind
// that doesn't implement it (every kind except confluence, today) - the
// plain fakeConnector used by every other test in this package doesn't
// implement RefreshedToken at all.
func TestProcessSyncJobLeavesTokenUnchangedWithoutReporter(t *testing.T) {
	env := newTestEnv(t)
	env.knowledge.WithDocling(nil)

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, knowledge.CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Docs",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}
	account, err := env.connectors.CreateS3Account(context.Background(), env.adminPrincipal, CreateS3AccountParams{
		OrganizationID: env.orgID, CorpusID: corpus.ID, DisplayName: "Bucket",
		Bucket: "b", Endpoint: "https://example.com", AccessKeyID: "orig-access", SecretAccessKey: "orig-refresh",
	})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}
	env.connectors.connectorOverrides = map[string]knowledgeConnector{"s3": &fakeConnector{nextCursor: "cursor-1"}}

	if _, err := env.connectors.TriggerSync(context.Background(), env.adminPrincipal, account.ID); err != nil {
		t.Fatalf("trigger sync: %v", err)
	}
	if _, err := env.connectors.ProcessNextConnectorSyncJob(context.Background()); err != nil {
		t.Fatalf("process sync job: %v", err)
	}

	var record sdb.ConnectorAccount
	if err := env.connectors.db.Gorm().WithContext(context.Background()).First(&record, "id = ?", account.ID).Error; err != nil {
		t.Fatalf("reload account: %v", err)
	}
	accessToken, err := sdb.DecryptSecret(env.connectors.db.Gorm(), env.orgID, record.AccessTokenEncrypted)
	if err != nil {
		t.Fatalf("decrypt access token: %v", err)
	}
	if accessToken != "orig-access" {
		t.Fatalf("expected the access token to stay unchanged, got %q", accessToken)
	}
}
