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
