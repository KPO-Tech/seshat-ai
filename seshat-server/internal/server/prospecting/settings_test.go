package prospecting

import (
	"context"
	"testing"
	"time"
)

func TestSetSettingsEncryptsTheAPIKeyAtRest(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	settings, err := env.prospecting.SetSettings(context.Background(), env.adminPrincipal, env.orgID, SetSettingsParams{
		APIKey:   "AIza-super-secret-places-key",
		DailyCap: 500,
	})
	if err != nil {
		t.Fatalf("set settings: %v", err)
	}

	var stored struct{ EncryptedAPIKey string }
	if err := env.db.Gorm().Table("prospecting_settings").Select("encrypted_api_key").Where("id = ?", settings.ID).Scan(&stored).Error; err != nil {
		t.Fatalf("read stored row: %v", err)
	}
	if stored.EncryptedAPIKey == "" || stored.EncryptedAPIKey == "AIza-super-secret-places-key" {
		t.Fatalf("expected the API key to be encrypted at rest, got %q", stored.EncryptedAPIKey)
	}
	decrypted, err := decryptSecret(env.db.Gorm(), env.orgID, stored.EncryptedAPIKey)
	if err != nil {
		t.Fatalf("decrypt stored key: %v", err)
	}
	if decrypted != "AIza-super-secret-places-key" {
		t.Fatalf("expected decryption to round-trip the original key, got %q", decrypted)
	}
}

func TestSetSettingsIsUpsertAndKeepsKeyWhenOmitted(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	first, err := env.prospecting.SetSettings(context.Background(), env.adminPrincipal, env.orgID, SetSettingsParams{
		APIKey: "original-key", DailyCap: 100,
	})
	if err != nil {
		t.Fatalf("first set: %v", err)
	}
	second, err := env.prospecting.SetSettings(context.Background(), env.adminPrincipal, env.orgID, SetSettingsParams{
		DailyCap: 200, // no APIKey — must keep the existing one
	})
	if err != nil {
		t.Fatalf("second set: %v", err)
	}
	if second.ID != first.ID {
		t.Fatalf("expected the second Set to update the same singleton row, got a different id: %s vs %s", second.ID, first.ID)
	}
	if second.DailyCap != 200 {
		t.Fatalf("expected daily cap to update to 200, got %d", second.DailyCap)
	}

	var stored struct{ EncryptedAPIKey string }
	if err := env.db.Gorm().Table("prospecting_settings").Select("encrypted_api_key").Where("id = ?", first.ID).Scan(&stored).Error; err != nil {
		t.Fatalf("read stored row: %v", err)
	}
	decrypted, err := decryptSecret(env.db.Gorm(), env.orgID, stored.EncryptedAPIKey)
	if err != nil {
		t.Fatalf("decrypt stored key: %v", err)
	}
	if decrypted != "original-key" {
		t.Fatalf("expected the original key to be kept when omitted on update, got %q", decrypted)
	}

	var count int64
	if err := env.db.Gorm().Table("prospecting_settings").Where("organization_id = ?", env.orgID).Count(&count).Error; err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly one prospecting_settings row per organization, found %d", count)
	}
}

func TestSetSettingsRequiresAPIKeyOnCreate(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)

	if _, err := env.prospecting.SetSettings(context.Background(), env.adminPrincipal, env.orgID, SetSettingsParams{DailyCap: 100}); err == nil {
		t.Fatal("expected creating settings without an api_key to fail")
	}
}

func TestSettingsRequireProspectingManageOrRead(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	if _, err := env.prospecting.SetSettings(context.Background(), member, env.orgID, SetSettingsParams{APIKey: "x", DailyCap: 1}); err == nil {
		t.Fatal("expected a member without prospecting.manage to be denied setting the API key")
	}
	if _, err := env.prospecting.GetSettings(context.Background(), member, env.orgID); err == nil {
		t.Fatal("expected a member without prospecting.read/manage to be denied reading settings")
	}
}

func TestProspectingCacheIsSharedAcrossOrganizations(t *testing.T) {
	env := newTestEnv(t)
	cache := cacheAdapter{db: env.db}

	if err := cache.Set(context.Background(), "geocode:lille", "geocode", `{"label":"Lille"}`, 200, time.Hour); err != nil {
		t.Fatalf("set cache entry: %v", err)
	}

	// The same key, read back with no organization context at all — proves
	// the cache table has no organization scoping to bypass in the first
	// place, matching sdb.ProspectingCache's doc comment (deliberately
	// global: cached external-API data is factual, not tenant data).
	entry, found, err := cache.Get(context.Background(), "geocode:lille")
	if err != nil {
		t.Fatalf("get cache entry: %v", err)
	}
	if !found {
		t.Fatal("expected the cache entry to be found")
	}
	if entry.ValueJSON != `{"label":"Lille"}` {
		t.Fatalf("unexpected cached value: %q", entry.ValueJSON)
	}
}
