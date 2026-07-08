// Package automation owns the cloud automation control plane: devices,
// scheduled jobs and their runs. It is a distinct bounded context from iam
// (identity/access), consistent with the target package layout described in
// helps/seshat-server-bootstrap.md, but it reuses iam's role/policy-binding
// permission resolution rather than duplicating it — see iam.Service's
// exported CheckOrganizationPermission/CanAccessOrganization.
package automation

import (
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/apperr"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// Service owns devices, scheduled jobs and job runs.
type Service struct {
	db  *sdb.DB
	iam *iam.Service
}

func New(database *sdb.DB, iamService *iam.Service) *Service {
	return &Service{db: database, iam: iamService}
}

func newID(prefix string) (string, error) { return sdb.NewID(prefix) }

func newToken() (string, error) { return sdb.NewToken() }

// Error is a re-export of the shared control-plane error shape (see
// internal/server/apperr). Because iam.Error is the exact same alias, an
// error returned by an iam.Service call already satisfies *automation.Error
// as-is — no translation step needed between the two package boundaries.
type Error = apperr.Error

func ErrInvalidInput(message string) error { return apperr.InvalidInput(message) }
func ErrUnauthorized(message string) error { return apperr.Unauthorized(message) }
func ErrForbidden(message string) error    { return apperr.Forbidden(message) }
func ErrConflict(message string) error     { return apperr.Conflict(message) }
func ErrNotFound(message string) error     { return apperr.NotFound(message) }
