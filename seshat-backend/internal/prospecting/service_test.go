package prospecting

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	prospectingcore "github.com/EngineerProjects/seshat-ai/seshat-core/prospecting"
)

// stubRoundTripper intercepts requests by host and serves them from an
// in-memory handler, so tests never touch the real network - no cache miss
// during a test can accidentally hit api-adresse.data.gouv.fr, Google
// Places, or recherche-entreprises.api.gouv.fr.
type stubRoundTripper struct {
	geocodeCalls int
	searchCalls  int
	detailsCalls int
	gouvCalls    int
}

func (rt *stubRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	var body string
	status := http.StatusOK
	switch {
	case req.URL.Host == "api-adresse.data.gouv.fr":
		rt.geocodeCalls++
		body = `{"features":[{"geometry":{"coordinates":[3.0573,50.6292]},"properties":{"label":"Lille, France","postcode":"59000","city":"Lille"}}]}`
	case req.URL.Host == "recherche-entreprises.api.gouv.fr":
		rt.gouvCalls++
		body = `{"results":[{"siren":"123456789","nom_complet":"Boulangerie Martin","siege":{"code_postal":"59000"},"dirigeants":[{"prenoms":"Jean","nom":"Martin","qualite":"Gerant"}]}]}`
	case req.URL.Host == "places.googleapis.com" && req.Method == http.MethodPost:
		rt.searchCalls++
		body = fmt.Sprintf(`{"places":[{"id":"place-%d","displayName":{"text":"Boulangerie Martin"},"formattedAddress":"1 rue Test, 59000 Lille","location":{"latitude":50.63,"longitude":3.06},"primaryType":"bakery","addressComponents":[{"types":["postal_code"],"longText":"59000"},{"types":["locality"],"longText":"Lille"}]}]}`, rt.searchCalls)
	case req.URL.Host == "places.googleapis.com" && req.Method == http.MethodGet:
		rt.detailsCalls++
		body = `{"nationalPhoneNumber":"0102030405","websiteUri":"https://example.com","rating":4.5,"userRatingCount":42,"businessStatus":"OPERATIONAL"}`
	default:
		return nil, fmt.Errorf("stubRoundTripper: no handler for %s %s", req.Method, req.URL.String())
	}
	rec := httptest.NewRecorder()
	rec.WriteHeader(status)
	_, _ = rec.WriteString(body)
	resp := rec.Result()
	resp.Request = req
	return resp, nil
}

func openTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	return database
}

// newTestService builds a Service whose Places client's http.Client is
// wired to rt instead of the real network - a white-box test helper, only
// possible because this file lives in package prospecting.
func newTestService(t *testing.T, database *db.DB, rt *stubRoundTripper, dailyCap int) *Service {
	t.Helper()
	sweeps, err := db.NewProspectingSweepStore(database)
	if err != nil {
		t.Fatalf("NewProspectingSweepStore: %v", err)
	}
	businesses, err := db.NewProspectingBusinessStore(database)
	if err != nil {
		t.Fatalf("NewProspectingBusinessStore: %v", err)
	}
	cache, err := db.NewProspectingCacheStore(database)
	if err != nil {
		t.Fatalf("NewProspectingCacheStore: %v", err)
	}
	usage, err := db.NewProspectingUsageStore(database)
	if err != nil {
		t.Fatalf("NewProspectingUsageStore: %v", err)
	}
	adapter := cacheStoreAdapter{store: cache}
	places := prospectingcore.NewClient("test-key", adapter, usage, dailyCap)
	places.SetHTTPClient(&http.Client{Transport: rt})
	return &Service{
		sweeps:       sweeps,
		businesses:   businesses,
		cache:        cache,
		cacheAdapter: adapter,
		usage:        usage,
		places:       places,
	}
}

func testPrincipal(userID string) *backendauth.Principal {
	return &backendauth.Principal{User: backendauth.User{ID: userID}}
}

func TestService_SweepArea_CreatesSweepAndEnrichesBusiness(t *testing.T) {
	database := openTestDB(t)
	rt := &stubRoundTripper{}
	svc := newTestService(t, database, rt, 100)
	ctx := context.Background()
	principal := testPrincipal("user-1")

	sweep, err := svc.SweepArea(ctx, principal, SweepAreaParams{
		AreaQuery: "Lille",
		Sectors:   []string{"boulangerie"},
		// 0.5km with the default 2km cell size keeps BuildGrid to a single
		// cell (the center itself) - RadiusKM<=0 would instead trigger
		// SweepArea's own "not specified, default to 5km" fallback.
		RadiusKM: 0.5,
		MaxTiles: 10,
	})
	if err != nil {
		t.Fatalf("SweepArea: %v", err)
	}
	if sweep.Status != SweepStatusCompleted {
		t.Fatalf("expected completed status for a 1-unit sweep, got %q (last_error=%q)", sweep.Status, sweep.LastError)
	}
	if sweep.BusinessesFound != 1 {
		t.Fatalf("expected 1 business found, got %d", sweep.BusinessesFound)
	}
	if sweep.AreaLabel != "Lille, France" {
		t.Fatalf("expected geocoded area label, got %q", sweep.AreaLabel)
	}

	businesses, total, err := svc.ListBusinesses(ctx, principal, ListBusinessesParams{SweepID: sweep.ID})
	if err != nil {
		t.Fatalf("ListBusinesses: %v", err)
	}
	if total != 1 || len(businesses) != 1 {
		t.Fatalf("expected exactly 1 business, got total=%d len=%d", total, len(businesses))
	}
	b := businesses[0]
	if b.Phone != "0102030405" || b.Website != "https://example.com" {
		t.Fatalf("expected Place Details to be merged in, got %+v", b)
	}
	if b.SIREN != "123456789" || len(b.Executives) != 1 {
		t.Fatalf("expected French registry enrichment to be merged in, got %+v", b)
	}
	// phone + website + SIREN + executive + complete address = 100
	if b.ReachabilityScore != 100 {
		t.Fatalf("expected a full reachability score, got %d", b.ReachabilityScore)
	}
}

func TestService_SweepArea_ResumesAcrossCalls(t *testing.T) {
	database := openTestDB(t)
	rt := &stubRoundTripper{}
	svc := newTestService(t, database, rt, 1000)
	ctx := context.Background()
	principal := testPrincipal("user-1")

	// Two sectors over a radius wide enough to produce more than one grid
	// cell, so total work units > maxTiles and a second call is required.
	first, err := svc.SweepArea(ctx, principal, SweepAreaParams{
		AreaQuery: "Lille",
		Sectors:   []string{"boulangerie", "coiffeur"},
		RadiusKM:  6,
		MaxTiles:  1,
	})
	if err != nil {
		t.Fatalf("SweepArea (first call): %v", err)
	}
	if first.TotalUnits <= 1 {
		t.Fatalf("test setup expected more than 1 work unit, got %d", first.TotalUnits)
	}
	if first.Status == SweepStatusCompleted {
		t.Fatal("expected the first call (max_tiles=1) to not finish a multi-unit sweep")
	}
	if first.NextUnitIndex != 1 {
		t.Fatalf("expected the cursor to advance by exactly 1 unit, got %d", first.NextUnitIndex)
	}

	// Continue with the returned sweep_id until it completes.
	current := first
	for i := 0; i < first.TotalUnits+2 && current.Status != SweepStatusCompleted; i++ {
		current, err = svc.SweepArea(ctx, principal, SweepAreaParams{SweepID: first.ID, MaxTiles: 1})
		if err != nil {
			t.Fatalf("SweepArea (resume): %v", err)
		}
	}
	if current.Status != SweepStatusCompleted {
		t.Fatalf("expected the sweep to eventually complete, stuck at status=%q next=%d/%d", current.Status, current.NextUnitIndex, current.TotalUnits)
	}
	if current.NextUnitIndex != current.TotalUnits {
		t.Fatalf("expected the cursor to reach the end, got %d/%d", current.NextUnitIndex, current.TotalUnits)
	}
}

func TestService_SweepArea_CompletedSweepIsANoOp(t *testing.T) {
	database := openTestDB(t)
	rt := &stubRoundTripper{}
	svc := newTestService(t, database, rt, 100)
	ctx := context.Background()
	principal := testPrincipal("user-1")

	sweep, err := svc.SweepArea(ctx, principal, SweepAreaParams{AreaQuery: "Lille", Sectors: []string{"boulangerie"}, RadiusKM: 0.5})
	if err != nil {
		t.Fatalf("SweepArea: %v", err)
	}
	callsAfterFirst := rt.searchCalls

	again, err := svc.SweepArea(ctx, principal, SweepAreaParams{SweepID: sweep.ID})
	if err != nil {
		t.Fatalf("SweepArea (already completed): %v", err)
	}
	if again.Status != SweepStatusCompleted {
		t.Fatalf("expected still-completed status, got %q", again.Status)
	}
	if rt.searchCalls != callsAfterFirst {
		t.Fatalf("expected no further Places calls for an already-completed sweep, calls went from %d to %d", callsAfterFirst, rt.searchCalls)
	}
}

func TestService_SweepArea_OwnershipEnforcedOnResume(t *testing.T) {
	database := openTestDB(t)
	rt := &stubRoundTripper{}
	svc := newTestService(t, database, rt, 100)
	ctx := context.Background()

	sweep, err := svc.SweepArea(ctx, testPrincipal("owner"), SweepAreaParams{
		AreaQuery: "Lille", Sectors: []string{"boulangerie", "coiffeur"}, RadiusKM: 6, MaxTiles: 1,
	})
	if err != nil {
		t.Fatalf("SweepArea: %v", err)
	}

	if _, err := svc.SweepArea(ctx, testPrincipal("someone-else"), SweepAreaParams{SweepID: sweep.ID}); err == nil {
		t.Fatal("expected an error when a different user tries to continue someone else's sweep")
	}
	if _, _, err := svc.ListBusinesses(ctx, testPrincipal("someone-else"), ListBusinessesParams{SweepID: sweep.ID}); err == nil {
		t.Fatal("expected an error when a different user tries to list someone else's sweep results")
	}
}

func TestService_SweepArea_DailyCapProducesPartialNotError(t *testing.T) {
	database := openTestDB(t)
	rt := &stubRoundTripper{}
	svc := newTestService(t, database, rt, 1) // cap of 1, pre-filled below to already be at/over it
	ctx := context.Background()

	// dailyCap <= 0 means "uncapped" (see Client.checkDailyCap), so to
	// simulate "cap already reached" we need a real positive cap that's
	// already met, not zero.
	if _, err := svc.usage.IncrementSearchCalls(ctx, db.DayPeriodKey(time.Now()), 1); err != nil {
		t.Fatalf("seed usage: %v", err)
	}

	sweep, err := svc.SweepArea(ctx, testPrincipal("user-1"), SweepAreaParams{
		AreaQuery: "Lille", Sectors: []string{"boulangerie"}, RadiusKM: 0,
	})
	if err != nil {
		t.Fatalf("SweepArea should return a clean partial result, not an error: %v", err)
	}
	if sweep.Status != SweepStatusPartial {
		t.Fatalf("expected status=partial when the daily cap is reached, got %q", sweep.Status)
	}
	if !strings.Contains(sweep.LastError, "daily") {
		t.Fatalf("expected LastError to mention the daily cap, got %q", sweep.LastError)
	}
	if rt.searchCalls != 0 {
		t.Fatalf("expected zero real Places calls once the cap is already reached, got %d", rt.searchCalls)
	}
}

// fixedPlaceRoundTripper is like stubRoundTripper but always returns the
// SAME place_id (simulating the real world: the same business exists
// whether you sweep it once or twice) - needed to test cross-sweep reuse,
// which stubRoundTripper's ever-incrementing place-%d can never trigger.
type fixedPlaceRoundTripper struct {
	searchCalls  int
	detailsCalls int
	gouvCalls    int
}

func (rt *fixedPlaceRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	var body string
	switch {
	case req.URL.Host == "api-adresse.data.gouv.fr":
		body = `{"features":[{"geometry":{"coordinates":[3.0573,50.6292]},"properties":{"label":"Lille, France","postcode":"59000","city":"Lille"}}]}`
	case req.URL.Host == "recherche-entreprises.api.gouv.fr":
		rt.gouvCalls++
		body = `{"results":[{"siren":"123456789","nom_complet":"Boulangerie Martin","siege":{"code_postal":"59000"},"dirigeants":[{"prenoms":"Jean","nom":"Martin","qualite":"Gerant"}]}]}`
	case req.URL.Host == "places.googleapis.com" && req.Method == http.MethodPost:
		rt.searchCalls++
		body = `{"places":[{"id":"place-fixed","displayName":{"text":"Boulangerie Martin"},"formattedAddress":"1 rue Test, 59000 Lille","location":{"latitude":50.63,"longitude":3.06},"primaryType":"bakery","addressComponents":[{"types":["postal_code"],"longText":"59000"},{"types":["locality"],"longText":"Lille"}]}]}`
	case req.URL.Host == "places.googleapis.com" && req.Method == http.MethodGet:
		rt.detailsCalls++
		body = `{"nationalPhoneNumber":"0102030405","websiteUri":"https://example.com","rating":4.5,"userRatingCount":42,"businessStatus":"OPERATIONAL"}`
	default:
		return nil, fmt.Errorf("fixedPlaceRoundTripper: no handler for %s %s", req.Method, req.URL.String())
	}
	rec := httptest.NewRecorder()
	rec.WriteHeader(http.StatusOK)
	_, _ = rec.WriteString(body)
	resp := rec.Result()
	resp.Request = req
	return resp, nil
}

func TestService_SweepArea_ReusesBusinessAcrossSeparateSweeps(t *testing.T) {
	database := openTestDB(t)
	rt := &fixedPlaceRoundTripper{}

	// Built manually (not via newTestService, which is typed for
	// *stubRoundTripper, not this test's own fixedPlaceRoundTripper).
	sweeps, err := db.NewProspectingSweepStore(database)
	if err != nil {
		t.Fatalf("NewProspectingSweepStore: %v", err)
	}
	businesses, err := db.NewProspectingBusinessStore(database)
	if err != nil {
		t.Fatalf("NewProspectingBusinessStore: %v", err)
	}
	cache, err := db.NewProspectingCacheStore(database)
	if err != nil {
		t.Fatalf("NewProspectingCacheStore: %v", err)
	}
	usage, err := db.NewProspectingUsageStore(database)
	if err != nil {
		t.Fatalf("NewProspectingUsageStore: %v", err)
	}
	adapter := cacheStoreAdapter{store: cache}
	places := prospectingcore.NewClient("test-key", adapter, usage, 100)
	places.SetHTTPClient(&http.Client{Transport: rt})
	svc := &Service{
		sweeps: sweeps, businesses: businesses, cache: cache, cacheAdapter: adapter, usage: usage,
		places: places,
	}
	ctx := context.Background()
	principal := testPrincipal("user-1")

	first, err := svc.SweepArea(ctx, principal, SweepAreaParams{
		AreaQuery: "Lille", Sectors: []string{"boulangerie"}, RadiusKM: 0.5,
	})
	if err != nil {
		t.Fatalf("SweepArea (first): %v", err)
	}
	if first.BusinessesFound != 1 {
		t.Fatalf("expected 1 business in the first sweep, got %d", first.BusinessesFound)
	}
	detailsAfterFirst, gouvAfterFirst := rt.detailsCalls, rt.gouvCalls
	if detailsAfterFirst == 0 || gouvAfterFirst == 0 {
		t.Fatalf("expected the first sweep to make real Details/gouv calls, got details=%d gouv=%d", detailsAfterFirst, gouvAfterFirst)
	}

	// A second, independent sweep (fresh sweep_id) of the same area, same
	// user - the fixed place_id means this "discovers" the same business.
	second, err := svc.SweepArea(ctx, principal, SweepAreaParams{
		AreaQuery: "Lille", Sectors: []string{"boulangerie"}, RadiusKM: 0.5,
	})
	if err != nil {
		t.Fatalf("SweepArea (second): %v", err)
	}
	if second.ID == first.ID {
		t.Fatal("expected a genuinely new sweep, not the same one")
	}
	if second.BusinessesFound != 1 {
		t.Fatalf("expected 1 business in the second sweep too, got %d", second.BusinessesFound)
	}
	if rt.detailsCalls != detailsAfterFirst || rt.gouvCalls != gouvAfterFirst {
		t.Fatalf("expected NO new Details/gouv calls on the second sweep (reuse should have kicked in), details went %d->%d, gouv went %d->%d",
			detailsAfterFirst, rt.detailsCalls, gouvAfterFirst, rt.gouvCalls)
	}

	list, _, err := svc.ListBusinesses(ctx, principal, ListBusinessesParams{SweepID: second.ID})
	if err != nil {
		t.Fatalf("ListBusinesses: %v", err)
	}
	if len(list) != 1 || list[0].Phone != "0102030405" || list[0].SIREN != "123456789" {
		t.Fatalf("expected the reused business to carry over the original enrichment, got %+v", list)
	}
}

func TestService_SweepArea_RejectsMissingAreaAndSectors(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database, &stubRoundTripper{}, 100)
	ctx := context.Background()
	principal := testPrincipal("user-1")

	if _, err := svc.SweepArea(ctx, principal, SweepAreaParams{Sectors: []string{"boulangerie"}}); err == nil {
		t.Fatal("expected an error when area is missing")
	}
	if _, err := svc.SweepArea(ctx, principal, SweepAreaParams{AreaQuery: "Lille"}); err == nil {
		t.Fatal("expected an error when sectors is empty")
	}
}

// Sanity check that the JSON round-trip of a Sweep's stored grid is what
// SweepArea actually consumes - guards against a silent (de)serialization
// mismatch between service.go and types.go.
func TestSectorsAndGridJSONRoundTrip(t *testing.T) {
	sectors := []string{"boulangerie", "coiffeur"}
	grid := []GeoPoint{{Lat: 1, Lng: 2}, {Lat: 3, Lng: 4}}
	sectorsJSON, _ := json.Marshal(sectors)
	gridJSON, _ := json.Marshal(grid)

	if got := sectorsFromJSON(string(sectorsJSON)); len(got) != 2 || got[1] != "coiffeur" {
		t.Fatalf("sectorsFromJSON round-trip mismatch: %v", got)
	}
	if got := gridFromJSON(string(gridJSON)); len(got) != 2 || got[1] != (GeoPoint{Lat: 3, Lng: 4}) {
		t.Fatalf("gridFromJSON round-trip mismatch: %v", got)
	}
}
