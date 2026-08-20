// Package prospecting is the organization-scoped equivalent of
// seshat-backend's internal/prospecting (per-user, single-tenant): it owns
// Sweep lifecycle and storage, delegating the actual algorithm/external-API
// work (geocoding, grid tiling, the Google Places client, French
// company-registry enrichment, reachability scoring) to the tenant-agnostic
// sibling module github.com/EngineerProjects/seshat-ai/core/prospecting —
// see that module's own doc comment for why it's a separate package.
//
// Unlike the local version, ownership here is by organization, not by
// user: any member with prospecting.manage can continue a sweep a teammate
// started, and cross-sweep business reuse looks across the whole
// organization — that's the actual point of this migration (Prospecting is
// team data, not private, see helps/audit-2026-08-10.md section 6).
package prospecting

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	prospectingcore "github.com/EngineerProjects/seshat-ai/core/prospecting"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/apperr"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

type Error = apperr.Error

func ErrInvalidInput(message string) error { return apperr.InvalidInput(message) }
func ErrUnauthorized(message string) error { return apperr.Unauthorized(message) }
func ErrForbidden(message string) error    { return apperr.Forbidden(message) }
func ErrNotFound(message string) error     { return apperr.NotFound(message) }

func newID(prefix string) (string, error) { return sdb.NewID(prefix) }

const (
	SweepStatusRunning   = "running"
	SweepStatusPartial   = "partial"
	SweepStatusCompleted = "completed"
	SweepStatusFailed    = "failed"

	// Same call-sizing discipline as seshat-backend's local service — see
	// its doc comment for the reasoning (bounded per-call cost, resumable
	// via the sweep_id cursor).
	defaultMaxTilesPerCall = 10
	hardMaxTilesPerCall    = 30
	maxNewDetailsPerCall   = 40
	perTileSearchRadiusM   = 1500.0
	crossSweepReuseWindow  = 30 * 24 * time.Hour
)

type Service struct {
	db  *sdb.DB
	iam *iam.Service

	// testRoundTripper lets a white-box test in this package intercept the
	// Places/geocode/company-registry HTTP calls a per-request
	// prospectingcore.Client makes (see placesClient) instead of touching
	// the real network — nil in production, where the client uses its own
	// default *http.Client.
	testRoundTripper http.RoundTripper
}

func New(database *sdb.DB, iamService *iam.Service) *Service {
	return &Service{db: database, iam: iamService}
}

// ─── Domain types ───────────────────────────────────────────────────────

type GeoPoint = prospectingcore.GeoPoint
type Executive = prospectingcore.Executive

type Sweep struct {
	ID                  string     `json:"id"`
	OrganizationID      string     `json:"organization_id"`
	CreatedByUserID     string     `json:"created_by_user_id"`
	Country             string     `json:"country"`
	AreaQuery           string     `json:"area_query"`
	AreaLabel           string     `json:"area_label"`
	Center              GeoPoint   `json:"center"`
	RadiusKM            float64    `json:"radius_km"`
	Sectors             []string   `json:"sectors"`
	NextUnitIndex       int        `json:"next_unit_index"`
	TotalUnits          int        `json:"total_units"`
	Status              string     `json:"status"`
	BusinessesFound     int        `json:"businesses_found"`
	RealPlacesCallsUsed int        `json:"real_places_calls_used"`
	LastError           string     `json:"last_error"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
	CompletedAt         *time.Time `json:"completed_at,omitempty"`
}

type Business struct {
	prospectingcore.Business
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// SweepAreaParams starts a new sweep (SweepID empty, OrganizationID
// required) or continues an existing one (SweepID set — OrganizationID/
// Country/AreaQuery/Sectors/RadiusKM are then ignored, the stored sweep's
// own organization and values are used, mirroring the local service).
type SweepAreaParams struct {
	SweepID        string
	OrganizationID string
	AreaQuery      string
	Country        string
	Sectors        []string
	RadiusKM       float64
	MaxTiles       int
}

type ListBusinessesParams struct {
	SweepID  string
	MinScore int
	HasPhone bool
	Sector   string
	Limit    int
	Offset   int
}

type sweepWorkUnit struct {
	Sector string
	Cell   GeoPoint
}

// SweepArea requires prospecting.manage (it spends the organization's own
// Google Places budget) — see settings.go for how the organization's API
// key is resolved.
func (s *Service) SweepArea(ctx context.Context, principal *iam.Principal, params SweepAreaParams) (*Sweep, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}

	var record *sdb.ProspectingSweep
	var sectors []string
	var grid []GeoPoint
	var organizationID string
	var client *prospectingcore.Client

	if strings.TrimSpace(params.SweepID) == "" {
		organizationID = strings.TrimSpace(params.OrganizationID)
		if organizationID == "" {
			return nil, ErrInvalidInput("organization_id is required")
		}
		if !principal.User.IsAdmin {
			if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "prospecting.manage", "organization.manage"); err != nil {
				return nil, err
			}
		}

		areaQuery := strings.TrimSpace(params.AreaQuery)
		if areaQuery == "" {
			return nil, ErrInvalidInput("area is required")
		}
		if len(params.Sectors) == 0 {
			return nil, ErrInvalidInput("at least one sector is required")
		}
		country := strings.ToLower(strings.TrimSpace(params.Country))
		if country == "" {
			country = "fr"
		}
		radiusKM := params.RadiusKM
		if radiusKM <= 0 {
			radiusKM = 5
		}

		var err error
		client, err = s.placesClient(ctx, organizationID)
		if err != nil {
			return nil, err
		}
		geo, err := prospectingcore.Geocode(ctx, client.HTTPClient(), s.cache(), areaQuery)
		if err != nil {
			return nil, apperr.InvalidInput(fmt.Sprintf("geocode area: %v", err))
		}
		sectors = params.Sectors
		grid = prospectingcore.BuildGrid(geo.Point, radiusKM)
		sectorsJSON, err := json.Marshal(sectors)
		if err != nil {
			return nil, err
		}
		gridJSON, err := json.Marshal(grid)
		if err != nil {
			return nil, err
		}

		sweepID, err := newID("psweep")
		if err != nil {
			return nil, err
		}
		row := sdb.ProspectingSweep{
			ID:              sweepID,
			OrganizationID:  organizationID,
			CreatedByUserID: principal.User.ID,
			Country:         country,
			AreaQuery:       areaQuery,
			AreaLabel:       geo.Label,
			CenterLat:       geo.Point.Lat,
			CenterLng:       geo.Point.Lng,
			RadiusKM:        radiusKM,
			SectorsJSON:     string(sectorsJSON),
			GridJSON:        string(gridJSON),
			TotalUnits:      len(sectors) * len(grid),
			Status:          SweepStatusRunning,
		}
		if err := s.db.Gorm().WithContext(ctx).Create(&row).Error; err != nil {
			return nil, err
		}
		record = &row
	} else {
		var err error
		record, err = s.mustLoadSweep(ctx, principal, params.SweepID, "prospecting.manage", "organization.manage")
		if err != nil {
			return nil, err
		}
		organizationID = record.OrganizationID
		if record.Status == SweepStatusCompleted {
			return sweepFromModel(*record, sectorsFromJSON(record.SectorsJSON)), nil
		}
		sectors = sectorsFromJSON(record.SectorsJSON)
		grid = gridFromJSON(record.GridJSON)

		client, err = s.placesClient(ctx, organizationID)
		if err != nil {
			return nil, err
		}
	}

	maxTiles := params.MaxTiles
	if maxTiles <= 0 {
		maxTiles = defaultMaxTilesPerCall
	}
	if maxTiles > hardMaxTilesPerCall {
		maxTiles = hardMaxTilesPerCall
	}

	seenPlaceIDs, err := s.existingPlaceIDs(ctx, record.ID)
	if err != nil {
		return nil, err
	}

	periodKey := dayPeriodKey(time.Now())
	usage := usageAdapter{db: s.db, organizationID: organizationID}
	searchBefore, detailsBefore, err := usage.GetTotals(ctx, periodKey)
	if err != nil {
		return nil, err
	}

	var status string
	capHit := false
	lastError := ""
	nextUnit := record.NextUnitIndex
	businessesFound := record.BusinessesFound
	newDetailsThisCall := 0
	unitsProcessed := 0

	for nextUnit < record.TotalUnits && unitsProcessed < maxTiles {
		unit := workUnitAt(sectors, grid, nextUnit)
		summaries, err := client.TextSearch(ctx, unit.Sector+" "+record.AreaLabel, unit.Cell, perTileSearchRadiusM)
		if err != nil {
			if errors.Is(err, prospectingcore.ErrDailyCapReached) {
				capHit = true
				lastError = prospectingcore.ErrDailyCapReached.Error()
				break
			}
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
			if prior, found, err := s.findLatestByOrgAndPlaceID(ctx, organizationID, ps.PlaceID); err == nil && found && time.Since(prior.UpdatedAt) < crossSweepReuseWindow {
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
				details, err := client.PlaceDetails(ctx, ps.PlaceID)
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
					if match, found, err := prospectingcore.EnrichCompany(ctx, client.HTTPClient(), s.cache(), ps.Name, ps.PostalCode); err == nil && found {
						business.SIREN = match.SIREN
						business.CompanyName = match.CompanyName
						business.Executives = match.Executives
						business.MatchConfidence = match.Confidence
					}
				}
			}
			business.ReachabilityScore = prospectingcore.ReachabilityScore(business)

			if _, err := s.upsertBusiness(ctx, record.ID, organizationID, business); err != nil {
				lastError = fmt.Sprintf("store %s: %v", business.Name, err)
				continue
			}
			seenPlaceIDs[ps.PlaceID] = true
			businessesFound++
		}
		if capHit {
			break
		}
		nextUnit++
		unitsProcessed++
	}

	switch {
	case capHit:
		status = SweepStatusPartial
	case nextUnit >= record.TotalUnits:
		status = SweepStatusCompleted
	default:
		status = SweepStatusPartial
	}
	searchAfter, detailsAfter, err := usage.GetTotals(ctx, periodKey)
	if err != nil {
		return nil, err
	}
	realCallsThisCall := int((searchAfter - searchBefore) + (detailsAfter - detailsBefore))

	updates := map[string]any{
		"next_unit_index":        nextUnit,
		"status":                 status,
		"businesses_found":       businessesFound,
		"real_places_calls_used": record.RealPlacesCallsUsed + realCallsThisCall,
		"last_error":             lastError,
	}
	if status == SweepStatusCompleted {
		now := time.Now()
		updates["completed_at"] = &now
	}
	if err := s.db.Gorm().WithContext(ctx).Model(&sdb.ProspectingSweep{}).Where("id = ?", record.ID).Updates(updates).Error; err != nil {
		return nil, err
	}

	var updated sdb.ProspectingSweep
	if err := s.db.Gorm().WithContext(ctx).First(&updated, "id = ?", record.ID).Error; err != nil {
		return nil, err
	}
	if err := s.iam.AppendAuditEvent(s.db.Gorm().WithContext(ctx), principal, organizationID, "prospecting_sweep.swept", "prospecting_sweep", record.ID, map[string]string{"status": status}); err != nil {
		return nil, err
	}
	return sweepFromModel(updated, sectors), nil
}

// ListSweepsParams filters/paginates ListSweeps.
type ListSweepsParams struct {
	OrganizationID string
	Limit          int
	Offset         int
}

// ListSweeps returns organizationID's sweeps, newest first - lets a caller
// (e.g. the console's Sweeps page) show a persistent history instead of
// only sweeps it triggered itself this session. Requires
// prospecting.read/prospecting.manage/organization.manage, same gate as
// ListBusinesses/GetSettings - a hard error on missing permission, not the
// softer "empty list" degradation some other domains use.
func (s *Service) ListSweeps(ctx context.Context, principal *iam.Principal, params ListSweepsParams) ([]Sweep, int, error) {
	if principal == nil {
		return nil, 0, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	if organizationID == "" {
		return nil, 0, ErrInvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "prospecting.read", "prospecting.manage", "organization.manage"); err != nil {
			return nil, 0, err
		}
	}
	limit := params.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	offset := params.Offset
	if offset < 0 {
		offset = 0
	}

	tx := s.db.Gorm().WithContext(ctx).Model(&sdb.ProspectingSweep{}).Where("organization_id = ?", organizationID)
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var records []sdb.ProspectingSweep
	if err := s.db.Gorm().WithContext(ctx).Where("organization_id = ?", organizationID).
		Order("created_at desc").Limit(limit).Offset(offset).Find(&records).Error; err != nil {
		return nil, 0, err
	}
	out := make([]Sweep, 0, len(records))
	for _, r := range records {
		out = append(out, *sweepFromModel(r, sectorsFromJSON(r.SectorsJSON)))
	}
	return out, int(total), nil
}

// ListBusinesses pages through one sweep's discovered candidates. Requires
// prospecting.read/prospecting.manage on the sweep's own organization.
func (s *Service) ListBusinesses(ctx context.Context, principal *iam.Principal, params ListBusinessesParams) ([]Business, int, error) {
	sweep, err := s.mustLoadSweep(ctx, principal, params.SweepID, "prospecting.read", "prospecting.manage", "organization.manage")
	if err != nil {
		return nil, 0, err
	}

	limit := params.Limit
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	offset := params.Offset
	if offset < 0 {
		offset = 0
	}
	q := s.db.Gorm().WithContext(ctx).Model(&sdb.ProspectingBusiness{}).Where("sweep_id = ?", sweep.ID)
	if params.MinScore > 0 {
		q = q.Where("reachability_score >= ?", params.MinScore)
	}
	if params.HasPhone {
		q = q.Where("phone != ''")
	}
	if strings.TrimSpace(params.Sector) != "" {
		q = q.Where("sector = ?", strings.TrimSpace(params.Sector))
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []sdb.ProspectingBusiness
	if err := q.Order("reachability_score DESC").Limit(limit).Offset(offset).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	out := make([]Business, 0, len(rows))
	for _, row := range rows {
		out = append(out, *businessFromModel(row))
	}
	return out, int(total), nil
}

// ─── Internal helpers ───────────────────────────────────────────────────

func (s *Service) mustLoadSweep(ctx context.Context, principal *iam.Principal, sweepID string, permissionCodes ...string) (*sdb.ProspectingSweep, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	sweepID = strings.TrimSpace(sweepID)
	if sweepID == "" {
		return nil, ErrInvalidInput("sweep_id is required")
	}
	var record sdb.ProspectingSweep
	if err := s.db.Gorm().WithContext(ctx).First(&record, "id = ?", sweepID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("sweep not found")
		}
		return nil, err
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, record.OrganizationID, permissionCodes...); err != nil {
			return nil, err
		}
	}
	return &record, nil
}

func (s *Service) placesClient(ctx context.Context, organizationID string) (*prospectingcore.Client, error) {
	record, err := s.loadSettings(ctx, organizationID)
	if err != nil {
		return nil, err
	}
	apiKey, err := decryptSecret(s.db.Gorm().WithContext(ctx), organizationID, record.EncryptedAPIKey)
	if err != nil {
		return nil, err
	}
	client := prospectingcore.NewClient(apiKey, s.cache(), usageAdapter{db: s.db, organizationID: organizationID}, record.DailyCap)
	if s.testRoundTripper != nil {
		client.SetHTTPClient(&http.Client{Transport: s.testRoundTripper})
	}
	return client, nil
}

func (s *Service) cache() prospectingcore.Cache {
	return cacheAdapter{db: s.db}
}

func (s *Service) existingPlaceIDs(ctx context.Context, sweepID string) (map[string]bool, error) {
	var placeIDs []string
	if err := s.db.Gorm().WithContext(ctx).
		Model(&sdb.ProspectingBusiness{}).
		Where("sweep_id = ?", sweepID).
		Pluck("place_id", &placeIDs).Error; err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(placeIDs))
	for _, id := range placeIDs {
		out[id] = true
	}
	return out, nil
}

// findLatestByOrgAndPlaceID looks up the most recently updated business row
// for (organizationID, placeID) across ALL of the org's sweeps — the
// org-scoped equivalent of the local service's FindLatestByUserAndPlaceID,
// this is what makes cross-sweep reuse a team benefit instead of a
// per-person one.
func (s *Service) findLatestByOrgAndPlaceID(ctx context.Context, organizationID, placeID string) (*sdb.ProspectingBusiness, bool, error) {
	var row sdb.ProspectingBusiness
	err := s.db.Gorm().WithContext(ctx).
		Where("organization_id = ? AND place_id = ?", organizationID, placeID).
		Order("updated_at DESC, id DESC").
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return &row, true, nil
}

func (s *Service) upsertBusiness(ctx context.Context, sweepID, organizationID string, business prospectingcore.Business) (*sdb.ProspectingBusiness, error) {
	executivesJSON, err := json.Marshal(business.Executives)
	if err != nil {
		return nil, err
	}
	businessID, err := newID("pbiz")
	if err != nil {
		return nil, err
	}
	row := sdb.ProspectingBusiness{
		ID:                businessID,
		SweepID:           sweepID,
		OrganizationID:    organizationID,
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
	}
	if row.OpeningHoursJSON == "" {
		row.OpeningHoursJSON = "[]"
	}
	if row.ExecutivesJSON == "" || row.ExecutivesJSON == "null" {
		row.ExecutivesJSON = "[]"
	}
	err = s.db.Gorm().WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "sweep_id"}, {Name: "place_id"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"sector", "name", "formatted_address", "postal_code", "city", "lat", "lng",
				"phone", "website", "rating", "user_rating_count", "business_status", "opening_hours_json",
				"siren", "company_name", "executives_json", "match_confidence", "reachability_score",
			}),
		}).Create(&row).Error
	if err != nil {
		return nil, fmt.Errorf("upsert prospecting business: %w", err)
	}
	var stored sdb.ProspectingBusiness
	if err := s.db.Gorm().WithContext(ctx).
		Where("sweep_id = ? AND place_id = ?", sweepID, business.PlaceID).
		First(&stored).Error; err != nil {
		return nil, err
	}
	return &stored, nil
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

func sweepFromModel(row sdb.ProspectingSweep, sectors []string) *Sweep {
	return &Sweep{
		ID:                  row.ID,
		OrganizationID:      row.OrganizationID,
		CreatedByUserID:     row.CreatedByUserID,
		Country:             row.Country,
		AreaQuery:           row.AreaQuery,
		AreaLabel:           row.AreaLabel,
		Center:              GeoPoint{Lat: row.CenterLat, Lng: row.CenterLng},
		RadiusKM:            row.RadiusKM,
		Sectors:             sectors,
		NextUnitIndex:       row.NextUnitIndex,
		TotalUnits:          row.TotalUnits,
		Status:              row.Status,
		BusinessesFound:     row.BusinessesFound,
		RealPlacesCallsUsed: row.RealPlacesCallsUsed,
		LastError:           row.LastError,
		CreatedAt:           row.CreatedAt,
		UpdatedAt:           row.UpdatedAt,
		CompletedAt:         row.CompletedAt,
	}
}

func businessFromModel(row sdb.ProspectingBusiness) *Business {
	var executives []Executive
	_ = json.Unmarshal([]byte(row.ExecutivesJSON), &executives)
	return &Business{
		Business: prospectingcore.Business{
			SweepID:           row.SweepID,
			PlaceID:           row.PlaceID,
			Sector:            row.Sector,
			Name:              row.Name,
			FormattedAddress:  row.FormattedAddress,
			PostalCode:        row.PostalCode,
			City:              row.City,
			Location:          GeoPoint{Lat: row.Lat, Lng: row.Lng},
			Phone:             row.Phone,
			Website:           row.Website,
			Rating:            row.Rating,
			UserRatingCount:   row.UserRatingCount,
			BusinessStatus:    row.BusinessStatus,
			OpeningHoursJSON:  row.OpeningHoursJSON,
			SIREN:             row.SIREN,
			CompanyName:       row.CompanyName,
			Executives:        executives,
			MatchConfidence:   row.MatchConfidence,
			ReachabilityScore: row.ReachabilityScore,
		},
		ID:        row.ID,
		CreatedAt: row.CreatedAt,
		UpdatedAt: row.UpdatedAt,
	}
}
