package automation

import (
	"context"
	"testing"
)

func TestCreatePlatformProviderSettingEncryptsTheAPIKeyAtRest(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	setting, err := env.automation.CreatePlatformProviderSetting(context.Background(), env.adminPrincipal, CreatePlatformProviderSettingParams{
		Provider:     "Anthropic", // mixed case on purpose — should be normalized
		DefaultModel: "claude-sonnet-5",
		APIKey:       "sk-ant-super-secret",
	})
	if err != nil {
		t.Fatalf("create platform provider setting: %v", err)
	}
	if setting.Provider != "anthropic" {
		t.Fatalf("expected provider to be normalized to lowercase, got %q", setting.Provider)
	}

	var stored struct{ EncryptedAPIKey string }
	if err := env.db.Gorm().Table("platform_provider_settings").Select("encrypted_api_key").Where("id = ?", setting.ID).Scan(&stored).Error; err != nil {
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

func TestCreatePlatformProviderSettingRejectsDuplicateProvider(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	params := CreatePlatformProviderSettingParams{Provider: "openai", DefaultModel: "gpt-5", APIKey: "sk-1"}
	if _, err := env.automation.CreatePlatformProviderSetting(context.Background(), env.adminPrincipal, params); err != nil {
		t.Fatalf("first create: %v", err)
	}
	if _, err := env.automation.CreatePlatformProviderSetting(context.Background(), env.adminPrincipal, params); err == nil {
		t.Fatal("expected a second platform provider setting for the same provider to be rejected")
	}
}

func TestPlatformProviderSettingsRequirePlatformAdmin(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	// An org owner is not a platform admin — this is the whole point of the
	// distinction: owning/managing an organization must not grant access to
	// the platform-wide default credentials every organization can fall
	// back to.
	ownerPrincipal := env.addMember(t, "owner")

	if _, err := env.automation.CreatePlatformProviderSetting(context.Background(), ownerPrincipal, CreatePlatformProviderSettingParams{
		Provider: "anthropic", DefaultModel: "claude-sonnet-5", APIKey: "sk-ant-x",
	}); err == nil {
		t.Fatal("expected an organization owner (not a platform admin) to be denied creating a platform provider setting")
	}

	setting, err := env.automation.CreatePlatformProviderSetting(context.Background(), env.adminPrincipal, CreatePlatformProviderSettingParams{
		Provider: "anthropic", DefaultModel: "claude-sonnet-5", APIKey: "sk-ant-x",
	})
	if err != nil {
		t.Fatalf("create as platform admin: %v", err)
	}

	// Unlike every org-scoped list endpoint, this is platform-admin-only —
	// a non-admin gets denied outright, not an empty list.
	if _, err := env.automation.ListPlatformProviderSettings(context.Background(), ownerPrincipal); err == nil {
		t.Fatal("expected an organization owner to be denied listing platform provider settings")
	}
	if _, err := env.automation.GetPlatformProviderSetting(context.Background(), ownerPrincipal, setting.ID); err == nil {
		t.Fatal("expected an organization owner to be denied getting a platform provider setting")
	}
	if _, err := env.automation.UpdatePlatformProviderSetting(context.Background(), ownerPrincipal, setting.ID, UpdatePlatformProviderSettingParams{DefaultModel: "claude-haiku-5"}); err == nil {
		t.Fatal("expected an organization owner to be denied updating a platform provider setting")
	}
	if err := env.automation.DeletePlatformProviderSetting(context.Background(), ownerPrincipal, setting.ID); err == nil {
		t.Fatal("expected an organization owner to be denied deleting a platform provider setting")
	}
}

func TestGetPlatformProviderSettingNeverExposesTheAPIKey(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	setting, err := env.automation.CreatePlatformProviderSetting(context.Background(), env.adminPrincipal, CreatePlatformProviderSettingParams{
		Provider: "anthropic", DefaultModel: "claude-sonnet-5", APIKey: "sk-ant-should-never-leak",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	fetched, err := env.automation.GetPlatformProviderSetting(context.Background(), env.adminPrincipal, setting.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if fetched.Provider != "anthropic" || fetched.DefaultModel != "claude-sonnet-5" {
		t.Fatalf("unexpected fetched setting: %+v", fetched)
	}
}

func TestUpdatePlatformProviderSettingKeepsExistingKeyWhenNotSupplied(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	setting, err := env.automation.CreatePlatformProviderSetting(context.Background(), env.adminPrincipal, CreatePlatformProviderSettingParams{
		Provider: "anthropic", DefaultModel: "claude-sonnet-5", APIKey: "sk-ant-original",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := env.automation.UpdatePlatformProviderSetting(context.Background(), env.adminPrincipal, setting.ID, UpdatePlatformProviderSettingParams{
		DefaultModel: "claude-opus-5",
	}); err != nil {
		t.Fatalf("update without api_key: %v", err)
	}

	record, ok, err := env.automation.findPlatformProviderSetting(context.Background(), "anthropic")
	if err != nil || !ok {
		t.Fatalf("find platform provider setting: ok=%v err=%v", ok, err)
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

func TestResolveProviderCredentialsPrefersOrgOverPlatformDefault(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	if _, err := env.automation.CreatePlatformProviderSetting(context.Background(), env.adminPrincipal, CreatePlatformProviderSettingParams{
		Provider: "anthropic", DefaultModel: "claude-sonnet-5", APIKey: "sk-platform-default",
	}); err != nil {
		t.Fatalf("create platform default: %v", err)
	}

	// No org-level setting yet: falls back to the platform default.
	key, _, ok, err := env.automation.resolveProviderCredentials(context.Background(), env.orgID, "anthropic")
	if err != nil || !ok {
		t.Fatalf("expected fallback to platform default: ok=%v err=%v", ok, err)
	}
	if decrypted, derr := decryptSecret(key); derr != nil || decrypted != "sk-platform-default" {
		t.Fatalf("expected the platform default key, got %q (err=%v)", decrypted, derr)
	}

	// Once the org configures its own, it must win over the platform default.
	if _, err := env.automation.CreateProviderSetting(context.Background(), env.adminPrincipal, CreateProviderSettingParams{
		OrganizationID: env.orgID, Provider: "anthropic", DefaultModel: "claude-sonnet-5", APIKey: "sk-org-own-key",
	}); err != nil {
		t.Fatalf("create org setting: %v", err)
	}
	key, _, ok, err = env.automation.resolveProviderCredentials(context.Background(), env.orgID, "anthropic")
	if err != nil || !ok {
		t.Fatalf("expected a resolved credential: ok=%v err=%v", ok, err)
	}
	if decrypted, derr := decryptSecret(key); derr != nil || decrypted != "sk-org-own-key" {
		t.Fatalf("expected the organization's own key to win over the platform default, got %q (err=%v)", decrypted, derr)
	}

	// A provider with neither an org setting nor a platform default resolves to nothing.
	_, _, ok, err = env.automation.resolveProviderCredentials(context.Background(), env.orgID, "openai")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Fatal("expected no credentials to resolve for a provider with neither an org nor a platform setting")
	}
}
