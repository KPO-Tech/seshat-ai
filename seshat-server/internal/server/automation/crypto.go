package automation

import (
	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func encryptSecret(gormDB *gorm.DB, organizationID, plaintext string) (string, error) {
	return sdb.EncryptSecret(gormDB, organizationID, plaintext)
}

func decryptSecret(gormDB *gorm.DB, organizationID, encoded string) (string, error) {
	plaintext, err := sdb.DecryptSecret(gormDB, organizationID, encoded)
	if err != nil {
		return "", ErrInvalidInput(err.Error())
	}
	return plaintext, nil
}
