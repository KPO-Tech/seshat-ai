package connectors

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
)

func TestUpdateAccountExposesAndEditsS3Config(t *testing.T) {
	env := newTestEnv(t)
	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, knowledge.CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Docs",
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
		AccessKeyID:     "AKIA_ORIGINAL",
		SecretAccessKey: "original-secret",
	})
	if err != nil {
		t.Fatalf("create s3 account: %v", err)
	}

	// The config just set at creation must round-trip back out through
	// ListAccounts/toConnectorAccount - this was the gap being closed:
	// Config existed in the DB but was never exposed via the API type.
	listed, err := env.connectors.ListAccounts(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list accounts: %v", err)
	}
	if len(listed) != 1 || listed[0].Bucket != "vendor-docs" || listed[0].Endpoint != "https://s3.example.com" {
		t.Fatalf("expected the s3 config to be exposed on the listed account, got %+v", listed)
	}

	updated, err := env.connectors.UpdateAccount(context.Background(), env.adminPrincipal, account.ID, UpdateAccountParams{
		DisplayName:         "Renamed Bucket",
		Bucket:              "vendor-docs-v2",
		Endpoint:            "https://s3.example.com",
		Prefix:              "docs/",
		SyncIntervalSeconds: 7200,
	})
	if err != nil {
		t.Fatalf("update s3 account without rotating credentials: %v", err)
	}
	if updated.DisplayName != "Renamed Bucket" || updated.Bucket != "vendor-docs-v2" || updated.Prefix != "docs/" || updated.SyncIntervalSeconds != 7200 {
		t.Fatalf("expected the updated config to be reflected, got %+v", updated)
	}

	var record sdb.ConnectorAccount
	if err := env.connectors.db.Gorm().First(&record, "id = ?", account.ID).Error; err != nil {
		t.Fatalf("reload account: %v", err)
	}
	accessToken, err := sdb.DecryptSecret(env.connectors.db.Gorm(), env.orgID, record.AccessTokenEncrypted)
	if err != nil {
		t.Fatalf("decrypt access token: %v", err)
	}
	if accessToken != "AKIA_ORIGINAL" {
		t.Fatalf("expected leaving credentials blank to keep the original access key, got %q", accessToken)
	}

	// Now rotate the credentials for real.
	if _, err := env.connectors.UpdateAccount(context.Background(), env.adminPrincipal, account.ID, UpdateAccountParams{
		DisplayName:     "Renamed Bucket",
		Bucket:          "vendor-docs-v2",
		Endpoint:        "https://s3.example.com",
		AccessKeyID:     "AKIA_ROTATED",
		SecretAccessKey: "rotated-secret",
	}); err != nil {
		t.Fatalf("update s3 account rotating credentials: %v", err)
	}
	if err := env.connectors.db.Gorm().First(&record, "id = ?", account.ID).Error; err != nil {
		t.Fatalf("reload account after rotation: %v", err)
	}
	accessToken, err = sdb.DecryptSecret(env.connectors.db.Gorm(), env.orgID, record.AccessTokenEncrypted)
	if err != nil {
		t.Fatalf("decrypt rotated access token: %v", err)
	}
	if accessToken != "AKIA_ROTATED" {
		t.Fatalf("expected the rotated access key to be persisted, got %q", accessToken)
	}
}

func TestUpdateAccountRejectsOAuthKindsAndHalfCredentialPairs(t *testing.T) {
	env := newTestEnv(t)
	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, knowledge.CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Docs",
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
		AccessKeyID:     "AKIA_ORIGINAL",
		SecretAccessKey: "original-secret",
	})
	if err != nil {
		t.Fatalf("create s3 account: %v", err)
	}

	if _, err := env.connectors.UpdateAccount(context.Background(), env.adminPrincipal, account.ID, UpdateAccountParams{
		DisplayName: "Renamed",
		Bucket:      "vendor-docs",
		Endpoint:    "https://s3.example.com",
		AccessKeyID: "only-half-the-pair",
	}); err == nil {
		t.Fatal("expected providing only access_key_id without secret_access_key to be rejected")
	}

	if _, err := env.connectors.UpdateAccount(context.Background(), env.adminPrincipal, "does-not-exist", UpdateAccountParams{DisplayName: "x"}); err == nil {
		t.Fatal("expected updating an unknown account id to fail")
	}

	// An OAuth-based kind (gdrive here) has no static config to edit -
	// inserted directly rather than via the real OAuth flow, since only
	// UpdateAccount's own kind-branching is under test here.
	oauthID, err := newID("connacc")
	if err != nil {
		t.Fatalf("new id: %v", err)
	}
	oauthAccount := sdb.ConnectorAccount{
		ID:              oauthID,
		OrganizationID:  env.orgID,
		CorpusID:        &corpus.ID,
		CreatedByUserID: env.adminPrincipal.User.ID,
		Kind:            "gdrive",
		Purpose:         PurposeKnowledgeSync,
		DisplayName:     "Some Drive",
		Status:          StatusConnected,
	}
	if err := env.connectors.db.Gorm().Create(&oauthAccount).Error; err != nil {
		t.Fatalf("insert fake gdrive account: %v", err)
	}
	if _, err := env.connectors.UpdateAccount(context.Background(), env.adminPrincipal, oauthID, UpdateAccountParams{DisplayName: "Renamed Drive"}); err == nil {
		t.Fatal("expected updating an OAuth-based (gdrive) account to be rejected - it has no static config here")
	}
}
