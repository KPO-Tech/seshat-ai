package automation

import (
	"context"
	"testing"
)

const (
	testEncryptionEnvVar = "SESHAT_SERVER_ENCRYPTION_KEY"
	testEncryptionKey    = "g/t9EsDxTTJSTu6Q+Kne06PBHoGmhH3yAJaEuHmFl9A="
)

func TestCreateProviderSettingEncryptsTheAPIKeyAtRest(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	setting, err := env.automation.CreateProviderSetting(context.Background(), env.adminPrincipal, CreateProviderSettingParams{
		OrganizationID: env.orgID,
		Provider:       "Anthropic", // mixed case on purpose — should be normalized
		DefaultModel:   "claude-sonnet-5",
		APIKey:         "sk-ant-super-secret",
	})
	if err != nil {
		t.Fatalf("create provider setting: %v", err)
	}
	if setting.Provider != "anthropic" {
		t.Fatalf("expected provider to be normalized to lowercase, got %q", setting.Provider)
	}

	// The raw API key must never appear on the DTO or in the stored row.
	var stored struct{ EncryptedAPIKey string }
	if err := env.db.Gorm().Table("provider_settings").Select("encrypted_api_key").Where("id = ?", setting.ID).Scan(&stored).Error; err != nil {
		t.Fatalf("read stored row: %v", err)
	}
	if stored.EncryptedAPIKey == "" || stored.EncryptedAPIKey == "sk-ant-super-secret" {
		t.Fatalf("expected the API key to be encrypted at rest, got %q", stored.EncryptedAPIKey)
	}

	decrypted, err := decryptSecret(stored.EncryptedAPIKey)
	if err != nil {
		t.Fatalf("decrypt stored key: %v", err)
	}
	if decrypted != "sk-ant-super-secret" {
		t.Fatalf("expected decryption to round-trip the original key, got %q", decrypted)
	}
}

func TestCreateProviderSettingWithoutEncryptionKeyFails(t *testing.T) {
	env := newTestEnv(t) // SESHAT_SERVER_ENCRYPTION_KEY deliberately not set

	if _, err := env.automation.CreateProviderSetting(context.Background(), env.adminPrincipal, CreateProviderSettingParams{
		OrganizationID: env.orgID,
		Provider:       "anthropic",
		DefaultModel:   "claude-sonnet-5",
		APIKey:         "sk-ant-super-secret",
	}); err == nil {
		t.Fatal("expected creating a provider setting without an encryption key configured to fail")
	}
}

func TestCreateProviderSettingRejectsDuplicateProvider(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	params := CreateProviderSettingParams{OrganizationID: env.orgID, Provider: "openai", DefaultModel: "gpt-5", APIKey: "sk-1"}
	if _, err := env.automation.CreateProviderSetting(context.Background(), env.adminPrincipal, params); err != nil {
		t.Fatalf("first create: %v", err)
	}
	if _, err := env.automation.CreateProviderSetting(context.Background(), env.adminPrincipal, params); err == nil {
		t.Fatal("expected a second provider setting for the same (org, provider) to be rejected")
	}
}

func TestProviderSettingsPermissionBoundary(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	memberPrincipal := env.addMember(t, "member")

	if _, err := env.automation.CreateProviderSetting(context.Background(), memberPrincipal, CreateProviderSettingParams{
		OrganizationID: env.orgID, Provider: "anthropic", DefaultModel: "claude-sonnet-5", APIKey: "sk-ant-x",
	}); err == nil {
		t.Fatal("expected a member without provider_settings.manage to be denied creating one")
	}

	setting, err := env.automation.CreateProviderSetting(context.Background(), env.adminPrincipal, CreateProviderSettingParams{
		OrganizationID: env.orgID, Provider: "anthropic", DefaultModel: "claude-sonnet-5", APIKey: "sk-ant-x",
	})
	if err != nil {
		t.Fatalf("create as admin: %v", err)
	}

	// Scoped visibility, like every other list endpoint: empty, not 403.
	settings, err := env.automation.ListProviderSettings(context.Background(), memberPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("unexpected error listing provider settings as member: %v", err)
	}
	if len(settings) != 0 {
		t.Fatalf("expected a member without provider_settings.read to see no settings, got %d", len(settings))
	}

	if _, err := env.automation.UpdateProviderSetting(context.Background(), memberPrincipal, setting.ID, UpdateProviderSettingParams{DefaultModel: "claude-haiku-5"}); err == nil {
		t.Fatal("expected a member to be denied updating a provider setting")
	}
	if err := env.automation.DeleteProviderSetting(context.Background(), memberPrincipal, setting.ID); err == nil {
		t.Fatal("expected a member to be denied deleting a provider setting")
	}
}

func TestGetProviderSettingNeverExposesTheAPIKey(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	setting, err := env.automation.CreateProviderSetting(context.Background(), env.adminPrincipal, CreateProviderSettingParams{
		OrganizationID: env.orgID, Provider: "anthropic", DefaultModel: "claude-sonnet-5", APIKey: "sk-ant-should-never-leak",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	fetched, err := env.automation.GetProviderSetting(context.Background(), env.adminPrincipal, setting.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	// ProviderSetting (the DTO) has no APIKey field at all — this is a
	// compile-time guarantee, not a runtime redaction, but assert the
	// fields we do expose are the right ones as a sanity check.
	if fetched.Provider != "anthropic" || fetched.DefaultModel != "claude-sonnet-5" {
		t.Fatalf("unexpected fetched setting: %+v", fetched)
	}
}

func TestUpdateProviderSettingKeepsExistingKeyWhenNotSupplied(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	setting, err := env.automation.CreateProviderSetting(context.Background(), env.adminPrincipal, CreateProviderSettingParams{
		OrganizationID: env.orgID, Provider: "anthropic", DefaultModel: "claude-sonnet-5", APIKey: "sk-ant-original",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := env.automation.UpdateProviderSetting(context.Background(), env.adminPrincipal, setting.ID, UpdateProviderSettingParams{
		DefaultModel: "claude-opus-5",
	}); err != nil {
		t.Fatalf("update without api_key: %v", err)
	}

	record, ok, err := env.automation.findProviderSetting(context.Background(), env.orgID, "anthropic")
	if err != nil || !ok {
		t.Fatalf("find provider setting: ok=%v err=%v", ok, err)
	}
	decrypted, err := decryptSecret(record.EncryptedAPIKey)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if decrypted != "sk-ant-original" {
		t.Fatalf("expected the original key to be preserved, got %q", decrypted)
	}
	if record.DefaultModel != "claude-opus-5" {
		t.Fatalf("expected default_model to be updated, got %q", record.DefaultModel)
	}
}
