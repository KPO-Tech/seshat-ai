// OneDrive for Business connector: implements knowledgeConnector by
// wrapping core/connectors.OneDriveConnector - the actual Discover/Sync/
// Graph-client logic lives there now (shared with seshat-backend's own
// knowledge/onedrive package), see its doc comment for why. This file only
// adapts core's plain (secret, cursor) signature to this package's
// knowledgeConnector interface (account is accepted but unused -
// onedrive's Discover/Sync never read it, same as sharepoint's) and builds
// the OAuth client config the org-scoped connect flow (oauth.go) resolves
// per organization.
package connectors

import (
	"context"

	"golang.org/x/oauth2"

	coreconnectors "github.com/KPO-Tech/seshat/pkg/connectors"
)

const onedriveKind connectorKind = "onedrive"

// onedriveScopes is this package's own name for the scopes onedrive's
// OAuth connect flow (oauth.go) requests - re-exported from core/connectors
// so there's exactly one list, not a locally duplicated one.
var onedriveScopes = coreconnectors.OneDriveScopes

type onedriveConnector struct {
	inner *coreconnectors.OneDriveConnector
}

func newOneDriveConnector(oauthConfig *oauth2.Config) *onedriveConnector {
	return &onedriveConnector{inner: coreconnectors.NewOneDriveConnector(oauthConfig)}
}

func (c *onedriveConnector) withTextExtractor(fn func(ctx context.Context, data []byte, contentType, filename string) string) *onedriveConnector {
	c.inner.WithTextExtractor(coreconnectors.TextExtractorFunc(fn))
	return c
}

func (c *onedriveConnector) Kind() connectorKind { return onedriveKind }

func (c *onedriveConnector) Discover(ctx context.Context, account syncAccount, secret syncSecret) ([]resourceRef, error) {
	return c.inner.Discover(ctx, secret)
}

func (c *onedriveConnector) Sync(ctx context.Context, account syncAccount, secret syncSecret, cursor string) ([]syncItem, string, error) {
	return c.inner.Sync(ctx, secret, cursor)
}

var _ knowledgeConnector = (*onedriveConnector)(nil)
