// Confluence connector: implements knowledgeConnector by wrapping
// core/connectors.ConfluenceConnector - the actual Discover/Sync/Atlassian-
// client/token-rotation logic lives there now, see its doc comment for why.
// This file only adapts core's plain (secret, cursor) signature to this
// package's knowledgeConnector interface (account is accepted but unused,
// same as sharepoint/onedrive), builds the OAuth client config the org-
// scoped connect flow (oauth.go) resolves per organization, and exposes
// refreshedToken() for worker.go's token-persistence check.
//
// seshat-server-only: unlike gdrive/sharepoint/onedrive, Confluence has no
// seshat-backend/local-mode counterpart - Atlassian's OAuth 2.0 (3LO) apps
// require a confidential client (client_id + client_secret) with no PKCE-
// only public-client option, so there is nowhere safe to hold a shared
// secret in a distributed local binary. Same call already made for Slack.
package connectors

import (
	"context"
	"time"

	"golang.org/x/oauth2"

	coreconnectors "github.com/KPO-Tech/seshat/pkg/connectors"
)

const confluenceKind connectorKind = "confluence"

// confluenceScopes is this package's own name for the scopes confluence's
// OAuth connect flow (oauth.go) requests - re-exported from core/connectors
// so there's exactly one list, not a locally duplicated one.
var confluenceScopes = coreconnectors.ConfluenceScopes

type confluenceConnector struct {
	inner *coreconnectors.ConfluenceConnector
}

func newConfluenceConnector(oauthConfig *oauth2.Config) *confluenceConnector {
	return &confluenceConnector{inner: coreconnectors.NewConfluenceConnector(oauthConfig)}
}

func (c *confluenceConnector) withTextExtractor(fn func(ctx context.Context, data []byte, contentType, filename string) string) *confluenceConnector {
	c.inner.WithTextExtractor(coreconnectors.TextExtractorFunc(fn))
	return c
}

func (c *confluenceConnector) Kind() connectorKind { return confluenceKind }

func (c *confluenceConnector) Discover(ctx context.Context, account syncAccount, secret syncSecret) ([]resourceRef, error) {
	return c.inner.Discover(ctx, secret)
}

func (c *confluenceConnector) Sync(ctx context.Context, account syncAccount, secret syncSecret, cursor string) ([]syncItem, string, error) {
	return c.inner.Sync(ctx, secret, cursor)
}

// RefreshedToken satisfies worker.go's tokenRefreshReporter interface - see
// its doc comment for why Confluence (and only Confluence, today) needs
// this.
func (c *confluenceConnector) RefreshedToken() (accessToken, refreshToken string, expiry time.Time, ok bool) {
	return c.inner.RefreshedToken()
}

var _ knowledgeConnector = (*confluenceConnector)(nil)
