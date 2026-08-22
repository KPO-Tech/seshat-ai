package connectors

import "testing"

// confluence's actual Discover/Sync/Atlassian-client/token-rotation logic
// and its own unit tests now live in core/connectors - this package only
// tests its thin wrapper.
func TestConfluenceConnectorKind(t *testing.T) {
	c := newConfluenceConnector(nil)
	if c.Kind() != confluenceKind {
		t.Fatalf("expected kind %q, got %q", confluenceKind, c.Kind())
	}
}

func TestConfluenceConnectorRefreshedTokenReportsNoneByDefault(t *testing.T) {
	c := newConfluenceConnector(nil)
	if _, _, _, ok := c.RefreshedToken(); ok {
		t.Fatal("expected no refreshed token before any call")
	}
}
