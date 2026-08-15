package knowledgegdrive

import (
	"testing"

	drive "google.golang.org/api/drive/v3"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/connector"
)

func TestPermissionsToAccessControl(t *testing.T) {
	permissions := []*drive.Permission{
		{Type: "user", EmailAddress: "alice@example.com"},
		{Type: "group", EmailAddress: "eng-team@example.com"},
		{Type: "domain", Domain: "example.com"},
		{Type: "anyone"},
		// Malformed/empty-value entries must be skipped, not produce a
		// bare "user:" or "group:" entry that would match nothing real
		// but silently "work" in a filter.
		{Type: "user", EmailAddress: ""},
		{Type: "group", EmailAddress: ""},
		{Type: "domain", Domain: ""},
		// Unknown permission types are ignored rather than guessed at.
		{Type: "owner", EmailAddress: "bob@example.com"},
	}

	got := permissionsToAccessControl(permissions)
	want := []connector.AccessEntry{
		"user:alice@example.com",
		"group:eng-team@example.com",
		"domain:example.com",
		"public",
	}
	if len(got) != len(want) {
		t.Fatalf("expected %d entries, got %d: %+v", len(want), len(got), got)
	}
	for i, w := range want {
		if got[i] != w {
			t.Errorf("entry %d: expected %q, got %q", i, w, got[i])
		}
	}
}

func TestPermissionsToAccessControl_Empty(t *testing.T) {
	if got := permissionsToAccessControl(nil); got != nil {
		t.Fatalf("expected nil for no permissions, got %+v", got)
	}
}

func TestIsAllowedFile(t *testing.T) {
	cases := []struct {
		name     string
		mimeType string
		want     bool
	}{
		{"report.pdf", "application/pdf", true},
		{"notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", true},
		{"deck.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", true},
		{"readme.txt", "text/plain", true},
		{"notes.md", "text/markdown", true},
		{"Untitled document", "application/vnd.google-apps.document", true}, // Google-native, no extension
		// Business-document allowlist, not a code denylist - source/notebook
		// files are never synced regardless of what mimeType Drive reports
		// for them (often just generic "text/plain").
		{"script.py", "text/plain", false},
		{"analysis.ipynb", "application/json", false},
		{"main.rs", "text/plain", false},
		{"lib.c", "text/x-c", false},
		{"config.yaml", "text/plain", false},
		{"data.json", "application/json", false},
		{"noextension", "application/octet-stream", false},
		// Spreadsheets excluded too - tabular/structured data, not a
		// document, regardless of format (see allowedExtensions's doc
		// comment).
		{"sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", false},
		{"legacy.xls", "application/vnd.ms-excel", false},
		{"export.csv", "text/csv", false},
		{"Untitled spreadsheet", "application/vnd.google-apps.spreadsheet", false},
	}
	for _, tc := range cases {
		got := isAllowedFile(&drive.File{Name: tc.name, MimeType: tc.mimeType})
		if got != tc.want {
			t.Errorf("isAllowedFile(%q, %q) = %v, want %v", tc.name, tc.mimeType, got, tc.want)
		}
	}
}

func TestConnector_KindAndCapabilities(t *testing.T) {
	c := NewConnector(nil)
	if c.Kind() != connector.Kind("gdrive") {
		t.Fatalf("expected kind %q, got %q", "gdrive", c.Kind())
	}
	caps := c.Capabilities()
	if len(caps) != 1 || caps[0] != connector.CapabilityKnowledge {
		t.Fatalf("expected exactly [CapabilityKnowledge], got %+v", caps)
	}
}
