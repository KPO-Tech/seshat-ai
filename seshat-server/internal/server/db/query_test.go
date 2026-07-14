package db

import "testing"

func TestPageSearchAndSortAgainstRealSQLite(t *testing.T) {
	database, err := Open(Config{Driver: DriverSQLite, DSN: ":memory:"})
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
	users := []User{
		{ID: "usr_1", Email: "alice@example.com", DisplayName: "Alice", PasswordHash: "x"},
		{ID: "usr_2", Email: "bob@example.com", DisplayName: "Bob", PasswordHash: "x"},
		{ID: "usr_3", Email: "carol@example.com", DisplayName: "Carol", PasswordHash: "x"},
	}
	for _, u := range users {
		if err := database.Gorm().Create(&u).Error; err != nil {
			t.Fatalf("create user: %v", err)
		}
	}

	t.Run("search filters and total reflects matches before paging", func(t *testing.T) {
		query := ApplySearch(database.Gorm().Model(&User{}), "bob", "email", "display_name")
		field, err := ResolveSortField(map[string]SortField{"email": {Column: "email"}}, "email")
		if err != nil {
			t.Fatalf("resolve sort field: %v", err)
		}
		query = ApplySort(query, field, "asc")
		rows, total, err := Page[User](query, 50, 0)
		if err != nil {
			t.Fatalf("page: %v", err)
		}
		if total != 1 || len(rows) != 1 || rows[0].ID != "usr_2" {
			t.Fatalf("expected exactly bob, got total=%d rows=%+v", total, rows)
		}
	})

	t.Run("pagination returns total across all matches, not just the page", func(t *testing.T) {
		field, err := ResolveSortField(map[string]SortField{"email": {Column: "email"}}, "email")
		if err != nil {
			t.Fatalf("resolve sort field: %v", err)
		}
		query := ApplySort(database.Gorm().Model(&User{}), field, "asc")
		rows, total, err := Page[User](query, 2, 0)
		if err != nil {
			t.Fatalf("page: %v", err)
		}
		if total != 3 || len(rows) != 2 {
			t.Fatalf("expected total=3 page=2, got total=%d rows=%d", total, len(rows))
		}
		if rows[0].ID != "usr_1" || rows[1].ID != "usr_2" {
			t.Fatalf("expected alice then bob in ascending email order, got %+v", rows)
		}

		rows, total, err = Page[User](query, 2, 2)
		if err != nil {
			t.Fatalf("page offset: %v", err)
		}
		if total != 3 || len(rows) != 1 || rows[0].ID != "usr_3" {
			t.Fatalf("expected the last remaining row (carol) on the second page, got total=%d rows=%+v", total, rows)
		}
	})

	t.Run("resolve sort field rejects unknown keys", func(t *testing.T) {
		if _, err := ResolveSortField(map[string]SortField{"email": {Column: "email"}}, "password_hash"); err == nil {
			t.Fatal("expected an error for a field outside the allowlist")
		}
	})

	t.Run("unsafe column name panics instead of reaching SQL", func(t *testing.T) {
		defer func() {
			if recover() == nil {
				t.Fatal("expected a panic for an unsafe column name")
			}
		}()
		ApplySearch(database.Gorm().Model(&User{}), "x", "email; DROP TABLE users")
	})
}
