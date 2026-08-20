package connectors

import "testing"

// gdrive's actual Discover/Sync/permission-mapping/allowlist logic and its
// own unit tests now live in core/connectors - this package only tests its
// thin wrapper.
func TestGDriveConnectorKind(t *testing.T) {
	c := newGDriveConnector(nil)
	if c.Kind() != gdriveKind {
		t.Fatalf("expected kind %q, got %q", gdriveKind, c.Kind())
	}
}
