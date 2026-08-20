package cloudprospecting

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	prospectingcore "github.com/EngineerProjects/seshat-ai/core/prospecting"
	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/prospecting"
)

func testPrincipal() *backendauth.Principal {
	return &backendauth.Principal{
		User:                   backendauth.User{ID: "user-1"},
		AuthSession:            backendauth.AuthSession{ID: "session-token-123"},
		ResolvedOrganizationID: "org-1",
	}
}

func TestRemoteServiceSweepAreaPropagatesTokenAndOrgAndConvertsDTO(t *testing.T) {
	var gotAuth string
	var gotBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/prospecting/sweeps" || r.Method != http.MethodPost {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		_ = json.NewEncoder(w).Encode(remoteSweep{
			ID:              "psweep_1",
			OrganizationID:  "org-1",
			CreatedByUserID: "user-1",
			Country:         "fr",
			AreaLabel:       "Lille, France",
			Center:          prospectingcore.GeoPoint{Lat: 50.63, Lng: 3.06},
			Sectors:         []string{"boulangerie"},
			TotalUnits:      1,
			Status:          "completed",
			BusinessesFound: 1,
		})
	}))
	defer fakeServer.Close()

	svc := NewRemoteService(fakeServer.URL)
	sweep, err := svc.SweepArea(context.Background(), testPrincipal(), prospecting.SweepAreaParams{
		AreaQuery: "Lille",
		Sectors:   []string{"boulangerie"},
	})
	if err != nil {
		t.Fatalf("sweep area: %v", err)
	}
	if gotAuth != "Bearer session-token-123" {
		t.Fatalf("expected the caller's own session token as bearer auth, got %q", gotAuth)
	}
	if gotBody["organization_id"] != "org-1" {
		t.Fatalf("expected organization_id to be forwarded from the principal, got %+v", gotBody)
	}
	if sweep.ID != "psweep_1" || sweep.Status != "completed" || sweep.BusinessesFound != 1 {
		t.Fatalf("unexpected sweep conversion: %+v", sweep)
	}
	if sweep.Center.Lat != 50.63 || sweep.Center.Lng != 3.06 {
		t.Fatalf("expected the nested GeoPoint to round-trip, got %+v", sweep.Center)
	}
}

func TestRemoteServiceListBusinessesConvertsDTOAndTotal(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/prospecting/sweeps/psweep_1/businesses" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("min_score") != "50" {
			t.Fatalf("expected min_score to be forwarded, got %q", r.URL.Query().Get("min_score"))
		}
		_ = json.NewEncoder(w).Encode(listBusinessesResult{
			Businesses: []remoteBusiness{{
				Business: prospectingcore.Business{PlaceID: "place-1", Name: "Boulangerie Martin", ReachabilityScore: 80},
				ID:       "pbiz_1",
			}},
			Total: 1,
		})
	}))
	defer fakeServer.Close()

	svc := NewRemoteService(fakeServer.URL)
	businesses, total, err := svc.ListBusinesses(context.Background(), testPrincipal(), prospecting.ListBusinessesParams{
		SweepID:  "psweep_1",
		MinScore: 50,
	})
	if err != nil {
		t.Fatalf("list businesses: %v", err)
	}
	if total != 1 || len(businesses) != 1 {
		t.Fatalf("expected 1 business, got total=%d len=%d", total, len(businesses))
	}
	if businesses[0].Name != "Boulangerie Martin" || businesses[0].ReachabilityScore != 80 {
		t.Fatalf("unexpected business conversion: %+v", businesses[0])
	}
}
