package knowledge

import (
	"context"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

const (
	testEncryptionEnvVar = "SESHAT_SERVER_ENCRYPTION_KEY"
	testEncryptionKey    = "g/t9EsDxTTJSTu6Q+Kne06PBHoGmhH3yAJaEuHmFl9A="
)

func TestSetEmbedderSettingEncryptsTheAPIKeyAtRest(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	setting, err := env.knowledge.SetEmbedderSetting(context.Background(), env.adminPrincipal, env.orgID, SetEmbedderSettingParams{
		Provider: "OpenAI", // mixed case on purpose — should be normalized
		Model:    "text-embedding-3-small",
		BaseURL:  "https://api.openai.com/v1",
		APIKey:   "sk-embed-super-secret",
	})
	if err != nil {
		t.Fatalf("set embedder setting: %v", err)
	}
	if setting.Provider != "openai" {
		t.Fatalf("expected provider to be normalized to lowercase, got %q", setting.Provider)
	}

	var stored struct{ EncryptedAPIKey string }
	if err := env.db.Gorm().Table("embedder_settings").Select("encrypted_api_key").Where("id = ?", setting.ID).Scan(&stored).Error; err != nil {
		t.Fatalf("read stored row: %v", err)
	}
	if stored.EncryptedAPIKey == "" || stored.EncryptedAPIKey == "sk-embed-super-secret" {
		t.Fatalf("expected the API key to be encrypted at rest, got %q", stored.EncryptedAPIKey)
	}
	decrypted, err := decryptSecret(stored.EncryptedAPIKey)
	if err != nil {
		t.Fatalf("decrypt stored key: %v", err)
	}
	if decrypted != "sk-embed-super-secret" {
		t.Fatalf("expected decryption to round-trip the original key, got %q", decrypted)
	}
}

func TestSetEmbedderSettingIsUpsertNotDuplicate(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	first, err := env.knowledge.SetEmbedderSetting(context.Background(), env.adminPrincipal, env.orgID, SetEmbedderSettingParams{
		Provider: "openai", Model: "text-embedding-3-small", BaseURL: "https://api.openai.com/v1", APIKey: "sk-original",
	})
	if err != nil {
		t.Fatalf("first set: %v", err)
	}
	second, err := env.knowledge.SetEmbedderSetting(context.Background(), env.adminPrincipal, env.orgID, SetEmbedderSettingParams{
		Provider: "ollama", Model: "nomic-embed-text", BaseURL: "http://localhost:11434",
	})
	if err != nil {
		t.Fatalf("second set: %v", err)
	}
	if second.ID != first.ID {
		t.Fatalf("expected the second Set to update the same singleton row, got a different id: %s vs %s", second.ID, first.ID)
	}
	if second.Provider != "ollama" || second.Model != "nomic-embed-text" {
		t.Fatalf("expected the update to take effect, got %+v", second)
	}

	// APIKey omitted on the second call (switching to ollama, which needs
	// none) — the previously stored key is kept as-is, but no longer used
	// since the provider changed; this is fine, it's simply orphaned data.
	var count int64
	if err := env.db.Gorm().Table("embedder_settings").Where("organization_id = ?", env.orgID).Count(&count).Error; err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly one embedder_settings row per organization, found %d", count)
	}
}

func TestEmbedderSettingRequiresKnowledgeManage(t *testing.T) {
	env := newTestEnv(t)
	memberPrincipal := env.addMember(t, "member")

	if _, err := env.knowledge.SetEmbedderSetting(context.Background(), memberPrincipal, env.orgID, SetEmbedderSettingParams{
		Provider: "openai", Model: "text-embedding-3-small", BaseURL: "https://api.openai.com/v1",
	}); err == nil {
		t.Fatal("expected a member without knowledge.manage to be denied setting the embedder")
	}
}

func TestResolveEmbedderConfigPrefersOrgOverPlatformDefault(t *testing.T) {
	env := newTestEnv(t)

	defaultOrg, err := env.iam.CreateOrganization(context.Background(), env.adminPrincipal, iam.CreateOrganizationParams{
		Name: "Default Org", Slug: "default-org",
	})
	if err != nil {
		t.Fatalf("create default org: %v", err)
	}
	if _, err := env.iam.SetOrganizationDefault(context.Background(), env.adminPrincipal, defaultOrg.ID, true); err != nil {
		t.Fatalf("set organization default: %v", err)
	}
	if _, err := env.knowledge.SetEmbedderSetting(context.Background(), env.adminPrincipal, defaultOrg.ID, SetEmbedderSettingParams{
		Provider: "openai", Model: "platform-default-model", BaseURL: "https://platform.example.com",
	}); err != nil {
		t.Fatalf("set embedder on the default org: %v", err)
	}

	cfg, ok, err := env.knowledge.resolveEmbedderConfig(context.Background(), env.orgID)
	if err != nil || !ok {
		t.Fatalf("expected fallback to the default organization: ok=%v err=%v", ok, err)
	}
	if cfg.Model != "platform-default-model" {
		t.Fatalf("expected the default org's model, got %q", cfg.Model)
	}

	if _, err := env.knowledge.SetEmbedderSetting(context.Background(), env.adminPrincipal, env.orgID, SetEmbedderSettingParams{
		Provider: "openai", Model: "org-own-model", BaseURL: "https://org.example.com",
	}); err != nil {
		t.Fatalf("set org embedder: %v", err)
	}
	cfg, ok, err = env.knowledge.resolveEmbedderConfig(context.Background(), env.orgID)
	if err != nil || !ok {
		t.Fatalf("expected a resolved embedder config: ok=%v err=%v", ok, err)
	}
	if cfg.Model != "org-own-model" {
		t.Fatalf("expected the organization's own embedder to win over the platform default, got %q", cfg.Model)
	}

	_, ok, err = env.knowledge.resolveEmbedderConfig(context.Background(), "some-other-org-with-nothing-configured")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok {
		t.Fatal("expected a different organization with no embedder of its own to still resolve the platform default")
	}
}

func TestResolveEmbedderConfigHonorsShareEmbedderSettingsOptOut(t *testing.T) {
	env := newTestEnv(t)

	defaultOrg, err := env.iam.CreateOrganization(context.Background(), env.adminPrincipal, iam.CreateOrganizationParams{
		Name: "Default Org", Slug: "default-org",
	})
	if err != nil {
		t.Fatalf("create default org: %v", err)
	}
	if _, err := env.iam.SetOrganizationDefault(context.Background(), env.adminPrincipal, defaultOrg.ID, true); err != nil {
		t.Fatalf("set organization default: %v", err)
	}
	if _, err := env.knowledge.SetEmbedderSetting(context.Background(), env.adminPrincipal, defaultOrg.ID, SetEmbedderSettingParams{
		Provider: "openai", Model: "platform-default-model", BaseURL: "https://platform.example.com",
	}); err != nil {
		t.Fatalf("set embedder on the default org: %v", err)
	}
	shareEmbedderSettings := false
	if _, err := env.iam.SetOrganizationSharedDomains(context.Background(), env.adminPrincipal, defaultOrg.ID, nil, &shareEmbedderSettings, nil, nil); err != nil {
		t.Fatalf("opt out of sharing embedder settings: %v", err)
	}

	_, ok, err := env.knowledge.resolveEmbedderConfig(context.Background(), env.orgID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Fatal("expected the fallback to be skipped once the default org opted out of sharing embedder settings")
	}
}
