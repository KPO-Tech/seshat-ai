package prospecting

import (
	"context"
	"testing"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func grantOrgWide(t *testing.T, env testEnv, principal *iam.Principal, codes ...string) {
	t.Helper()
	if _, err := env.iam.CreatePolicyBinding(context.Background(), env.adminPrincipal, iam.CreatePolicyBindingParams{
		OrganizationID:  env.orgID,
		Name:            "test grant",
		SubjectType:     "user",
		SubjectID:       principal.User.ID,
		PermissionCodes: codes,
	}); err != nil {
		t.Fatalf("grant %v: %v", codes, err)
	}
}

func TestSweepAreaCreatesSweepAndAnyOrgMemberCanContinueIt(t *testing.T) {
	env := newTestEnv(t)
	rt := &stubRoundTripper{}
	env.configurePlaces(t, env.orgID, rt, 100)

	sweep, err := env.prospecting.SweepArea(context.Background(), env.adminPrincipal, SweepAreaParams{
		OrganizationID: env.orgID,
		AreaQuery:      "Lille",
		Sectors:        []string{"boulangerie"},
		RadiusKM:       0.5,
		MaxTiles:       10,
	})
	if err != nil {
		t.Fatalf("sweep area: %v", err)
	}
	if sweep.Status != SweepStatusCompleted {
		t.Fatalf("expected completed status, got %s", sweep.Status)
	}
	if sweep.BusinessesFound != 1 {
		t.Fatalf("expected 1 business found, got %d", sweep.BusinessesFound)
	}

	// A different member of the SAME organization, with prospecting.manage,
	// can continue the admin's sweep — this is the actual point of the
	// migration (team data, not per-user like the local equivalent).
	member := env.addMember(t, "member")
	grantOrgWide(t, env, member, "prospecting.manage")
	continued, err := env.prospecting.SweepArea(context.Background(), member, SweepAreaParams{SweepID: sweep.ID})
	if err != nil {
		t.Fatalf("continue sweep as teammate: %v", err)
	}
	if continued.ID != sweep.ID {
		t.Fatalf("expected the same sweep, got %s vs %s", continued.ID, sweep.ID)
	}
}

func TestSweepAreaRequiresProspectingManage(t *testing.T) {
	env := newTestEnv(t)
	rt := &stubRoundTripper{}
	env.configurePlaces(t, env.orgID, rt, 100)
	member := env.addMember(t, "member")

	if _, err := env.prospecting.SweepArea(context.Background(), member, SweepAreaParams{
		OrganizationID: env.orgID,
		AreaQuery:      "Lille",
		Sectors:        []string{"boulangerie"},
	}); err == nil {
		t.Fatal("expected a member without prospecting.manage to be denied starting a sweep")
	}
}

func TestListBusinessesRequiresProspectingReadAndIsOrgScoped(t *testing.T) {
	env := newTestEnv(t)
	rt := &stubRoundTripper{}
	env.configurePlaces(t, env.orgID, rt, 100)

	sweep, err := env.prospecting.SweepArea(context.Background(), env.adminPrincipal, SweepAreaParams{
		OrganizationID: env.orgID,
		AreaQuery:      "Lille",
		Sectors:        []string{"boulangerie"},
		RadiusKM:       0.5,
	})
	if err != nil {
		t.Fatalf("sweep area: %v", err)
	}

	memberNoGrant := env.addMember(t, "viewer")
	if _, _, err := env.prospecting.ListBusinesses(context.Background(), memberNoGrant, ListBusinessesParams{SweepID: sweep.ID}); err == nil {
		t.Fatal("expected a member without prospecting.read to be denied listing businesses")
	}

	memberWithRead := env.addMember(t, "member")
	grantOrgWide(t, env, memberWithRead, "prospecting.read")
	businesses, total, err := env.prospecting.ListBusinesses(context.Background(), memberWithRead, ListBusinessesParams{SweepID: sweep.ID})
	if err != nil {
		t.Fatalf("list businesses as a teammate with prospecting.read: %v", err)
	}
	if total != 1 || len(businesses) != 1 {
		t.Fatalf("expected 1 business, got total=%d len=%d", total, len(businesses))
	}
}

func TestSweepAreaReusesBusinessAcrossSweepsInTheSameOrganization(t *testing.T) {
	env := newTestEnv(t)
	rt := &stubRoundTripper{}
	env.configurePlaces(t, env.orgID, rt, 100)

	if _, err := env.prospecting.SweepArea(context.Background(), env.adminPrincipal, SweepAreaParams{
		OrganizationID: env.orgID,
		AreaQuery:      "Lille",
		Sectors:        []string{"boulangerie"},
		RadiusKM:       0.5,
	}); err != nil {
		t.Fatalf("first sweep: %v", err)
	}
	if rt.detailsCalls != 1 {
		t.Fatalf("expected exactly 1 Place Details call on first discovery, got %d", rt.detailsCalls)
	}

	// A second sweep, started by a different org member, that would
	// rediscover the same place must reuse the stored business instead of
	// re-fetching Place Details — the cross-sweep reuse window is org-wide,
	// not per-user (see findLatestByOrgAndPlaceID).
	member := env.addMember(t, "member")
	grantOrgWide(t, env, member, "prospecting.manage")
	if _, err := env.prospecting.SweepArea(context.Background(), member, SweepAreaParams{
		OrganizationID: env.orgID,
		AreaQuery:      "Lille",
		Sectors:        []string{"boulangerie"},
		RadiusKM:       0.5,
	}); err != nil {
		t.Fatalf("second sweep: %v", err)
	}
	if rt.detailsCalls != 1 {
		t.Fatalf("expected the second sweep to reuse the cached business (still 1 Place Details call), got %d", rt.detailsCalls)
	}
}

func TestProspectingUsageIsScopedPerOrganization(t *testing.T) {
	env := newTestEnv(t)

	orgB, err := env.iam.CreateOrganization(context.Background(), env.adminPrincipal, iam.CreateOrganizationParams{
		Name: "Org B", Slug: "org-b",
	})
	if err != nil {
		t.Fatalf("create second org: %v", err)
	}

	rt := &stubRoundTripper{}
	env.configurePlaces(t, env.orgID, rt, 100)
	if _, err := env.prospecting.SweepArea(context.Background(), env.adminPrincipal, SweepAreaParams{
		OrganizationID: env.orgID,
		AreaQuery:      "Lille",
		Sectors:        []string{"boulangerie"},
		RadiusKM:       0.5,
	}); err != nil {
		t.Fatalf("sweep in org A: %v", err)
	}

	periodKey := dayPeriodKey(time.Now())
	usageA := usageAdapter{db: env.db, organizationID: env.orgID}
	searchA, _, err := usageA.GetTotals(context.Background(), periodKey)
	if err != nil {
		t.Fatalf("get org A totals: %v", err)
	}
	if searchA == 0 {
		t.Fatal("expected org A to have accrued real Places usage")
	}

	usageB := usageAdapter{db: env.db, organizationID: orgB.ID}
	searchB, detailsB, err := usageB.GetTotals(context.Background(), periodKey)
	if err != nil {
		t.Fatalf("get org B totals: %v", err)
	}
	if searchB != 0 || detailsB != 0 {
		t.Fatalf("expected org B's usage to be untouched by org A's sweep, got search=%d details=%d", searchB, detailsB)
	}
}
