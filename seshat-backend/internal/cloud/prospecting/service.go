package cloudprospecting

import (
	"context"
	"time"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/prospecting"
)

// RemoteService implements prospecting.Backend against a remote
// seshat-server — the "connected mode" org-wide Prospecting backend. See
// the package doc for why this is a clean swap rather than a merge.
type RemoteService struct {
	client *Client
}

func NewRemoteService(serverURL string) *RemoteService {
	return &RemoteService{client: NewClient(serverURL)}
}

var _ prospecting.Backend = (*RemoteService)(nil)

func (s *RemoteService) SweepArea(ctx context.Context, principal *backendauth.Principal, params prospecting.SweepAreaParams) (*prospecting.Sweep, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	remote, err := s.client.SweepArea(ctx, principal.AuthSession.ID, sweepAreaRequestBody{
		SweepID:        params.SweepID,
		OrganizationID: principal.OrganizationID(),
		Area:           params.AreaQuery,
		Country:        params.Country,
		Sectors:        params.Sectors,
		RadiusKM:       params.RadiusKM,
		MaxTiles:       params.MaxTiles,
	})
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	return fromRemoteSweep(*remote), nil
}

func (s *RemoteService) ListBusinesses(ctx context.Context, principal *backendauth.Principal, params prospecting.ListBusinessesParams) ([]prospecting.Business, int, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, 0, err
	}
	result, err := s.client.ListBusinesses(ctx, principal.AuthSession.ID, params.SweepID, params.MinScore, params.HasPhone, params.Sector, params.Limit, params.Offset)
	if err != nil {
		return nil, 0, cloudhttp.Translate(err)
	}
	out := make([]prospecting.Business, 0, len(result.Businesses))
	for _, r := range result.Businesses {
		out = append(out, fromRemoteBusiness(r))
	}
	return out, result.Total, nil
}

// ─── DTO conversion ─────────────────────────────────────────────────────────

func fromRemoteSweep(r remoteSweep) *prospecting.Sweep {
	return &prospecting.Sweep{
		ID:                  r.ID,
		UserID:              r.CreatedByUserID, // closest local analog — who created it, not an ownership gate in connected mode (seshat-server enforces org permission itself)
		Country:             r.Country,
		AreaQuery:           r.AreaQuery,
		AreaLabel:           r.AreaLabel,
		Center:              prospecting.GeoPoint{Lat: r.Center.Lat, Lng: r.Center.Lng},
		RadiusKM:            r.RadiusKM,
		Sectors:             r.Sectors,
		NextUnitIndex:       r.NextUnitIndex,
		TotalUnits:          r.TotalUnits,
		Status:              r.Status,
		BusinessesFound:     r.BusinessesFound,
		RealPlacesCallsUsed: r.RealPlacesCallsUsed,
		LastError:           r.LastError,
		CreatedAt:           r.CreatedAt,
		UpdatedAt:           r.UpdatedAt,
		CompletedAt:         completedAtValue(r.CompletedAt),
	}
}

func completedAtValue(t *time.Time) time.Time {
	if t == nil {
		return time.Time{}
	}
	return *t
}

func fromRemoteBusiness(r remoteBusiness) prospecting.Business {
	return prospecting.Business{
		Business:  r.Business,
		ID:        r.ID,
		CreatedAt: r.CreatedAt,
		UpdatedAt: r.UpdatedAt,
	}
}
