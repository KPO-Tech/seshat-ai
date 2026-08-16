package prospecting

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

const (
	testEncryptionEnvVar = "SESHAT_SERVER_ENCRYPTION_KEY"
	testEncryptionKey    = "g/t9EsDxTTJSTu6Q+Kne06PBHoGmhH3yAJaEuHmFl9A="
)

type testEnv struct {
	db             *sdb.DB
	prospecting    *Service
	iam            *iam.Service
	adminPrincipal *iam.Principal
	orgID          string
}

// newTestEnv bootstraps a fresh in-memory database, an iam.Service and a
// prospecting.Service — mirroring knowledge's own newTestEnv shape.
func newTestEnv(t *testing.T) testEnv {
	t.Helper()
	database, err := sdb.Open(sdb.Config{Driver: sdb.DriverSQLite, DSN: ":memory:"})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	iamService := iam.New(database, time.Hour)
	prospectingService := New(database, iamService)

	boot, err := iamService.Bootstrap(context.Background(), iam.BootstrapParams{
		Email:            "admin@example.com",
		Password:         "password123",
		DisplayName:      "Admin",
		OrganizationName: "Seshat",
		OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	principal, err := iamService.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve admin principal: %v", err)
	}

	return testEnv{
		db:             database,
		prospecting:    prospectingService,
		iam:            iamService,
		adminPrincipal: principal,
		orgID:          boot.Organizations[0].ID,
	}
}

// addMember attaches a second user to the same org under the given role and
// returns their resolved principal, for permission-boundary tests.
func (env testEnv) addMember(t *testing.T, role string) *iam.Principal {
	t.Helper()
	email := role + "@example.com"
	user, err := env.iam.CreateUser(context.Background(), env.adminPrincipal, iam.CreateUserParams{
		Email:          email,
		Password:       "password123",
		DisplayName:    role,
		OrganizationID: env.orgID,
		Role:           role,
	})
	if err != nil {
		t.Fatalf("create %s user: %v", role, err)
	}
	login, err := env.iam.Login(context.Background(), user.Email, "password123")
	if err != nil {
		t.Fatalf("login %s: %v", role, err)
	}
	principal, err := env.iam.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve %s principal: %v", role, err)
	}
	return principal
}

// stubRoundTripper intercepts requests by host and serves them from an
// in-memory handler — same fixture shape as seshat-backend's local
// prospecting tests (internal/prospecting/service_test.go), so tests never
// touch the real network.
type stubRoundTripper struct {
	geocodeCalls int
	searchCalls  int
	detailsCalls int
	gouvCalls    int
}

func (rt *stubRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	var body string
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
	rec.WriteHeader(http.StatusOK)
	_, _ = rec.WriteString(body)
	resp := rec.Result()
	resp.Request = req
	return resp, nil
}

// configurePlaces stores an org's Places settings and wires the service to
// route every prospectingcore.Client it builds through rt instead of the
// real network.
func (env testEnv) configurePlaces(t *testing.T, orgID string, rt *stubRoundTripper, dailyCap int) {
	t.Helper()
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	if _, err := env.prospecting.SetSettings(context.Background(), env.adminPrincipal, orgID, SetSettingsParams{
		APIKey:   "test-places-key",
		DailyCap: dailyCap,
	}); err != nil {
		t.Fatalf("configure places settings: %v", err)
	}
	env.prospecting.testRoundTripper = rt
}
