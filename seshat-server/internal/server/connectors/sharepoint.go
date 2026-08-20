// SharePoint connector: implements knowledgeConnector for SharePoint Online
// (read-only) by wrapping core/connectors.SharePointConnector - the actual
// Discover/Sync/Graph-client/permission-mapping logic lives there now
// (shared with seshat-backend's own knowledgesharepoint package), see its
// doc comment for why. This file only adapts core's plain (secret, cursor)
// signature to this package's knowledgeConnector interface (account is
// accepted but unused - sharepoint's Discover/Sync never read it, confirmed
// before extracting) and builds the OAuth client config the org-scoped
// connect flow (oauth.go) resolves per organization.
package connectors

import (
	"context"

	"golang.org/x/oauth2"

	coreconnectors "github.com/EngineerProjects/seshat-ai/seshat-core/connectors"
)

const sharepointKind connectorKind = "sharepoint"

// sharepointScopes is this package's own name for the scopes sharepoint's
// OAuth connect flow (oauth.go) requests - re-exported from core/connectors
// so there's exactly one list, not a locally duplicated one.
var sharepointScopes = coreconnectors.SharePointScopes

type sharepointConnector struct {
	inner *coreconnectors.SharePointConnector
}

func newSharePointConnector(oauthConfig *oauth2.Config) *sharepointConnector {
	return &sharepointConnector{inner: coreconnectors.NewSharePointConnector(oauthConfig)}
}

func (c *sharepointConnector) withTextExtractor(fn func(ctx context.Context, data []byte, contentType, filename string) string) *sharepointConnector {
	c.inner.WithTextExtractor(coreconnectors.TextExtractorFunc(fn))
	return c
}

func (c *sharepointConnector) Kind() connectorKind { return sharepointKind }

func (c *sharepointConnector) Discover(ctx context.Context, account syncAccount, secret syncSecret) ([]resourceRef, error) {
	return c.inner.Discover(ctx, secret)
}

func (c *sharepointConnector) Sync(ctx context.Context, account syncAccount, secret syncSecret, cursor string) ([]syncItem, string, error) {
	return c.inner.Sync(ctx, secret, cursor)
}

var _ knowledgeConnector = (*sharepointConnector)(nil)
