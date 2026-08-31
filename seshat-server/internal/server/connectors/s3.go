// S3 connector: implements knowledgeConnector for any S3-compatible object
// store by wrapping core/connectors.S3Connector - the actual Discover/Sync
// logic lives there now (shared with seshat-backend's own knowledge/s3
// package), see its doc comment for why. This file only adapts core's
// plain (config, secret, cursor) signature to this package's
// knowledgeConnector interface, passing account.Config through as the
// explicit config parameter core needs - s3 is the one connector whose
// Discover/Sync actually reads anything off syncAccount.
package connectors

import (
	"context"

	coreconnectors "github.com/EngineerProjects/seshat-ai/seshat-core/connectors"
)

const s3Kind connectorKind = "s3"

// s3AccountConfig, parseS3AccountConfig, encodeS3AccountConfig are aliases,
// not new declarations - the config shape/parsing now lives in
// core/connectors, shared with seshat-backend.
type s3AccountConfig = coreconnectors.S3AccountConfig

var (
	parseS3AccountConfig  = coreconnectors.ParseS3AccountConfig
	encodeS3AccountConfig = coreconnectors.EncodeS3AccountConfig
)

type s3Connector struct {
	inner *coreconnectors.S3Connector
}

func newS3Connector() *s3Connector {
	return &s3Connector{inner: coreconnectors.NewS3Connector()}
}

func (c *s3Connector) withTextExtractor(fn func(ctx context.Context, data []byte, contentType, filename string) string) *s3Connector {
	c.inner.WithTextExtractor(coreconnectors.TextExtractorFunc(fn))
	return c
}

func (c *s3Connector) Kind() connectorKind { return s3Kind }

func (c *s3Connector) Discover(ctx context.Context, account syncAccount, secret syncSecret) ([]resourceRef, error) {
	return c.inner.Discover(ctx, account.Config, secret)
}

func (c *s3Connector) Sync(ctx context.Context, account syncAccount, secret syncSecret, cursor string) ([]syncItem, string, error) {
	return c.inner.Sync(ctx, account.Config, secret, cursor)
}

var _ knowledgeConnector = (*s3Connector)(nil)
