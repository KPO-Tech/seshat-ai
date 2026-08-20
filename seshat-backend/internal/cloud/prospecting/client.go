// Package cloudprospecting makes seshat-backend's Prospecting tools a real
// client of seshat-server's organization-scoped prospecting domain in
// "connected" mode. RemoteService (service.go) implements the same
// internal/prospecting.Backend interface *prospecting.Service implements
// for standalone mode, so swapping one for the other in
// internal/config/bootstrap.go is a one-line change — the same pattern
// cloudknowledge already uses for Documents.
package cloudprospecting

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
	prospectingcore "github.com/EngineerProjects/seshat-ai/seshat-core/prospecting"
)

// ─── Wire DTOs ──────────────────────────────────────────────────────────────
// Mirrors seshat-server's internal/server/prospecting.{Sweep,Business} shape
// (untagged Go structs, field-name-matched — there is no other consumer of
// this JSON today, see that package's doc comment). Not the same Go types —
// seshat-server is a separate module — just matching field names so
// json.Decode lines up.

type remoteSweep struct {
	ID                  string
	OrganizationID      string
	CreatedByUserID     string
	Country             string
	AreaQuery           string
	AreaLabel           string
	Center              prospectingcore.GeoPoint
	RadiusKM            float64
	Sectors             []string
	NextUnitIndex       int
	TotalUnits          int
	Status              string
	BusinessesFound     int
	RealPlacesCallsUsed int
	LastError           string
	CreatedAt           time.Time
	UpdatedAt           time.Time
	CompletedAt         *time.Time
}

type remoteBusiness struct {
	prospectingcore.Business
	ID        string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// ─── Client ─────────────────────────────────────────────────────────────────

// Client is a thin, stateless HTTP client for seshat-server's
// /api/v1/prospecting/* endpoints — same convention as every other cloud*
// client: no fixed token, each call takes the caller's own session token
// explicitly.
type Client struct {
	serverURL  string
	httpClient *http.Client
}

func NewClient(serverURL string) *Client {
	return &Client{
		serverURL:  strings.TrimRight(strings.TrimSpace(serverURL), "/"),
		httpClient: &http.Client{Timeout: 60 * time.Second}, // a sweep call can take a while (multiple external API calls per tile)
	}
}

type sweepAreaRequestBody struct {
	SweepID        string   `json:"sweep_id,omitempty"`
	OrganizationID string   `json:"organization_id,omitempty"`
	Area           string   `json:"area,omitempty"`
	Country        string   `json:"country,omitempty"`
	Sectors        []string `json:"sectors,omitempty"`
	RadiusKM       float64  `json:"radius_km,omitempty"`
	MaxTiles       int      `json:"max_tiles,omitempty"`
}

func (c *Client) SweepArea(ctx context.Context, token string, body sweepAreaRequestBody) (*remoteSweep, error) {
	var result remoteSweep
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, c.serverURL+"/api/v1/prospecting/sweeps", token, body, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

type listBusinessesResult struct {
	Businesses []remoteBusiness `json:"businesses"`
	Total      int              `json:"total"`
}

func (c *Client) ListBusinesses(ctx context.Context, token, sweepID string, minScore int, hasPhone bool, sector string, limit, offset int) (*listBusinessesResult, error) {
	q := url.Values{}
	if minScore > 0 {
		q.Set("min_score", strconv.Itoa(minScore))
	}
	if hasPhone {
		q.Set("has_phone", "true")
	}
	if sector != "" {
		q.Set("sector", sector)
	}
	if limit > 0 {
		q.Set("limit", strconv.Itoa(limit))
	}
	if offset > 0 {
		q.Set("offset", strconv.Itoa(offset))
	}
	reqURL := c.serverURL + "/api/v1/prospecting/sweeps/" + url.PathEscape(sweepID) + "/businesses"
	if len(q) > 0 {
		reqURL += "?" + q.Encode()
	}
	var result listBusinessesResult
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, reqURL, token, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}
