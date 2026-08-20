// Google Drive connector: implements knowledgeConnector for Google Drive
// (read-only) by wrapping core/connectors.GDriveConnector - the actual
// Discover/Sync/permission-mapping logic lives there now (shared with
// seshat-backend's own knowledgegdrive package), see its doc comment for
// why. This file only adapts core's plain (secret, cursor) signature to
// this package's knowledgeConnector interface (account is accepted but
// unused - gdrive's Discover/Sync never read it, confirmed before
// extracting) and builds the OAuth client config the org-scoped connect
// flow (oauth.go) resolves per organization.
package connectors

import (
	"context"

	"golang.org/x/oauth2"

	coreconnectors "github.com/EngineerProjects/seshat-ai/core/connectors"
)

const gdriveKind connectorKind = "gdrive"

// gdriveScopes is this package's own name for the scopes gdrive's OAuth
// connect flow (oauth.go) requests - re-exported from core/connectors so
// there's exactly one list, not a locally duplicated one.
var gdriveScopes = coreconnectors.GDriveScopes

type gdriveConnector struct {
	inner *coreconnectors.GDriveConnector
}

func newGDriveConnector(oauthConfig *oauth2.Config) *gdriveConnector {
	return &gdriveConnector{inner: coreconnectors.NewGDriveConnector(oauthConfig)}
}

func (c *gdriveConnector) withTextExtractor(fn func(ctx context.Context, data []byte, contentType, filename string) string) *gdriveConnector {
	c.inner.WithTextExtractor(coreconnectors.TextExtractorFunc(fn))
	return c
}

func (c *gdriveConnector) Kind() connectorKind { return gdriveKind }

func (c *gdriveConnector) Discover(ctx context.Context, account syncAccount, secret syncSecret) ([]resourceRef, error) {
	return c.inner.Discover(ctx, secret)
}

func (c *gdriveConnector) Sync(ctx context.Context, account syncAccount, secret syncSecret, cursor string) ([]syncItem, string, error) {
	return c.inner.Sync(ctx, secret, cursor)
}

var _ knowledgeConnector = (*gdriveConnector)(nil)
