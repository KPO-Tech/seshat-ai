package connectors

import "testing"

// Azure Blob's actual Discover/Sync/config-parsing logic and its own unit +
// Azurite-integration tests now live in core/connectors - this package only
// tests its thin wrapper.
func TestAzureBlobConnectorKind(t *testing.T) {
	c := newAzureBlobConnector()
	if c.Kind() != azureBlobKind {
		t.Fatalf("expected kind %q, got %q", azureBlobKind, c.Kind())
	}
}
