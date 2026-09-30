package knowledge

import (
	"context"
	"testing"
)

func TestSetRerankerSettingEncryptsTheAPIKeyAtRest(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	setting, err := env.knowledge.SetRerankerSetting(context.Background(), env.adminPrincipal, env.orgID, SetRerankerSettingParams{
		BaseURL: "https://api.langsearch.com/v1/rerank",
		Model:   "langsearch-reranker-v1",
		APIKey:  "ls-super-secret",
		Enabled: true,
	})
	if err != nil {
		t.Fatalf("set reranker setting: %v", err)
	}
	if !setting.HasAPIKey {
		t.Fatal("expected has_api_key to be true")
	}

	var stored struct{ EncryptedAPIKey string }
	if err := env.db.Gorm().Table("reranker_settings").Select("encrypted_api_key").Where("id = ?", setting.ID).Scan(&stored).Error; err != nil {
		t.Fatalf("read stored row: %v", err)
	}
	if stored.EncryptedAPIKey == "" || stored.EncryptedAPIKey == "ls-super-secret" {
		t.Fatalf("expected the API key to be encrypted at rest, got %q", stored.EncryptedAPIKey)
	}
	decrypted, err := decryptSecret(env.db.Gorm(), env.orgID, stored.EncryptedAPIKey)
	if err != nil {
		t.Fatalf("decrypt stored key: %v", err)
	}
	if decrypted != "ls-super-secret" {
		t.Fatalf("expected decryption to round-trip the original key, got %q", decrypted)
	}
}

func TestSetRerankerSettingIsUpsertNotDuplicate(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	first, err := env.knowledge.SetRerankerSetting(context.Background(), env.adminPrincipal, env.orgID, SetRerankerSettingParams{
		BaseURL: "http://tei-rerank/rerank", Model: "BAAI/bge-reranker-v2-m3", Enabled: true,
	})
	if err != nil {
		t.Fatalf("first set: %v", err)
	}
	second, err := env.knowledge.SetRerankerSetting(context.Background(), env.adminPrincipal, env.orgID, SetRerankerSettingParams{
		BaseURL: "https://api.cohere.com/v2/rerank", Model: "rerank-v3.5", APIKey: "co-key", Enabled: true,
	})
	if err != nil {
		t.Fatalf("second set: %v", err)
	}
	if second.ID != first.ID {
		t.Fatalf("expected the second Set to update the same singleton row, got a different id: %s vs %s", second.ID, first.ID)
	}
	if second.BaseURL != "https://api.cohere.com/v2/rerank" || second.Model != "rerank-v3.5" {
		t.Fatalf("expected the update to take effect, got %+v", second)
	}

	var count int64
	if err := env.db.Gorm().Table("reranker_settings").Where("organization_id = ?", env.orgID).Count(&count).Error; err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly one reranker_settings row per organization, found %d", count)
	}
}

func TestRerankerSettingRequiresKnowledgeManage(t *testing.T) {
	env := newTestEnv(t)
	memberPrincipal := env.addMember(t, "member")

	if _, err := env.knowledge.SetRerankerSetting(context.Background(), memberPrincipal, env.orgID, SetRerankerSettingParams{
		BaseURL: "http://tei-rerank/rerank", Enabled: true,
	}); err == nil {
		t.Fatal("expected a member without knowledge.manage to be denied setting the reranker")
	}
}

func TestResolveRerankerConfigReturnsOrgSettingWhenEnabled(t *testing.T) {
	env := newTestEnv(t)

	_, ok, err := env.knowledge.resolveRerankerConfig(context.Background(), env.orgID)
	if err != nil {
		t.Fatalf("resolve with none configured: %v", err)
	}
	if ok {
		t.Fatal("expected no reranker to resolve before one is set")
	}

	if _, err := env.knowledge.SetRerankerSetting(context.Background(), env.adminPrincipal, env.orgID, SetRerankerSettingParams{
		BaseURL: "http://tei-rerank/rerank", Model: "BAAI/bge-reranker-v2-m3", Enabled: true,
	}); err != nil {
		t.Fatalf("set reranker: %v", err)
	}
	cfg, ok, err := env.knowledge.resolveRerankerConfig(context.Background(), env.orgID)
	if err != nil || !ok {
		t.Fatalf("expected the org's own reranker to resolve: ok=%v err=%v", ok, err)
	}
	if cfg.BaseURL != "http://tei-rerank/rerank" || cfg.Model != "BAAI/bge-reranker-v2-m3" {
		t.Fatalf("unexpected resolved config: %+v", cfg)
	}
}

// TestResolveRerankerConfigSkipsDisabledSetting proves a disabled setting
// (kept on record, e.g. temporarily turned off) doesn't resolve - ok=false
// here is what tells ragServiceFor to fall back to the platform-wide
// RAG_RERANK_* env var instead, same as "no setting at all".
func TestResolveRerankerConfigSkipsDisabledSetting(t *testing.T) {
	env := newTestEnv(t)

	if _, err := env.knowledge.SetRerankerSetting(context.Background(), env.adminPrincipal, env.orgID, SetRerankerSettingParams{
		BaseURL: "http://tei-rerank/rerank", Model: "BAAI/bge-reranker-v2-m3", Enabled: false,
	}); err != nil {
		t.Fatalf("set disabled reranker: %v", err)
	}
	_, ok, err := env.knowledge.resolveRerankerConfig(context.Background(), env.orgID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Fatal("expected a disabled reranker setting to not resolve")
	}
}

func TestDeleteRerankerSetting(t *testing.T) {
	env := newTestEnv(t)

	if _, err := env.knowledge.SetRerankerSetting(context.Background(), env.adminPrincipal, env.orgID, SetRerankerSettingParams{
		BaseURL: "http://tei-rerank/rerank", Enabled: true,
	}); err != nil {
		t.Fatalf("set reranker: %v", err)
	}
	if err := env.knowledge.DeleteRerankerSetting(context.Background(), env.adminPrincipal, env.orgID); err != nil {
		t.Fatalf("delete reranker: %v", err)
	}
	if _, err := env.knowledge.GetRerankerSetting(context.Background(), env.adminPrincipal, env.orgID); err == nil {
		t.Fatal("expected GetRerankerSetting to fail after delete")
	}
	_, ok, err := env.knowledge.resolveRerankerConfig(context.Background(), env.orgID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Fatal("expected resolution to fail after delete")
	}
}
