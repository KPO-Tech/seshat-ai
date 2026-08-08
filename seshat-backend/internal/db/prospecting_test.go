package db

import (
	"context"
	"testing"
	"time"
)

func TestProspectingCacheStore_SetGetAndExpiry(t *testing.T) {
	database := openTestDB(t)
	store, err := NewProspectingCacheStore(database)
	if err != nil {
		t.Fatalf("NewProspectingCacheStore: %v", err)
	}
	ctx := context.Background()

	if err := store.Set(ctx, "geocode:abc", ProspectingCacheSourceGeocode, `{"lat":1}`, 200, time.Hour); err != nil {
		t.Fatalf("Set: %v", err)
	}
	entry, found, err := store.Get(ctx, "geocode:abc")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if !found {
		t.Fatal("expected cache hit")
	}
	if entry.ValueJSON != `{"lat":1}` || entry.StatusCode != 200 {
		t.Fatalf("unexpected entry: %+v", entry)
	}

	// A negative TTL puts ExpiresAt in the past - Get must treat it as a miss.
	if err := store.Set(ctx, "geocode:expired", ProspectingCacheSourceGeocode, `{}`, 200, -time.Hour); err != nil {
		t.Fatalf("Set (expired): %v", err)
	}
	_, found, err = store.Get(ctx, "geocode:expired")
	if err != nil {
		t.Fatalf("Get (expired): %v", err)
	}
	if found {
		t.Fatal("expected expired entry to be treated as a miss")
	}

	// Absent key is also a clean miss, not an error.
	_, found, err = store.Get(ctx, "geocode:never-set")
	if err != nil {
		t.Fatalf("Get (absent): %v", err)
	}
	if found {
		t.Fatal("expected absent key to be a miss")
	}
}

func TestProspectingCacheStore_SetOverwritesOnConflict(t *testing.T) {
	database := openTestDB(t)
	store, err := NewProspectingCacheStore(database)
	if err != nil {
		t.Fatalf("NewProspectingCacheStore: %v", err)
	}
	ctx := context.Background()

	if err := store.Set(ctx, "geocode:key", ProspectingCacheSourceGeocode, "first", 200, time.Hour); err != nil {
		t.Fatalf("Set: %v", err)
	}
	if err := store.Set(ctx, "geocode:key", ProspectingCacheSourceGeocode, "second", 200, time.Hour); err != nil {
		t.Fatalf("Set (overwrite): %v", err)
	}
	entry, found, err := store.Get(ctx, "geocode:key")
	if err != nil || !found {
		t.Fatalf("Get: found=%v err=%v", found, err)
	}
	if entry.ValueJSON != "second" {
		t.Fatalf("expected overwritten value, got %q", entry.ValueJSON)
	}
}

func TestProspectingUsageStore_IncrementAndGetTotals(t *testing.T) {
	database := openTestDB(t)
	store, err := NewProspectingUsageStore(database)
	if err != nil {
		t.Fatalf("NewProspectingUsageStore: %v", err)
	}
	ctx := context.Background()
	periodKey := DayPeriodKey(time.Now())

	if _, err := store.IncrementSearchCalls(ctx, periodKey, 3); err != nil {
		t.Fatalf("IncrementSearchCalls: %v", err)
	}
	if _, err := store.IncrementDetailsCalls(ctx, periodKey, 2); err != nil {
		t.Fatalf("IncrementDetailsCalls: %v", err)
	}
	if _, err := store.IncrementSearchCalls(ctx, periodKey, 1); err != nil {
		t.Fatalf("IncrementSearchCalls (again): %v", err)
	}

	search, details, err := store.GetTotals(ctx, periodKey)
	if err != nil {
		t.Fatalf("GetTotals: %v", err)
	}
	if search != 4 || details != 2 {
		t.Fatalf("GetTotals = (search=%d, details=%d), want (4, 2)", search, details)
	}

	// A different period key starts fresh.
	search, details, err = store.GetTotals(ctx, "1970-01-01")
	if err != nil {
		t.Fatalf("GetTotals (other period): %v", err)
	}
	if search != 0 || details != 0 {
		t.Fatalf("expected zero totals for an untouched period, got (%d, %d)", search, details)
	}
}

func TestProspectingSweepStore_CreateAndUpdateProgress(t *testing.T) {
	database := openTestDB(t)
	store, err := NewProspectingSweepStore(database)
	if err != nil {
		t.Fatalf("NewProspectingSweepStore: %v", err)
	}
	ctx := context.Background()

	sweep, err := store.Create(ctx, CreateProspectingSweepParams{
		UserID:      "user-1",
		AreaQuery:   "Lille",
		AreaLabel:   "Lille, France",
		CenterLat:   50.6292,
		CenterLng:   3.0573,
		RadiusKM:    5,
		SectorsJSON: `["boulangerie"]`,
		GridJSON:    `[{"Lat":50.6292,"Lng":3.0573}]`,
		TotalUnits:  1,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if sweep.Status != ProspectingSweepStatusRunning {
		t.Fatalf("expected running status, got %q", sweep.Status)
	}
	if sweep.Country != "fr" {
		t.Fatalf("expected default country 'fr', got %q", sweep.Country)
	}

	if err := store.UpdateProgress(ctx, UpdateProspectingSweepProgressParams{
		ID:                  sweep.ID,
		NextUnitIndex:       1,
		Status:              ProspectingSweepStatusCompleted,
		BusinessesFound:     3,
		RealPlacesCallsUsed: 5,
	}); err != nil {
		t.Fatalf("UpdateProgress: %v", err)
	}

	reloaded, err := store.GetByID(ctx, sweep.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if reloaded.Status != ProspectingSweepStatusCompleted || reloaded.NextUnitIndex != 1 || reloaded.BusinessesFound != 3 {
		t.Fatalf("unexpected sweep after update: %+v", reloaded)
	}
	if reloaded.CompletedAt.IsZero() {
		t.Fatal("expected CompletedAt to be set once status is completed")
	}
}

func TestProspectingSweepStore_GetByIDNotFound(t *testing.T) {
	database := openTestDB(t)
	store, err := NewProspectingSweepStore(database)
	if err != nil {
		t.Fatalf("NewProspectingSweepStore: %v", err)
	}
	if _, err := store.GetByID(context.Background(), "does-not-exist"); err == nil {
		t.Fatal("expected an error for a missing sweep")
	}
}

func TestProspectingBusinessStore_UpsertIsIdempotentOnSweepAndPlace(t *testing.T) {
	database := openTestDB(t)
	sweeps, err := NewProspectingSweepStore(database)
	if err != nil {
		t.Fatalf("NewProspectingSweepStore: %v", err)
	}
	businesses, err := NewProspectingBusinessStore(database)
	if err != nil {
		t.Fatalf("NewProspectingBusinessStore: %v", err)
	}
	ctx := context.Background()

	sweep, err := sweeps.Create(ctx, CreateProspectingSweepParams{UserID: "user-1", AreaQuery: "Lille", TotalUnits: 1})
	if err != nil {
		t.Fatalf("Create sweep: %v", err)
	}

	first, err := businesses.Upsert(ctx, UpsertProspectingBusinessParams{
		SweepID: sweep.ID, PlaceID: "place-1", Name: "Boulangerie Martin", ReachabilityScore: 40,
	})
	if err != nil {
		t.Fatalf("Upsert (first): %v", err)
	}
	second, err := businesses.Upsert(ctx, UpsertProspectingBusinessParams{
		SweepID: sweep.ID, PlaceID: "place-1", Name: "Boulangerie Martin", Phone: "0102030405", ReachabilityScore: 65,
	})
	if err != nil {
		t.Fatalf("Upsert (second): %v", err)
	}
	if first.ID != second.ID {
		t.Fatalf("expected the same row on conflict, got %q then %q", first.ID, second.ID)
	}
	if second.ReachabilityScore != 65 || second.Phone != "0102030405" {
		t.Fatalf("expected the second upsert's values to win, got %+v", second)
	}

	list, total, err := businesses.ListBySweep(ctx, sweep.ID, ListProspectingBusinessesFilter{}, 0, 0)
	if err != nil {
		t.Fatalf("ListBySweep: %v", err)
	}
	if total != 1 || len(list) != 1 {
		t.Fatalf("expected exactly one row after two upserts of the same place, got total=%d len=%d", total, len(list))
	}

	existing, err := businesses.ExistingPlaceIDs(ctx, sweep.ID)
	if err != nil {
		t.Fatalf("ExistingPlaceIDs: %v", err)
	}
	if !existing["place-1"] {
		t.Fatal("expected place-1 to be in the existing set")
	}
}

func TestProspectingBusinessStore_ListBySweepFiltersAndOrders(t *testing.T) {
	database := openTestDB(t)
	sweeps, err := NewProspectingSweepStore(database)
	if err != nil {
		t.Fatalf("NewProspectingSweepStore: %v", err)
	}
	businesses, err := NewProspectingBusinessStore(database)
	if err != nil {
		t.Fatalf("NewProspectingBusinessStore: %v", err)
	}
	ctx := context.Background()

	sweep, err := sweeps.Create(ctx, CreateProspectingSweepParams{UserID: "user-1", AreaQuery: "Lille", TotalUnits: 1})
	if err != nil {
		t.Fatalf("Create sweep: %v", err)
	}

	seed := []UpsertProspectingBusinessParams{
		{SweepID: sweep.ID, PlaceID: "p1", Name: "Low score no phone", Sector: "boulangerie", ReachabilityScore: 20},
		{SweepID: sweep.ID, PlaceID: "p2", Name: "High score with phone", Sector: "boulangerie", Phone: "0102030405", ReachabilityScore: 90},
		{SweepID: sweep.ID, PlaceID: "p3", Name: "Mid score, other sector", Sector: "coiffeur", Phone: "0102030406", ReachabilityScore: 50},
	}
	for _, p := range seed {
		if _, err := businesses.Upsert(ctx, p); err != nil {
			t.Fatalf("Upsert %s: %v", p.PlaceID, err)
		}
	}

	all, total, err := businesses.ListBySweep(ctx, sweep.ID, ListProspectingBusinessesFilter{}, 0, 0)
	if err != nil {
		t.Fatalf("ListBySweep (all): %v", err)
	}
	if total != 3 || len(all) != 3 {
		t.Fatalf("expected 3 results, got total=%d len=%d", total, len(all))
	}
	if all[0].PlaceID != "p2" {
		t.Fatalf("expected highest score first, got %q", all[0].PlaceID)
	}

	withPhone, total, err := businesses.ListBySweep(ctx, sweep.ID, ListProspectingBusinessesFilter{HasPhone: true}, 0, 0)
	if err != nil {
		t.Fatalf("ListBySweep (has_phone): %v", err)
	}
	if total != 2 {
		t.Fatalf("expected 2 results with a phone, got %d", total)
	}
	for _, b := range withPhone {
		if b.Phone == "" {
			t.Fatalf("has_phone filter leaked a result without a phone: %+v", b)
		}
	}

	bySector, total, err := businesses.ListBySweep(ctx, sweep.ID, ListProspectingBusinessesFilter{Sector: "coiffeur"}, 0, 0)
	if err != nil {
		t.Fatalf("ListBySweep (sector): %v", err)
	}
	if total != 1 || bySector[0].PlaceID != "p3" {
		t.Fatalf("expected exactly p3 for sector=coiffeur, got total=%d results=%+v", total, bySector)
	}

	highScore, total, err := businesses.ListBySweep(ctx, sweep.ID, ListProspectingBusinessesFilter{MinScore: 60}, 0, 0)
	if err != nil {
		t.Fatalf("ListBySweep (min_score): %v", err)
	}
	if total != 1 || highScore[0].PlaceID != "p2" {
		t.Fatalf("expected exactly p2 for min_score=60, got total=%d results=%+v", total, highScore)
	}
}
