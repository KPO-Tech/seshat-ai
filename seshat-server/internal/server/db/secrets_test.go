package db

import (
	"path/filepath"
	"testing"
)

const (
	secretsTestEncryptionEnvVar = "SESHAT_SERVER_ENCRYPTION_KEY"
	secretsTestEncryptionKey    = "g/t9EsDxTTJSTu6Q+Kne06PBHoGmhH3yAJaEuHmFl9A="
)

func openSecretsTestDB(t *testing.T) *DB {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "state.db")
	database, err := Open(Config{Driver: DriverSQLite, DSN: dbPath})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return database
}

func TestEncryptSecretRoundTrips(t *testing.T) {
	t.Setenv(secretsTestEncryptionEnvVar, secretsTestEncryptionKey)
	database := openSecretsTestDB(t)

	stored, err := EncryptSecret(database.Gorm(), "org_a", "sk-super-secret")
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	if stored == "sk-super-secret" {
		t.Fatal("expected the stored value to not be the plaintext")
	}
	plaintext, err := DecryptSecret(database.Gorm(), "org_a", stored)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if plaintext != "sk-super-secret" {
		t.Fatalf("expected round-trip to recover the original plaintext, got %q", plaintext)
	}
}

// TestDecryptSecretFailsForTheWrongOrganization is the concrete proof of the
// whole point of this chantier: a secret encrypted for one organization's
// DEK must not be decryptable as another organization's, even though both
// organizations exist in the same database under the same master key.
func TestDecryptSecretFailsForTheWrongOrganization(t *testing.T) {
	t.Setenv(secretsTestEncryptionEnvVar, secretsTestEncryptionKey)
	database := openSecretsTestDB(t)

	stored, err := EncryptSecret(database.Gorm(), "org_a", "sk-org-a-secret")
	if err != nil {
		t.Fatalf("encrypt for org_a: %v", err)
	}
	if _, err := DecryptSecret(database.Gorm(), "org_b", stored); err == nil {
		t.Fatal("expected decrypting org_a's secret under org_b's DEK to fail")
	}
	// org_a itself must still work - proves the failure above is real
	// tenant isolation, not a general breakage.
	plaintext, err := DecryptSecret(database.Gorm(), "org_a", stored)
	if err != nil {
		t.Fatalf("decrypt for the correct organization: %v", err)
	}
	if plaintext != "sk-org-a-secret" {
		t.Fatalf("expected org_a's own decrypt to still work, got %q", plaintext)
	}
}

func TestEncryptSecretReusesTheSameDEKForAnOrganization(t *testing.T) {
	t.Setenv(secretsTestEncryptionEnvVar, secretsTestEncryptionKey)
	database := openSecretsTestDB(t)

	first, err := EncryptSecret(database.Gorm(), "org_a", "secret-one")
	if err != nil {
		t.Fatalf("encrypt first: %v", err)
	}
	second, err := EncryptSecret(database.Gorm(), "org_a", "secret-two")
	if err != nil {
		t.Fatalf("encrypt second: %v", err)
	}

	var count int64
	if err := database.Gorm().Model(&OrganizationDataKey{}).Where("organization_id = ?", "org_a").Count(&count).Error; err != nil {
		t.Fatalf("count DEK rows: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly one OrganizationDataKey row for org_a, found %d", count)
	}

	p1, err := DecryptSecret(database.Gorm(), "org_a", first)
	if err != nil || p1 != "secret-one" {
		t.Fatalf("decrypt first: %q, %v", p1, err)
	}
	p2, err := DecryptSecret(database.Gorm(), "org_a", second)
	if err != nil || p2 != "secret-two" {
		t.Fatalf("decrypt second: %q, %v", p2, err)
	}
}

// TestGetOrCreateOrganizationDEKIsSafeAgainstConcurrentCreation reproduces
// two callers racing an organization's very first secret - same style as
// automation.Scheduler's multi-instance-safety test: no real goroutines
// (SQLite's single-connection pool would just serialize them, proving
// nothing), instead directly exercising the create-or-ignore-then-reread
// sequence twice in a row and asserting both calls converge on one DEK.
func TestGetOrCreateOrganizationDEKIsSafeAgainstConcurrentCreation(t *testing.T) {
	t.Setenv(secretsTestEncryptionEnvVar, secretsTestEncryptionKey)
	database := openSecretsTestDB(t)

	dek1, err := getOrCreateOrganizationDEK(database.Gorm(), "org_a")
	if err != nil {
		t.Fatalf("first getOrCreateOrganizationDEK: %v", err)
	}
	dek2, err := getOrCreateOrganizationDEK(database.Gorm(), "org_a")
	if err != nil {
		t.Fatalf("second (racing) getOrCreateOrganizationDEK: %v", err)
	}
	if string(dek1) != string(dek2) {
		t.Fatal("expected both callers to converge on the same DEK, got two different keys")
	}

	var count int64
	if err := database.Gorm().Model(&OrganizationDataKey{}).Where("organization_id = ?", "org_a").Count(&count).Error; err != nil {
		t.Fatalf("count DEK rows: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly one OrganizationDataKey row despite two concurrent creators, found %d", count)
	}
}

func TestDecryptSecretNeverCreatesADEK(t *testing.T) {
	t.Setenv(secretsTestEncryptionEnvVar, secretsTestEncryptionKey)
	database := openSecretsTestDB(t)

	if _, err := DecryptSecret(database.Gorm(), "org_never_encrypted_anything", "enc:v2:bogus"); err == nil {
		t.Fatal("expected decrypting for an organization with no DEK to fail")
	}
	var count int64
	if err := database.Gorm().Model(&OrganizationDataKey{}).Where("organization_id = ?", "org_never_encrypted_anything").Count(&count).Error; err != nil {
		t.Fatalf("count DEK rows: %v", err)
	}
	if count != 0 {
		t.Fatal("expected DecryptSecret to never create a DEK as a side effect of failing to find one")
	}
}

func TestDecryptSecretPassesThroughEmptyAndPlaintextValues(t *testing.T) {
	t.Setenv(secretsTestEncryptionEnvVar, secretsTestEncryptionKey)
	database := openSecretsTestDB(t)

	if v, err := DecryptSecret(database.Gorm(), "org_a", ""); err != nil || v != "" {
		t.Fatalf("expected empty input to pass through as empty, got %q, %v", v, err)
	}
	if v, err := DecryptSecret(database.Gorm(), "org_a", "not-encrypted-at-all"); err != nil || v != "not-encrypted-at-all" {
		t.Fatalf("expected a value without the enc:v2: prefix to pass through unchanged, got %q, %v", v, err)
	}
}
