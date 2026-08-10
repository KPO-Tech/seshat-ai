package prospectingcore

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	placesSearchSuccessTTL  = 7 * 24 * time.Hour
	placesDetailsSuccessTTL = 30 * 24 * time.Hour

	// Google's own hard ceiling on Text Search / Nearby Search: 20 results
	// per page, 3 pages max - confirmed via Google's published docs, not
	// something a higher pricing tier lifts.
	placesMaxPages        = 3
	placesResultsPerPage  = 20
	placesPageTokenWaitMs = 2000 // Google requires a short delay before a fresh nextPageToken becomes usable
)

// Two-tier field masks: search uses only the cheap "Pro" SKU fields, details
// is the only call allowed to touch the more expensive "Enterprise" fields
// (rating/userRatingCount/regularOpeningHours) - mirrors the cost-discipline
// pattern reviewed from the reference implementation. Editing either mask
// changes what Google bills for that call type.
const (
	searchFieldMask  = "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.addressComponents,nextPageToken"
	detailsFieldMask = "id,nationalPhoneNumber,internationalPhoneNumber,websiteUri,rating,userRatingCount,regularOpeningHours,businessStatus"
)

// IsConfigured reports whether GOOGLE_PLACES_API_KEY is set - callers use
// this to decide whether to register prospecting tools/routes at all, same
// convention as inboxgmail.IsConfigured().
func IsConfigured() bool {
	return strings.TrimSpace(os.Getenv("GOOGLE_PLACES_API_KEY")) != ""
}

// PlaceSummary is one Text Search result.
type PlaceSummary struct {
	PlaceID          string
	Name             string
	FormattedAddress string
	PostalCode       string
	City             string
	Location         GeoPoint
	PrimaryType      string
}

// PlaceDetails is one Place Details result.
type PlaceDetails struct {
	Phone            string
	Website          string
	Rating           float64
	UserRatingCount  int
	BusinessStatus   string
	OpeningHoursJSON string
}

// ErrDailyCapReached signals the configured daily real-call budget is
// exhausted - callers treat this as a clean stop, not a hard failure.
var ErrDailyCapReached = fmt.Errorf("prospecting: daily Places call cap reached")

type Client struct {
	apiKey   string
	http     *http.Client
	cache    Cache
	usage    UsageTracker
	dailyCap int
}

func NewClient(apiKey string, cache Cache, usage UsageTracker, dailyCap int) *Client {
	return &Client{
		apiKey:   apiKey,
		http:     &http.Client{Timeout: 15 * time.Second},
		cache:    cache,
		usage:    usage,
		dailyCap: dailyCap,
	}
}

// HTTPClient returns the client's underlying *http.Client, for callers that
// need to make other cached calls (Geocode, EnrichCompany) sharing the same
// timeout/transport instead of constructing their own.
func (c *Client) HTTPClient() *http.Client { return c.http }

// SetHTTPClient overrides the client's underlying *http.Client - mainly for
// tests that need to intercept requests via a custom http.RoundTripper
// instead of touching the real network (Client's fields are unexported, so
// a white-box test in another package can no longer set them via a struct
// literal the way seshat-backend's tests did before this package moved out
// of seshat-backend).
func (c *Client) SetHTTPClient(hc *http.Client) { c.http = hc }

// checkDailyCap returns ErrDailyCapReached if combined search+details real
// calls today already meet or exceed the cap - checked before every real
// (non-cache-hit) network call, never against cache hits.
func (c *Client) checkDailyCap(ctx context.Context) error {
	if c.usage == nil || c.dailyCap <= 0 {
		return nil
	}
	search, details, err := c.usage.GetTotals(ctx, dayPeriodKey(time.Now()))
	if err != nil {
		return fmt.Errorf("check daily cap: %w", err)
	}
	if search+details >= int64(c.dailyCap) {
		return ErrDailyCapReached
	}
	return nil
}

// dayPeriodKey mirrors seshat-backend's db.DayPeriodKey (a UTC "2006-01-02"
// day bucket) - duplicated rather than imported since it's one line and
// this package must not depend on internal/db.
func dayPeriodKey(t time.Time) string {
	return t.UTC().Format("2006-01-02")
}

type placesSearchRequestBody struct {
	TextQuery    string        `json:"textQuery"`
	LocationBias *locationBias `json:"locationBias,omitempty"`
	PageToken    string        `json:"pageToken,omitempty"`
}

type locationBias struct {
	Circle struct {
		Center struct {
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
		} `json:"center"`
		Radius float64 `json:"radius"`
	} `json:"circle"`
}

type placesSearchResponse struct {
	Places []struct {
		ID          string `json:"id"`
		DisplayName struct {
			Text string `json:"text"`
		} `json:"displayName"`
		FormattedAddress string `json:"formattedAddress"`
		Location         struct {
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
		} `json:"location"`
		PrimaryType       string `json:"primaryType"`
		AddressComponents []struct {
			Types    []string `json:"types"`
			LongText string   `json:"longText"`
		} `json:"addressComponents"`
	} `json:"places"`
	NextPageToken string `json:"nextPageToken"`
}

// TextSearch sweeps one (textQuery, bias) tile, internally paging up to
// Google's own 60-result ceiling (20/page, 3 pages). Only the first page is
// cached - subsequent pages are reached via a one-time-use nextPageToken
// that differs on every fresh call, so caching them provides no future
// benefit and they always count as real calls against the daily cap.
func (c *Client) TextSearch(ctx context.Context, textQuery string, bias GeoPoint, radiusM float64) ([]PlaceSummary, error) {
	var all []PlaceSummary
	pageToken := ""
	for page := 0; page < placesMaxPages; page++ {
		var body []byte
		var err error
		if page == 0 {
			key := cacheKey(CacheSourcePlacesSearch, textQuery, formatFloat(bias.Lat), formatFloat(bias.Lng), formatFloat(radiusM))
			body, err = doCached(ctx, c.http, c.cache, CacheSourcePlacesSearch, key, func() (*http.Request, error) {
				if err := c.checkDailyCap(ctx); err != nil {
					return nil, err
				}
				req, err := c.buildSearchRequest(textQuery, bias, radiusM, "")
				if err == nil {
					c.recordSearchCall(ctx)
				}
				return req, err
			}, placesSearchSuccessTTL)
		} else {
			if err := c.checkDailyCap(ctx); err != nil {
				return all, err
			}
			time.Sleep(placesPageTokenWaitMs * time.Millisecond)
			req, buildErr := c.buildSearchRequest(textQuery, bias, radiusM, pageToken)
			if buildErr != nil {
				return all, buildErr
			}
			c.recordSearchCall(ctx)
			resp, doErr := c.http.Do(req.WithContext(ctx))
			if doErr != nil {
				return all, fmt.Errorf("places text search (page %d): %w", page, doErr)
			}
			defer resp.Body.Close()
			var buf bytes.Buffer
			if _, err := buf.ReadFrom(resp.Body); err != nil {
				return all, err
			}
			body = buf.Bytes()
		}
		if err != nil {
			return all, err
		}

		var parsed placesSearchResponse
		if err := json.Unmarshal(body, &parsed); err != nil {
			return all, fmt.Errorf("places text search: decode response: %w", err)
		}
		for _, p := range parsed.Places {
			all = append(all, PlaceSummary{
				PlaceID:          p.ID,
				Name:             p.DisplayName.Text,
				FormattedAddress: p.FormattedAddress,
				PostalCode:       addressComponent(p.AddressComponents, "postal_code"),
				City:             addressComponent(p.AddressComponents, "locality"),
				Location:         GeoPoint{Lat: p.Location.Latitude, Lng: p.Location.Longitude},
				PrimaryType:      p.PrimaryType,
			})
		}
		if parsed.NextPageToken == "" || len(parsed.Places) < placesResultsPerPage {
			break
		}
		pageToken = parsed.NextPageToken
	}
	return all, nil
}

func (c *Client) buildSearchRequest(textQuery string, bias GeoPoint, radiusM float64, pageToken string) (*http.Request, error) {
	reqBody := placesSearchRequestBody{TextQuery: textQuery, PageToken: pageToken}
	if pageToken == "" {
		lb := &locationBias{}
		lb.Circle.Center.Latitude = bias.Lat
		lb.Circle.Center.Longitude = bias.Lng
		lb.Circle.Radius = radiusM
		reqBody.LocationBias = lb
	}
	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPost, "https://places.googleapis.com/v1/places:searchText", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-Api-Key", c.apiKey)
	req.Header.Set("X-Goog-FieldMask", searchFieldMask)
	return req, nil
}

func (c *Client) recordSearchCall(ctx context.Context) {
	if c.usage != nil {
		_, _ = c.usage.IncrementSearchCalls(ctx, dayPeriodKey(time.Now()), 1)
	}
}

type placesDetailsResponse struct {
	NationalPhoneNumber string          `json:"nationalPhoneNumber"`
	WebsiteUri          string          `json:"websiteUri"`
	Rating              float64         `json:"rating"`
	UserRatingCount     int             `json:"userRatingCount"`
	BusinessStatus      string          `json:"businessStatus"`
	RegularOpeningHours json.RawMessage `json:"regularOpeningHours"`
}

// PlaceDetails fetches the expensive fields for one already-discovered
// place - only called for newly-seen candidates, never speculatively.
func (c *Client) PlaceDetails(ctx context.Context, placeID string) (*PlaceDetails, error) {
	placeID = strings.TrimSpace(placeID)
	if placeID == "" {
		return nil, fmt.Errorf("place details: place_id is required")
	}
	key := cacheKey(CacheSourcePlacesDetails, placeID)
	body, err := doCached(ctx, c.http, c.cache, CacheSourcePlacesDetails, key, func() (*http.Request, error) {
		if err := c.checkDailyCap(ctx); err != nil {
			return nil, err
		}
		req, err := http.NewRequest(http.MethodGet, "https://places.googleapis.com/v1/places/"+placeID, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("X-Goog-Api-Key", c.apiKey)
		req.Header.Set("X-Goog-FieldMask", detailsFieldMask)
		if c.usage != nil {
			_, _ = c.usage.IncrementDetailsCalls(ctx, dayPeriodKey(time.Now()), 1)
		}
		return req, nil
	}, placesDetailsSuccessTTL)
	if err != nil {
		return nil, err
	}

	var parsed placesDetailsResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("place details: decode response: %w", err)
	}
	openingHours := "[]"
	if len(parsed.RegularOpeningHours) > 0 {
		openingHours = string(parsed.RegularOpeningHours)
	}
	return &PlaceDetails{
		Phone:            parsed.NationalPhoneNumber,
		Website:          parsed.WebsiteUri,
		Rating:           parsed.Rating,
		UserRatingCount:  parsed.UserRatingCount,
		BusinessStatus:   parsed.BusinessStatus,
		OpeningHoursJSON: openingHours,
	}, nil
}

func addressComponent(components []struct {
	Types    []string `json:"types"`
	LongText string   `json:"longText"`
}, componentType string) string {
	for _, c := range components {
		for _, t := range c.Types {
			if t == componentType {
				return c.LongText
			}
		}
	}
	return ""
}

func formatFloat(f float64) string {
	return strconv.FormatFloat(f, 'f', 6, 64)
}
