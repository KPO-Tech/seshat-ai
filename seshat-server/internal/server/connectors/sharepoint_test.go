package connectors

import "testing"

// sharepoint's actual Discover/Sync/Graph-client/permission-mapping logic
// and its own unit tests now live in core/connectors - this package only
// tests its thin wrapper.
func TestSharePointConnectorKind(t *testing.T) {
	c := newSharePointConnector(nil)
	if c.Kind() != sharepointKind {
		t.Fatalf("expected kind %q, got %q", sharepointKind, c.Kind())
	}
}
