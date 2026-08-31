package prospecting

import (
	"context"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
)

// Backend is what internal/prospecting/tool's agent tools actually depend
// on — implemented locally by *Service (standalone, per-user) and remotely
// by internal/cloud/prospecting.RemoteService (connected mode, org-scoped),
// the same swap pattern internal/knowledge.Backend uses. See
// internal/config/bootstrap.go for how the two are chosen between.
type Backend interface {
	SweepArea(ctx context.Context, principal *backendauth.Principal, params SweepAreaParams) (*Sweep, error)
	ListBusinesses(ctx context.Context, principal *backendauth.Principal, params ListBusinessesParams) ([]Business, int, error)
}

var _ Backend = (*Service)(nil)
