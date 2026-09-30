package connectors

import "testing"

// s3's actual Discover/Sync/config-parsing logic and its own unit +
// MinIO-integration tests now live in core/connectors - this package only
// tests its thin wrapper.
func TestS3ConnectorKind(t *testing.T) {
	c := newS3Connector()
	if c.Kind() != s3Kind {
		t.Fatalf("expected kind %q, got %q", s3Kind, c.Kind())
	}
}
