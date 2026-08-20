package prospecting

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	prospectingcore "github.com/EngineerProjects/seshat-ai/core/prospecting"
	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

// Per-call sizing - bounded so one tool invocation never turns into an
// unbounded city sweep. A large radius just means more tool calls to
// finish (via the sweep_id resume cursor), never one huge call.
const (
	defaultMaxTilesPerCall = 10
	hardMaxTilesPerCall    = 30
	maxNewDetailsPerCall   = 40
	perTileSearchRadiusM   = 1500.0

	// crossSweepReuseWindow bounds how long a business discovered in one
	// sweep can be reused (without a fresh Place Details/company-registry
	// call) if the same place turns up again in a later, separate sweep -
	// matches Place Details' own cache TTL so "fresh enough" means the same
	// thing in both places.
	crossSweepReuseWindow = 30 * 24 * time.Hour
)

// Service orchestrates sweeps and exposes read access to their results.
// It never touches GORM directly - all persistence goes through the
// Store types, matching internal/inbox's discipline. Geocode/EnrichCompany
// are called as plain package functions (stateless besides the shared
// cache), only the Places client is stateful enough to warrant a field.
type Service struct {
	sweeps       *db.ProspectingSweepStore
	businesses   *db.ProspectingBusinessStore
	cache        *db.ProspectingCacheStore
	cacheAdapter prospectingcore.Cache // wraps cache, see adapters.go
	usage        *db.ProspectingUsageStore
	places       *prospectingcore.Client
}

func NewService(
	sweeps *db.ProspectingSweepStore,
	businesses *db.ProspectingBusinessStore,
	cache *db.ProspectingCacheStore,
	usage *db.ProspectingUsageStore,
	placesAPIKey string,
	dailyCap int,
) *Service {
	adapter := cacheStoreAdapter{store: cache}
	return &Service{
		sweeps:       sweeps,
		businesses:   businesses,
		cache:        cache,
		cacheAdapter: adapter,
		usage:        usage,
		places:       prospectingcore.NewClient(placesAPIKey, adapter, usage, dailyCap),
	}
}

type sweepWorkUnit struct {
	Sector string
	Cell   GeoPoint
}

// SweepArea starts a new sweep (params.SweepID empty) or continues an
// existing one, processing a bounded slice of the sector x grid-cell
// work-list per call. See package doc for the overall approach.
func (s *Service) SweepArea(ctx context.Context, principal *backendauth.Principal, params SweepAreaParams) (*Sweep, error) {
	if s == nil || s.sweeps == nil {
		return nil, bkerr.Unavailable("prospecting store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}

	var record *db.ProspectingSweep
	var sectors []string
	var grid []GeoPoint

	if strings.TrimSpace(params.SweepID) == "" {
		areaQuery := strings.TrimSpace(params.AreaQuery)
		if areaQuery == "" {
			return nil, bkerr.InvalidInput("area is required", nil)
		}
		if len(params.Sectors) == 0 {
			return nil, bkerr.InvalidInput("at least one sector is required", nil)
		}
		country := strings.ToLower(strings.TrimSpace(params.Country))
		if country == "" {
			country = "fr"
		}
		radiusKM := params.RadiusKM
		if radiusKM <= 0 {
			radiusKM = 5
		}

		geo, err := prospectingcore.Geocode(ctx, s.places.HTTPClient(), s.cacheAdapter, areaQuery)
		if err != nil {
			return nil, bkerr.BadGateway("geocode area", err)
		}
		sectors = params.Sectors
		grid = prospectingcore.BuildGrid(geo.Point, radiusKM)
		sectorsJSON, err := json.Marshal(sectors)
		if err != nil {
			return nil, bkerr.Internal("marshal sectors", err)
		}
		gridJSON, err := json.Marshal(grid)
		if err != nil {
			return nil, bkerr.Internal("marshal grid", err)
		}

		record, err = s.sweeps.Create(ctx, db.CreateProspectingSweepParams{
			UserID:      principal.User.ID,
			Country:     country,
			AreaQuery:   areaQuery,
			AreaLabel:   geo.Label,
			CenterLat:   geo.Point.Lat,
			CenterLng:   geo.Point.Lng,
			RadiusKM:    radiusKM,
			SectorsJSON: string(sectorsJSON),
			GridJSON:    string(gridJSON),
			TotalUnits:  len(sectors) * len(grid),
		})
		if err != nil {
			return nil, bkerr.Internal("create sweep", err)
		}
	} else {
		var err error
		record, err = s.getOwnedSweep(ctx, principal, params.SweepID)
		if err != nil {
			return nil, err
		}
		if record.Status == db.ProspectingSweepStatusCompleted {
			return sweepFromDB(*record, sectorsFromJSON(record.SectorsJSON)), nil
		}
		sectors = sectorsFromJSON(record.SectorsJSON)
		grid = gridFromJSON(record.GridJSON)
	}

	maxTiles := params.MaxTiles
	if maxTiles <= 0 {
		maxTiles = defaultMaxTilesPerCall
	}
	if maxTiles > hardMaxTilesPerCall {
		maxTiles = hardMaxTilesPerCall
	}

	seenPlaceIDs, err := s.businesses.ExistingPlaceIDs(ctx, record.ID)
	if err != nil {
		return nil, bkerr.Internal("load existing sweep candidates", err)
	}

	periodKey := db.DayPeriodKey(time.Now())
	searchBefore, detailsBefore, err := s.usage.GetTotals(ctx, periodKey)
	if err != nil {
		return nil, bkerr.Internal("read usage totals", err)
	}

	// status is deliberately NOT seeded from record.Status - on a resumed
	// call record.Status is already "partial" from the previous call, and
	// reusing that value here would make the post-inner-loop capHit check
	// below fire on the very first processed unit of every resume, long
	// before any real daily-cap error occurs. capHit is the only signal
	// that gates an early break; the final status is always recomputed
	// fresh from capHit/nextUnit/TotalUnits once the loop ends.
	var status string
	capHit := false
	lastError := ""
	nextUnit := record.NextUnitIndex
	businessesFound := record.BusinessesFound
	realCallsThisCall := 0
	newDetailsThisCall := 0
	unitsProcessed := 0

	for nextUnit < record.TotalUnits && unitsProcessed < maxTiles {
		unit := workUnitAt(sectors, grid, nextUnit)
		summaries, err := s.places.TextSearch(ctx, unit.Sector+" "+record.AreaLabel, unit.Cell, perTileSearchRadiusM)
		if err != nil {
			if errors.Is(err, prospectingcore.ErrDailyCapReached) {
				capHit = true
				lastError = prospectingcore.ErrDailyCapReached.Error()
				break
			}
			// A single failed tile shouldn't abort the whole sweep - record
			// and move on, the agent can see LastError and decide whether
			// to retry.
			lastError = err.Error()
			nextUnit++
			unitsProcessed++
			continue
		}

		for _, ps := range summaries {
			if seenPlaceIDs[ps.PlaceID] {
				continue
			}

			var business prospectingcore.Business
			if prior, found, err := s.businesses.FindLatestByUserAndPlaceID(ctx, principal.User.ID, ps.PlaceID); err == nil && found && time.Since(prior.UpdatedAt) < crossSweepReuseWindow {
				// Already known from an earlier sweep of this user's (any
				// area, not just this one) within the reuse window - reuse
				// it instead of re-paying for Place Details/company
				// enrichment. This is the actual cost-saving mechanism;
				// per-sweep result sets still stay separate (see
				// db.ProspectingBusinessStore's own doc comment).
				var executives []Executive
				_ = json.Unmarshal([]byte(prior.ExecutivesJSON), &executives)
				business = prospectingcore.Business{
					PlaceID: ps.PlaceID, Sector: unit.Sector, Name: ps.Name,
					FormattedAddress: ps.FormattedAddress, PostalCode: ps.PostalCode, City: ps.City, Location: ps.Location,
					Phone: prior.Phone, Website: prior.Website, Rating: prior.Rating, UserRatingCount: prior.UserRatingCount,
					BusinessStatus: prior.BusinessStatus, OpeningHoursJSON: prior.OpeningHoursJSON,
					SIREN: prior.SIREN, CompanyName: prior.CompanyName, Executives: executives, MatchConfidence: prior.MatchConfidence,
				}
			} else {
				if newDetailsThisCall >= maxNewDetailsPerCall {
					break
				}
				details, err := s.places.PlaceDetails(ctx, ps.PlaceID)
				if err != nil {
					if errors.Is(err, prospectingcore.ErrDailyCapReached) {
						capHit = true
						lastError = prospectingcore.ErrDailyCapReached.Error()
						break
					}
					continue
				}
				newDetailsThisCall++

				business = prospectingcore.Business{
					PlaceID:          ps.PlaceID,
					Sector:           unit.Sector,
					Name:             ps.Name,
					FormattedAddress: ps.FormattedAddress,
					PostalCode:       ps.PostalCode,
					City:             ps.City,
					Location:         ps.Location,
					Phone:            details.Phone,
					Website:          details.Website,
					Rating:           details.Rating,
					UserRatingCount:  details.UserRatingCount,
					BusinessStatus:   details.BusinessStatus,
					OpeningHoursJSON: details.OpeningHoursJSON,
				}

				if record.Country == "fr" {
					if match, found, err := prospectingcore.EnrichCompany(ctx, s.places.HTTPClient(), s.cacheAdapter, ps.Name, ps.PostalCode); err == nil && found {
						business.SIREN = match.SIREN
						business.CompanyName = match.CompanyName
						business.Executives = match.Executives
						business.MatchConfidence = match.Confidence
					}
				}
			}
			business.ReachabilityScore = prospectingcore.ReachabilityScore(business)

			executivesJSON, _ := json.Marshal(business.Executives)
			if _, err := s.businesses.Upsert(ctx, db.UpsertProspectingBusinessParams{
				SweepID:           record.ID,
				PlaceID:           business.PlaceID,
				Sector:            business.Sector,
				Name:              business.Name,
				FormattedAddress:  business.FormattedAddress,
				PostalCode:        business.PostalCode,
				City:              business.City,
				Lat:               business.Location.Lat,
				Lng:               business.Location.Lng,
				Phone:             business.Phone,
				Website:           business.Website,
				Rating:            business.Rating,
				UserRatingCount:   business.UserRatingCount,
				BusinessStatus:    business.BusinessStatus,
				OpeningHoursJSON:  business.OpeningHoursJSON,
				SIREN:             business.SIREN,
				CompanyName:       business.CompanyName,
				ExecutivesJSON:    string(executivesJSON),
				MatchConfidence:   business.MatchConfidence,
				ReachabilityScore: business.ReachabilityScore,
			}); err != nil {
				lastError = fmt.Sprintf("store %s: %v", business.Name, err)
				continue
			}
			seenPlaceIDs[ps.PlaceID] = true
			businessesFound++
		}
		if capHit {
			break // daily cap hit mid-tile, stop advancing further tiles too
		}
		nextUnit++
		unitsProcessed++
	}

	switch {
	case capHit:
		status = db.ProspectingSweepStatusPartial
	case nextUnit >= record.TotalUnits:
		status = db.ProspectingSweepStatusCompleted
	default:
		status = db.ProspectingSweepStatusPartial
	}
	searchAfter, detailsAfter, err := s.usage.GetTotals(ctx, periodKey)
	if err != nil {
		return nil, bkerr.Internal("read usage totals", err)
	}
	realCallsThisCall = int((searchAfter - searchBefore) + (detailsAfter - detailsBefore))

	if err := s.sweeps.UpdateProgress(ctx, db.UpdateProspectingSweepProgressParams{
		ID:                  record.ID,
		NextUnitIndex:       nextUnit,
		Status:              status,
		BusinessesFound:     businessesFound,
		RealPlacesCallsUsed: record.RealPlacesCallsUsed + realCallsThisCall,
		LastError:           lastError,
	}); err != nil {
		return nil, bkerr.Internal("update sweep progress", err)
	}

	updated, err := s.sweeps.GetByID(ctx, record.ID)
	if err != nil {
		return nil, bkerr.Internal("reload sweep", err)
	}
	return sweepFromDB(*updated, sectors), nil
}

// ListBusinesses pages through one sweep's discovered candidates.
func (s *Service) ListBusinesses(ctx context.Context, principal *backendauth.Principal, params ListBusinessesParams) ([]Business, int, error) {
	if s == nil || s.businesses == nil {
		return nil, 0, bkerr.Unavailable("prospecting store not configured", nil)
	}
	if _, err := s.getOwnedSweep(ctx, principal, params.SweepID); err != nil {
		return nil, 0, err
	}
	records, total, err := s.businesses.ListBySweep(ctx, params.SweepID, db.ListProspectingBusinessesFilter{
		MinScore: params.MinScore,
		HasPhone: params.HasPhone,
		Sector:   params.Sector,
	}, params.Limit, params.Offset)
	if err != nil {
		return nil, 0, bkerr.Internal("list businesses", err)
	}
	out := make([]Business, 0, len(records))
	for _, r := range records {
		var executives []Executive
		_ = json.Unmarshal([]byte(r.ExecutivesJSON), &executives)
		out = append(out, *businessFromDB(r, executives))
	}
	return out, total, nil
}

func (s *Service) getOwnedSweep(ctx context.Context, principal *backendauth.Principal, sweepID string) (*db.ProspectingSweep, error) {
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	if strings.TrimSpace(sweepID) == "" {
		return nil, bkerr.InvalidInput("sweep_id is required", nil)
	}
	record, err := s.sweeps.GetByID(ctx, sweepID)
	if err != nil {
		return nil, bkerr.NotFound("sweep not found", err)
	}
	if record.UserID != principal.User.ID {
		return nil, bkerr.Forbidden("sweep does not belong to this user", nil)
	}
	return record, nil
}

func workUnitAt(sectors []string, grid []GeoPoint, index int) sweepWorkUnit {
	gridLen := len(grid)
	if gridLen == 0 {
		return sweepWorkUnit{}
	}
	sector := sectors[index/gridLen]
	cell := grid[index%gridLen]
	return sweepWorkUnit{Sector: sector, Cell: cell}
}

func sectorsFromJSON(raw string) []string {
	var out []string
	_ = json.Unmarshal([]byte(raw), &out)
	return out
}

func gridFromJSON(raw string) []GeoPoint {
	var out []GeoPoint
	_ = json.Unmarshal([]byte(raw), &out)
	return out
}
