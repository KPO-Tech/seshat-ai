package prospectingcore

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const geocodeSuccessTTL = 365 * 24 * time.Hour

// GeocodeResult is what one address/area query resolves to.
type GeocodeResult struct {
	Point    GeoPoint
	Label    string
	Postcode string
	City     string
}

type baseAddressFeatureCollection struct {
	Features []struct {
		Geometry struct {
			Coordinates []float64 `json:"coordinates"` // [lng, lat]
		} `json:"geometry"`
		Properties struct {
			Label    string `json:"label"`
			Postcode string `json:"postcode"`
			City     string `json:"city"`
		} `json:"properties"`
	} `json:"features"`
}

// Geocode resolves a free-text area query (e.g. "Lille" or "21 rue
// Nationale, Tours") to coordinates via France's public, free, keyless
// address API (api-adresse.data.gouv.fr) - it is used as the sweep's
// center point and its label feeds the sweep's stored AreaLabel.
func Geocode(ctx context.Context, httpClient *http.Client, cache Cache, query string) (*GeocodeResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("geocode: query is required")
	}
	key := cacheKey(CacheSourceGeocode, query)
	body, err := doCached(ctx, httpClient, cache, CacheSourceGeocode, key, func() (*http.Request, error) {
		u := "https://api-adresse.data.gouv.fr/search/?q=" + url.QueryEscape(query) + "&limit=1"
		return http.NewRequest(http.MethodGet, u, nil)
	}, geocodeSuccessTTL)
	if err != nil {
		return nil, err
	}

	var parsed baseAddressFeatureCollection
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("geocode: decode response: %w", err)
	}
	if len(parsed.Features) == 0 || len(parsed.Features[0].Geometry.Coordinates) < 2 {
		return nil, fmt.Errorf("geocode: no result for %q", query)
	}
	f := parsed.Features[0]
	return &GeocodeResult{
		Point:    GeoPoint{Lat: f.Geometry.Coordinates[1], Lng: f.Geometry.Coordinates[0]},
		Label:    f.Properties.Label,
		Postcode: f.Properties.Postcode,
		City:     f.Properties.City,
	}, nil
}
