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
