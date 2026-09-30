package api

import (
	"os"
	"testing"

	"golang.org/x/crypto/bcrypt"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// TestMain lowers iam's bcrypt cost for this package's whole test binary -
// see iam.SetBcryptCostForTesting's doc comment. This package's tests create
// accounts through iam.CreateUser (real cost-12 bcrypt hashing otherwise),
// and CI's -race run of this package was timing out at 8 minutes for the
// same reason internal/server/iam was.
func TestMain(m *testing.M) {
	restore := iam.SetBcryptCostForTesting(bcrypt.MinCost)
	code := m.Run()
	restore()
	os.Exit(code)
}
