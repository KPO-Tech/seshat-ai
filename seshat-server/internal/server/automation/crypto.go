package automation

import sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"

func encryptSecret(plaintext string) (string, error) {
	return sdb.EncryptSecret(plaintext)
}

func decryptSecret(encoded string) (string, error) {
	plaintext, err := sdb.DecryptSecret(encoded)
	if err != nil {
		return "", ErrInvalidInput(err.Error())
	}
	return plaintext, nil
}
