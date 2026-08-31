// Azure Blob Storage connector: implements knowledgeConnector by wrapping
// core/connectors.AzureBlobConnector - the actual Discover/Sync logic lives
// there now (shared with seshat-backend's own knowledge/azureblob package),
// see its doc comment for why. This file only adapts core's plain (config,
// secret, cursor) signature to this package's knowledgeConnector interface,
// same shape as s3.go.
package connectors

import (
	"context"

	coreconnectors "github.com/EngineerProjects/seshat-ai/seshat-core/connectors"
)

const azureBlobKind connectorKind = "azureblob"

// azureBlobAccountConfig, parseAzureBlobAccountConfig,
// encodeAzureBlobAccountConfig are aliases, not new declarations - the
// config shape/parsing now lives in core/connectors, shared with
// seshat-backend.
type azureBlobAccountConfig = coreconnectors.AzureBlobAccountConfig

var (
	parseAzureBlobAccountConfig  = coreconnectors.ParseAzureBlobAccountConfig
	encodeAzureBlobAccountConfig = coreconnectors.EncodeAzureBlobAccountConfig
)

type azureBlobConnector struct {
	inner *coreconnectors.AzureBlobConnector
}

func newAzureBlobConnector() *azureBlobConnector {
	return &azureBlobConnector{inner: coreconnectors.NewAzureBlobConnector()}
}

func (c *azureBlobConnector) withTextExtractor(fn func(ctx context.Context, data []byte, contentType, filename string) string) *azureBlobConnector {
	c.inner.WithTextExtractor(coreconnectors.TextExtractorFunc(fn))
	return c
}

func (c *azureBlobConnector) Kind() connectorKind { return azureBlobKind }

func (c *azureBlobConnector) Discover(ctx context.Context, account syncAccount, secret syncSecret) ([]resourceRef, error) {
	return c.inner.Discover(ctx, account.Config, secret)
}

func (c *azureBlobConnector) Sync(ctx context.Context, account syncAccount, secret syncSecret, cursor string) ([]syncItem, string, error) {
	return c.inner.Sync(ctx, account.Config, secret, cursor)
}

var _ knowledgeConnector = (*azureBlobConnector)(nil)
