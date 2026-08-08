// Package prospecting implements a read-only business-discovery and
// contact-enrichment capability: given an area and a list of business
// sectors, it sweeps Google Places (tiled by sector x geographic grid cell
// to work around Places' hard 60-result-per-query cap) and, for French
// businesses, enriches each candidate via the government's free
// recherche-entreprises.api.gouv.fr (SIREN + executives). Every external
// call is cached (see internal/db's ProspectingCacheStore) and a global
// daily cap protects the one paid dependency (Google Places) from runaway
// spend. See internal/prospectingtool for the agent-facing tools built on
// top of this package.
package prospecting

import (
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
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

// GeoPoint is a plain lat/lng pair, shared by geocode.go, grid.go and
// places.go.
type GeoPoint struct {
	Lat float64
	Lng float64
}

// Executive is one named company officer, as returned by the French
// company registry enrichment.
type Executive struct {
	Name string `json:"name"`
	Role string `json:"role"`
}

// Sweep is the domain view of a discovery run.
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

// Business is the domain view of one retained candidate.
type Business struct {
	ID                string
	SweepID           string
	PlaceID           string
	Sector            string
	Name              string
	FormattedAddress  string
	PostalCode        string
	City              string
	Location          GeoPoint
	Phone             string
	Website           string
	Rating            float64
	UserRatingCount   int
	BusinessStatus    string
	OpeningHoursJSON  string
	SIREN             string
	CompanyName       string
	Executives        []Executive
	MatchConfidence   float64
	ReachabilityScore int
	CreatedAt         time.Time
	UpdatedAt         time.Time
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
		ID:                b.ID,
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
		CreatedAt:         b.CreatedAt,
		UpdatedAt:         b.UpdatedAt,
	}
}
