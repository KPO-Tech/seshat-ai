package connectors

import "testing"

// onedrive's actual Discover/Sync/Graph-client logic and its own unit
// tests now live in core/connectors - this package only tests its thin
// wrapper.
func TestOneDriveConnectorKind(t *testing.T) {
	c := newOneDriveConnector(nil)
	if c.Kind() != onedriveKind {
		t.Fatalf("expected kind %q, got %q", onedriveKind, c.Kind())
	}
}
