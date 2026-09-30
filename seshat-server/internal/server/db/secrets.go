package db

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	encryptionKeyEnvVar   = "SESHAT_SERVER_ENCRYPTION_KEY"
	encryptedSecretPrefix = "enc:v2:" // envelope-encrypted (per-organization DEK) - see OrganizationDataKey's doc comment. There is no v1 reader: the schema is still young enough that no production secret needs to survive this cutover (same reasoning as db.go's AutoMigrate doc comment).
)

// EncryptSecret encrypts plaintext under organizationID's own Data
// Encryption Key (creating one on first use), never the master key
// directly - see OrganizationDataKey's doc comment for why. gormDB should
// already carry the caller's context (e.g. tx inside an
// s.db.Transaction(...) callback, or s.db.Gorm().WithContext(ctx)) - same
// calling convention as iam.Service.CheckOrganizationPermission.
func EncryptSecret(gormDB *gorm.DB, organizationID, plaintext string) (string, error) {
	dek, err := getOrCreateOrganizationDEK(gormDB, organizationID)
	if err != nil {
		return "", err
	}
	gcm, err := newGCMWithKey(dek)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return encryptedSecretPrefix + base64.StdEncoding.EncodeToString(ciphertext), nil
}

// DecryptSecret decrypts stored using organizationID's own DEK - this must
// be the organization that actually owns the secret (whose DEK encrypted
// it), which is not always the "requesting" organization in a
// platform-default-fallback resolution (see the domain packages'
// ResolveProviderSetting-style functions - the fallback branch must pass
// the *default* organization's ID, not the caller's). Unlike
// EncryptSecret, this never creates a DEK: a missing one when a secret
// needs decrypting is a real data problem, not a case to paper over.
func DecryptSecret(gormDB *gorm.DB, organizationID, stored string) (string, error) {
	if stored == "" {
		return "", nil
	}
	if !strings.HasPrefix(stored, encryptedSecretPrefix) {
		return stored, nil
	}
	dek, err := getOrganizationDEK(gormDB, organizationID)
	if err != nil {
		return "", err
	}
	gcm, err := newGCMWithKey(dek)
	if err != nil {
		return "", err
	}
	data, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(stored, encryptedSecretPrefix))
	if err != nil {
		return "", fmt.Errorf("stored secret is not valid base64: %w", err)
	}
	if len(data) < gcm.NonceSize() {
		return "", fmt.Errorf("stored secret is corrupt")
	}
	nonce, ciphertext := data[:gcm.NonceSize()], data[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt stored secret: %w", err)
	}
	return string(plaintext), nil
}

// getOrCreateOrganizationDEK returns organizationID's Data Encryption Key,
// generating and persisting a fresh random one on first use. The
// create-or-ignore-then-reread sequence is safe under concurrent callers
// (different goroutines, or different seshat-server processes) racing the
// same organization's first-ever secret: at most one INSERT actually lands
// (OnConflict DoNothing on the primary key), and every caller - winner or
// not - always re-reads the row afterward, so they all converge on the
// same DEK regardless of who won. Same atomic-write-then-reread idiom as
// automation.Scheduler.queueAndReschedule's multi-instance-safety fix.
func getOrCreateOrganizationDEK(gormDB *gorm.DB, organizationID string) ([]byte, error) {
	if strings.TrimSpace(organizationID) == "" {
		return nil, fmt.Errorf("organization_id is required to encrypt a secret")
	}
	if existing, err := getOrganizationDEK(gormDB, organizationID); err == nil {
		return existing, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	rawDEK := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, rawDEK); err != nil {
		return nil, fmt.Errorf("generate data encryption key: %w", err)
	}
	encryptedDEK, err := encryptWithMasterKey(rawDEK)
	if err != nil {
		return nil, err
	}
	row := OrganizationDataKey{OrganizationID: organizationID, EncryptedDEK: encryptedDEK}
	if err := gormDB.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "organization_id"}}, DoNothing: true}).
		Create(&row).Error; err != nil {
		return nil, fmt.Errorf("create organization data key: %w", err)
	}
	// Re-read regardless of who won the race - see doc comment above.
	return getOrganizationDEK(gormDB, organizationID)
}

// getOrganizationDEK reads and decrypts organizationID's existing DEK.
// Returns gorm.ErrRecordNotFound (unwrapped, checked via errors.Is by
// getOrCreateOrganizationDEK) when none exists yet.
func getOrganizationDEK(gormDB *gorm.DB, organizationID string) ([]byte, error) {
	var row OrganizationDataKey
	if err := gormDB.First(&row, "organization_id = ?", organizationID).Error; err != nil {
		return nil, err
	}
	return decryptWithMasterKey(row.EncryptedDEK)
}

// encryptWithMasterKey/decryptWithMasterKey are used only to protect
// per-organization DEKs (see above) - never to encrypt a secret directly
// anymore. rawKey is a raw 32-byte key, not the "enc:v2:"-prefixed wire
// format EncryptSecret/DecryptSecret produce for actual secrets.
func encryptWithMasterKey(rawKey []byte) (string, error) {
	gcm, err := newMasterGCM()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, rawKey, nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func decryptWithMasterKey(stored string) ([]byte, error) {
	gcm, err := newMasterGCM()
	if err != nil {
		return nil, err
	}
	data, err := base64.StdEncoding.DecodeString(stored)
	if err != nil {
		return nil, fmt.Errorf("stored data key is not valid base64: %w", err)
	}
	if len(data) < gcm.NonceSize() {
		return nil, fmt.Errorf("stored data key is corrupt")
	}
	nonce, ciphertext := data[:gcm.NonceSize()], data[gcm.NonceSize():]
	rawKey, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt stored data key: %w", err)
	}
	return rawKey, nil
}

func HashOpaqueToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// NewToken returns a fresh cryptographically random opaque token, hex-encoded.
// Shared by iam and automation so both packages generate IDs and secrets the
// same way instead of maintaining their own copies.
func NewToken() (string, error) {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate random token: %w", err)
	}
	return hex.EncodeToString(buf), nil
}

// NewID returns a prefixed, human-recognizable record identifier
// (e.g. "usr_a1b2c3d4e5f6") built from a random token, never from a secret
// the caller also stores or presents as a credential.
func NewID(prefix string) (string, error) {
	token, err := NewToken()
	if err != nil {
		return "", err
	}
	return prefix + "_" + token[:12], nil
}

// NonNilStrings returns values unchanged, except a nil slice becomes an
// empty one — so a JSON column storing a string array always ends up as
// "[]" rather than "null" for a caller who passed nothing.
func NonNilStrings(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

// newMasterGCM builds an AEAD keyed by the single master key
// (SESHAT_SERVER_ENCRYPTION_KEY) - used only to protect per-organization
// DEKs (encryptWithMasterKey/decryptWithMasterKey), never to encrypt a
// secret directly.
func newMasterGCM() (cipher.AEAD, error) {
	key, err := masterKey()
	if err != nil {
		return nil, err
	}
	return newGCMWithKey(key)
}

// newGCMWithKey builds an AEAD keyed by an arbitrary 32-byte key - used for
// both the master key (via newMasterGCM) and a decrypted organization DEK
// (EncryptSecret/DecryptSecret).
func newGCMWithKey(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func masterKey() ([]byte, error) {
	raw := os.Getenv(encryptionKeyEnvVar)
	if raw == "" {
		return nil, fmt.Errorf("%s is not configured; generate one with `openssl rand -base64 32`", encryptionKeyEnvVar)
	}
	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("%s must be a base64-encoded 32-byte key", encryptionKeyEnvVar)
	}
	return key, nil
}
