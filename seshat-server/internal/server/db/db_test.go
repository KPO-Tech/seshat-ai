package db

import (
	"path/filepath"
	"testing"
	"time"
)

func TestMigrateCreatesSchemaAndEnforcesUniqueSlug(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "state.db")
	database, err := Open(Config{Driver: DriverSQLite, DSN: dbPath})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer database.Close()

	if err := database.Migrate(); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	org := Organization{ID: "org_1", Name: "Seshat", Slug: "seshat"}
	if err := database.Gorm().Create(&org).Error; err != nil {
		t.Fatalf("create organization: %v", err)
	}

	duplicate := Organization{ID: "org_2", Name: "Seshat Two", Slug: "seshat"}
	if err := database.Gorm().Create(&duplicate).Error; err == nil {
		t.Fatal("expected duplicate slug to violate the unique index")
	}

	app := Application{
		ID:             "app_1",
		OrganizationID: org.ID,
		Name:           "Desktop",
		Slug:           "desktop",
		DisplayName:    "Desktop",
		Protocol:       "oidc",
		RedirectURLs:   []string{"https://example.com/callback"},
		Configuration:  map[string]string{"foo": "bar"},
	}
	if err := database.Gorm().Create(&app).Error; err != nil {
		t.Fatalf("create application: %v", err)
	}

	var loaded Application
	if err := database.Gorm().First(&loaded, "id = ?", "app_1").Error; err != nil {
		t.Fatalf("load application: %v", err)
	}
	if len(loaded.RedirectURLs) != 1 || loaded.RedirectURLs[0] != "https://example.com/callback" {
		t.Fatalf("expected redirect_urls to round-trip through the json serializer, got %+v", loaded.RedirectURLs)
	}
	if loaded.Configuration["foo"] != "bar" {
		t.Fatalf("expected configuration map to round-trip, got %+v", loaded.Configuration)
	}
}

// TestMembershipUserIDIsUniqueAcrossOrganizations is the DB-level defense-in-
// depth check for the one-org-per-user invariant (the application-level
// check lives in iam.userHasAnyMembership) — a second Membership row for the
// same UserID, even in a different OrganizationID, must be rejected outright
// by the schema, not just by application logic.
func TestMembershipUserIDIsUniqueAcrossOrganizations(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "state.db")
	database, err := Open(Config{Driver: DriverSQLite, DSN: dbPath})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer database.Close()

	if err := database.Migrate(); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	orgA := Organization{ID: "org_a", Name: "Org A", Slug: "org-a"}
	if err := database.Gorm().Create(&orgA).Error; err != nil {
		t.Fatalf("create organization A: %v", err)
	}
	orgB := Organization{ID: "org_b", Name: "Org B", Slug: "org-b"}
	if err := database.Gorm().Create(&orgB).Error; err != nil {
		t.Fatalf("create organization B: %v", err)
	}
	user := User{ID: "usr_1", Email: "user@example.com", DisplayName: "User", PasswordHash: "hash"}
	if err := database.Gorm().Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	first := Membership{ID: "mem_1", UserID: user.ID, OrganizationID: orgA.ID, Role: "owner"}
	if err := database.Gorm().Create(&first).Error; err != nil {
		t.Fatalf("create first membership: %v", err)
	}

	second := Membership{ID: "mem_2", UserID: user.ID, OrganizationID: orgB.ID, Role: "owner"}
	if err := database.Gorm().Create(&second).Error; err == nil {
		t.Fatal("expected a second membership for the same user in a different organization to violate the unique index")
	}
}

// TestScimSchemaMigratesAndEnforcesUniqueness is Étape 1's cold-migration
// check for the SCIM tables (see docs/helps/audit-2026-08-29-openwork-den-comparison.md
// § 3): a fresh database migrates cleanly, one ScimConnection per
// organization is enforced at the schema level (not just application code),
// and Membership.ScimExternalID is unique per organization while still
// allowing any number of non-SCIM memberships (NULL) to coexist.
func TestScimSchemaMigratesAndEnforcesUniqueness(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "state.db")
	database, err := Open(Config{Driver: DriverSQLite, DSN: dbPath})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer database.Close()

	if err := database.Migrate(); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	org := Organization{ID: "org_1", Name: "Seshat", Slug: "seshat"}
	if err := database.Gorm().Create(&org).Error; err != nil {
		t.Fatalf("create organization: %v", err)
	}

	connection := ScimConnection{ID: "scim_1", OrganizationID: org.ID, Name: "Okta", TokenHash: "hash-a"}
	if err := database.Gorm().Create(&connection).Error; err != nil {
		t.Fatalf("create scim connection: %v", err)
	}
	duplicateOrg := ScimConnection{ID: "scim_2", OrganizationID: org.ID, Name: "Entra ID", TokenHash: "hash-b"}
	if err := database.Gorm().Create(&duplicateOrg).Error; err == nil {
		t.Fatal("expected a second SCIM connection for the same organization to violate the unique index")
	}

	otherOrg := Organization{ID: "org_2", Name: "Other", Slug: "other"}
	if err := database.Gorm().Create(&otherOrg).Error; err != nil {
		t.Fatalf("create other organization: %v", err)
	}
	duplicateToken := ScimConnection{ID: "scim_3", OrganizationID: otherOrg.ID, Name: "Duplicate token", TokenHash: "hash-a"}
	if err := database.Gorm().Create(&duplicateToken).Error; err == nil {
		t.Fatal("expected a reused token hash across organizations to violate the unique index")
	}

	event := ScimSyncEvent{
		ID: "sse_1", ScimConnectionID: connection.ID, OrganizationID: org.ID,
		Operation: "user.create", ResourceType: "User", ExternalID: "ext-1", Success: true,
	}
	if err := database.Gorm().Create(&event).Error; err != nil {
		t.Fatalf("create scim sync event: %v", err)
	}

	userA := User{ID: "usr_a", Email: "a@example.com", DisplayName: "A", PasswordHash: "hash"}
	userB := User{ID: "usr_b", Email: "b@example.com", DisplayName: "B", PasswordHash: "hash"}
	if err := database.Gorm().Create(&userA).Error; err != nil {
		t.Fatalf("create user A: %v", err)
	}
	if err := database.Gorm().Create(&userB).Error; err != nil {
		t.Fatalf("create user B: %v", err)
	}

	externalID := "idp-external-1"
	memberA := Membership{ID: "mem_a", UserID: userA.ID, OrganizationID: org.ID, Role: "member", ScimExternalID: &externalID}
	if err := database.Gorm().Create(&memberA).Error; err != nil {
		t.Fatalf("create scim-provisioned membership: %v", err)
	}
	memberBSameExternal := Membership{ID: "mem_b", UserID: userB.ID, OrganizationID: org.ID, Role: "member", ScimExternalID: &externalID}
	if err := database.Gorm().Create(&memberBSameExternal).Error; err == nil {
		t.Fatal("expected reusing a SCIM external id within the same organization to violate the unique index")
	}

	// Two non-SCIM memberships (ScimExternalID nil) in the same org must not
	// collide with each other or with the SCIM-provisioned one above.
	memberBNoExternal := Membership{ID: "mem_b2", UserID: userB.ID, OrganizationID: org.ID, Role: "member"}
	if err := database.Gorm().Create(&memberBNoExternal).Error; err != nil {
		t.Fatalf("expected a non-SCIM membership to coexist with a SCIM one in the same org: %v", err)
	}
}

// TestSAMLAuthRequestStateSchemaMigratesAndEnforcesUniqueness is the SAML
// SSO plan's cold-migration check (mirrors the SCIM one above): a fresh
// database migrates SAMLAuthRequestState cleanly, and RequestID - the
// InResponseTo correlator - is unique, since two in-flight login attempts
// must never collide on the same AuthnRequest id.
func TestSAMLAuthRequestStateSchemaMigratesAndEnforcesUniqueness(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "state.db")
	database, err := Open(Config{Driver: DriverSQLite, DSN: dbPath})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer database.Close()

	if err := database.Migrate(); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	now := time.Now().UTC()
	first := SAMLAuthRequestState{
		ID: "sam_1", ProviderID: "prv_1", RequestID: "id-a",
		RedirectURI: "http://localhost:1234/callback", CreatedAt: now, ExpiresAt: now.Add(10 * time.Minute),
	}
	if err := database.Gorm().Create(&first).Error; err != nil {
		t.Fatalf("create saml auth request state: %v", err)
	}

	duplicate := SAMLAuthRequestState{
		ID: "sam_2", ProviderID: "prv_1", RequestID: "id-a",
		RedirectURI: "http://localhost:1234/callback", CreatedAt: now, ExpiresAt: now.Add(10 * time.Minute),
	}
	if err := database.Gorm().Create(&duplicate).Error; err == nil {
		t.Fatal("expected a reused RequestID to violate the unique index")
	}
}
