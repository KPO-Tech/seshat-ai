package knowledgesharepoint

import (
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/connector"
)

func TestPermissionsToAccessControl(t *testing.T) {
	cases := []struct {
		name  string
		perms []graphPermission
		want  []connector.AccessEntry
	}{
		{
			name: "granted user with siteUser loginName maps to user entry",
			perms: []graphPermission{
				{GrantedToV2: &graphIdentitySet{SiteUser: &graphSiteUser{LoginName: "alice@example.com"}}},
			},
			want: []connector.AccessEntry{"user:alice@example.com"},
		},
		{
			name: "granted user with no loginName is skipped, not guessed",
			perms: []graphPermission{
				{GrantedToV2: &graphIdentitySet{User: &graphIdentity{ID: "guid-only", DisplayName: "Bob"}}},
			},
			want: nil,
		},
		{
			name: "unredeemed invitation email maps to user entry",
			perms: []graphPermission{
				{Invitation: &struct {
					Email string `json:"email"`
				}{Email: "invitee@example.com"}},
			},
			want: []connector.AccessEntry{"user:invitee@example.com"},
		},
		{
			name: "anonymous link maps to public",
			perms: []graphPermission{
				{Link: &struct {
					Scope string `json:"scope"`
				}{Scope: "anonymous"}},
			},
			want: []connector.AccessEntry{"public"},
		},
		{
			name: "organization link is deliberately NOT mapped to public",
			perms: []graphPermission{
				{Link: &struct {
					Scope string `json:"scope"`
				}{Scope: "organization"}},
			},
			want: nil,
		},
		{
			name: "grantedToIdentitiesV2 collection is also mapped",
			perms: []graphPermission{
				{GrantedToIdentitiesV2: []graphIdentitySet{
					{SiteUser: &graphSiteUser{LoginName: "carol@example.com"}},
				}},
			},
			want: []connector.AccessEntry{"user:carol@example.com"},
		},
		{
			name: "duplicate identities across permissions are deduplicated",
			perms: []graphPermission{
				{GrantedToV2: &graphIdentitySet{SiteUser: &graphSiteUser{LoginName: "dave@example.com"}}},
				{GrantedToV2: &graphIdentitySet{SiteUser: &graphSiteUser{LoginName: "dave@example.com"}}},
			},
			want: []connector.AccessEntry{"user:dave@example.com"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := permissionsToAccessControl(tc.perms)
			if len(got) != len(tc.want) {
				t.Fatalf("expected %v, got %v", tc.want, got)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("expected %v, got %v", tc.want, got)
				}
			}
		})
	}
}

func TestIsAllowedFile(t *testing.T) {
	allowed := graphDriveItem{Name: "report.pdf", File: &struct{}{}}
	if !isAllowedFile(allowed) {
		t.Fatal("expected a .pdf file to be allowed")
	}

	notInAllowlist := graphDriveItem{Name: "script.py", File: &struct{}{}}
	if isAllowedFile(notInAllowlist) {
		t.Fatal("expected a .py file to be excluded (code, not business documents)")
	}

	folder := graphDriveItem{Name: "Reports", Folder: &struct{}{}}
	if isAllowedFile(folder) {
		t.Fatal("expected a folder to never be allowed")
	}

	pkg := graphDriveItem{Name: "Notebook.one", Package: &struct{}{}}
	if isAllowedFile(pkg) {
		t.Fatal("expected a package item (e.g. OneNote) to never be allowed")
	}

	deleted := graphDriveItem{Name: "report.pdf", File: &struct{}{}, Deleted: &struct{}{}}
	if isAllowedFile(deleted) {
		t.Fatal("expected a delta-feed deletion to never be allowed")
	}
}

func TestDriveCursorRoundTrips(t *testing.T) {
	cursor := driveCursor{"drive-a": "link-a", "drive-b": "link-b"}
	encoded := cursor.encode()

	decoded := decodeCursor(encoded)
	if len(decoded) != 2 || decoded["drive-a"] != "link-a" || decoded["drive-b"] != "link-b" {
		t.Fatalf("expected cursor to round-trip, got %v from %q", decoded, encoded)
	}
}

func TestDecodeCursorHandlesEmptyAndInvalidInput(t *testing.T) {
	if got := decodeCursor(""); len(got) != 0 {
		t.Fatalf("expected an empty cursor for empty input, got %v", got)
	}
	if got := decodeCursor("not json"); len(got) != 0 {
		t.Fatalf("expected an empty cursor for invalid input, got %v", got)
	}
}
