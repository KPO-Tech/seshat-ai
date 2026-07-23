package db

import (
	"path/filepath"
	"testing"
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
