package db

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"strings"
)

const (
	encryptionKeyEnvVar   = "SESHAT_SERVER_ENCRYPTION_KEY"
	encryptedSecretPrefix = "enc:v1:"
)

func EncryptSecret(plaintext string) (string, error) {
	gcm, err := newGCM()
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

func DecryptSecret(stored string) (string, error) {
	if stored == "" {
		return "", nil
	}
	if !strings.HasPrefix(stored, encryptedSecretPrefix) {
		return stored, nil
	}
	gcm, err := newGCM()
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

func newGCM() (cipher.AEAD, error) {
	key, err := encryptionKey()
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func encryptionKey() ([]byte, error) {
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
