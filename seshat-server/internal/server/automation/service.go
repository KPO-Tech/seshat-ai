// Package automation owns the cloud automation control plane: devices,
// scheduled jobs and their runs. It is a distinct bounded context from iam
// (identity/access), consistent with the target package layout described in
// helps/seshat-server-bootstrap.md, but it reuses iam's role/policy-binding
// permission resolution rather than duplicating it — see iam.Service's
// exported CheckOrganizationPermission/CanAccessOrganization.
package automation

import (
	"context"

	sdkrag "github.com/KPO-Tech/seshat/pkg/rag"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/apperr"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// RAGResolver resolves the rag.Service to use for one organization's
// cloud-targeted job execution (its own embedder, else the platform
// default — ok=false means neither is configured). Satisfied by
// *knowledge.Service, injected via SetRAGResolver rather than imported
// directly so this package doesn't depend on knowledge — same reasoning as
// reusing iam's permission checks through its exported methods instead of
// a tighter coupling.
type RAGResolver interface {
	RAGServiceForOrganization(ctx context.Context, organizationID string) (*sdkrag.Service, bool, error)
}

// Service owns devices, scheduled jobs and job runs.
type Service struct {
	db         *sdb.DB
	iam        *iam.Service
	rag        RAGResolver // nil until SetRAGResolver is called
	doclingURL string      // empty until SetDoclingURL is called
}

func New(database *sdb.DB, iamService *iam.Service) *Service {
	return &Service{db: database, iam: iamService}
}

// SetRAGResolver wires in the knowledge domain's embedder resolution so
// cloud-targeted job execution can enable rag_search/rag_ingest. Called
// once at app startup, after both services exist — see app.New.
func (s *Service) SetRAGResolver(r RAGResolver) {
	s.rag = r
}

// SetDoclingURL enables the read_document_url tool for cloud-targeted job
// execution — fetches and converts a remote document (PDF, webpage, ...)
// to markdown via a running docling-serve instance. Unlike the RAG
// resolver this isn't a secret or per-tenant value, just a shared
// infrastructure endpoint, so it's a plain setter rather than an
// interface. Empty disables the tool, same as leaving it unset.
func (s *Service) SetDoclingURL(url string) {
	s.doclingURL = url
}

// DoclingStatus reports whether this server has a docling-serve instance
// configured. Platform admin only, read-only - there's no per-organization
// setting to manage (see SetDoclingURL's doc comment for why). The URL
// itself isn't a secret (it's shared infrastructure, not a credential), so
// it's fine to return as-is.
func (s *Service) DoclingStatus(principal *iam.Principal) (configured bool, url string, err error) {
	if principal == nil {
		return false, "", ErrUnauthorized("authentication required")
	}
	if !principal.User.IsAdmin {
		return false, "", ErrForbidden("platform admin required")
	}
	return s.doclingURL != "", s.doclingURL, nil
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
