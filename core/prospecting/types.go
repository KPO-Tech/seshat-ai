// Package prospectingcore is the tenant-agnostic core of SeshatOS's
// business-discovery/contact-enrichment capability: geocoding, grid tiling,
// the Google Places client, French company-registry enrichment, reachability
// scoring, and name-similarity matching. None of it knows about users or
// organizations — that scoping (and all persistence) is owned separately by
// each caller: seshat-backend/internal/prospecting today (per-user), and a
// future org-scoped seshat-server domain later (see ROADMAP.md's
// "Prospecting/CRM domain" entry). This split exists because these pieces
// are substantial (~900 lines of algorithm/external-API-client code) and
// were originally written directly inside seshat-backend rather than
// delegated to the seshat runtime the way RAG/MCP/long-term-memory are —
// unlike those, this logic is product-specific (SeshatOS's own CRM feature),
// so it doesn't belong in the runtime either; a small sibling module shared
// by the two backends via go.work is the right home. See
// helps/audit-2026-08-10.md for the full reasoning.
package prospectingcore

// GeoPoint is a plain lat/lng pair.
type GeoPoint struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

// Executive is one named company officer, as returned by the French company
// registry enrichment.
type Executive struct {
	Name string `json:"name"`
	Role string `json:"role"`
}

// Business is one discovered candidate — fully tenant-agnostic. SweepID is
// an opaque foreign key string, not a tenant identifier; ownership of the
// sweep it belongs to is tracked by the caller, not here.
type Business struct {
	SweepID           string      `json:"sweep_id"`
	PlaceID           string      `json:"place_id"`
	Sector            string      `json:"sector"`
	Name              string      `json:"name"`
	FormattedAddress  string      `json:"formatted_address"`
	PostalCode        string      `json:"postal_code"`
	City              string      `json:"city"`
	Location          GeoPoint    `json:"location"`
	Phone             string      `json:"phone"`
	Website           string      `json:"website"`
	Rating            float64     `json:"rating"`
	UserRatingCount   int         `json:"user_rating_count"`
	BusinessStatus    string      `json:"business_status"`
	OpeningHoursJSON  string      `json:"opening_hours_json"`
	SIREN             string      `json:"siren"`
	CompanyName       string      `json:"company_name"`
	Executives        []Executive `json:"executives"`
	MatchConfidence   float64     `json:"match_confidence"`
	ReachabilityScore int         `json:"reachability_score"`
}
