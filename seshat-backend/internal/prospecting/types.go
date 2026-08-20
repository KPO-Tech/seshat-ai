// Package prospecting is the per-user (local, standalone) orchestration and
// persistence layer for SeshatOS's business-discovery/contact-enrichment
// capability: it owns Sweep lifecycle, ownership checks, and storage, and
// delegates the actual algorithm/external-API work (geocoding, grid tiling,
// the Google Places client, French company-registry enrichment,
// reachability scoring, name-similarity matching) to the shared
// github.com/EngineerProjects/seshat-ai/seshat-core/prospecting module - see that
// module's own doc comment for why it's a separate sibling package rather
// than living here or in the seshat runtime. See internal/prospectingtool
// for the agent-facing tools built on top of this package.
package prospecting

import (
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	prospectingcore "github.com/EngineerProjects/seshat-ai/seshat-core/prospecting"
)

// Status consts aliased from db so callers never need to import that
// package just to compare a status string - the same convention
// internal/inbox/types.go uses for its own status constants.
const (
	SweepStatusRunning   = db.ProspectingSweepStatusRunning
	SweepStatusPartial   = db.ProspectingSweepStatusPartial
	SweepStatusCompleted = db.ProspectingSweepStatusCompleted
	SweepStatusFailed    = db.ProspectingSweepStatusFailed
)

// GeoPoint and Executive are tenant-agnostic - re-exported here as aliases
// so existing callers (internal/prospectingtool, this package's own
// service.go) keep referring to prospecting.GeoPoint/prospecting.Executive
// without needing to know the logic underneath moved to a shared package.
type GeoPoint = prospectingcore.GeoPoint
type Executive = prospectingcore.Executive

// IsConfigured re-exports prospecting-core's check (GOOGLE_PLACES_API_KEY
// set) so internal/prospectingtool doesn't need to import that module
// directly just for this one call.
var IsConfigured = prospectingcore.IsConfigured

// Business is the domain view of one retained candidate: the tenant-agnostic
// discovered data (embedded from prospecting-core, see that package for the
// full field list) plus the local persistence identity/timestamps, which
// are meaningful only once a candidate has actually been stored.
type Business struct {
	prospectingcore.Business
	ID        string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// Sweep is the domain view of a discovery run - tenant-aware (UserID), so it
// stays local rather than moving to prospecting-core; a future org-scoped
// seshat-server domain will define its own equivalent with OrganizationID
// instead, built from the same shared GeoPoint/Business types.
type Sweep struct {
	ID                  string
	UserID              string
	Country             string
	AreaQuery           string
	AreaLabel           string
	Center              GeoPoint
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
	CompletedAt         time.Time
}

// SweepAreaParams starts a new sweep (SweepID empty) or continues an
// existing one (SweepID set - Country/AreaQuery/Sectors/RadiusKM are then
// ignored, the stored sweep's own values are used).
type SweepAreaParams struct {
	SweepID   string
	AreaQuery string
	Country   string
	Sectors   []string
	RadiusKM  float64
	MaxTiles  int
}

type ListBusinessesParams struct {
	SweepID  string
	MinScore int
	HasPhone bool
	Sector   string
	Limit    int
	Offset   int
}

func sweepFromDB(s db.ProspectingSweep, sectors []string) *Sweep {
	return &Sweep{
		ID:                  s.ID,
		UserID:              s.UserID,
		Country:             s.Country,
		AreaQuery:           s.AreaQuery,
		AreaLabel:           s.AreaLabel,
		Center:              GeoPoint{Lat: s.CenterLat, Lng: s.CenterLng},
		RadiusKM:            s.RadiusKM,
		Sectors:             sectors,
		NextUnitIndex:       s.NextUnitIndex,
		TotalUnits:          s.TotalUnits,
		Status:              s.Status,
		BusinessesFound:     s.BusinessesFound,
		RealPlacesCallsUsed: s.RealPlacesCallsUsed,
		LastError:           s.LastError,
		CreatedAt:           s.CreatedAt,
		UpdatedAt:           s.UpdatedAt,
		CompletedAt:         s.CompletedAt,
	}
}

func businessFromDB(b db.ProspectingBusiness, executives []Executive) *Business {
	return &Business{
		Business: prospectingcore.Business{
			SweepID:           b.SweepID,
			PlaceID:           b.PlaceID,
			Sector:            b.Sector,
			Name:              b.Name,
			FormattedAddress:  b.FormattedAddress,
			PostalCode:        b.PostalCode,
			City:              b.City,
			Location:          GeoPoint{Lat: b.Lat, Lng: b.Lng},
			Phone:             b.Phone,
			Website:           b.Website,
			Rating:            b.Rating,
			UserRatingCount:   b.UserRatingCount,
			BusinessStatus:    b.BusinessStatus,
			OpeningHoursJSON:  b.OpeningHoursJSON,
			SIREN:             b.SIREN,
			CompanyName:       b.CompanyName,
			Executives:        executives,
			MatchConfidence:   b.MatchConfidence,
			ReachabilityScore: b.ReachabilityScore,
		},
		ID:        b.ID,
		CreatedAt: b.CreatedAt,
		UpdatedAt: b.UpdatedAt,
	}
}
