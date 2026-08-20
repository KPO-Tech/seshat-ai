package connectors

import (
	"context"
	"time"
)

// connectorKind identifies a connector implementation - "s3" today, "gdrive"/
// "sharepoint" once their own files (gdrive.go, sharepoint.go) land next to
// s3.go. Each implementation lives in its own file within this package
// rather than its own subpackage: nothing outside connectors ever
// needs to construct or type-switch on a connector directly (verified -
// s3.go's predecessor package had exactly one importer, this one), so a
// separate package per connector bought isolation nothing else used, at the
// cost of an extra import + a generic interface package for a two-file
// contract. See docs/architecture.md's "Example: Knowledge connectors".
type connectorKind string

// syncAccount is the minimal shape any connected external source shares,
// passed into a connector's Discover/Sync - built from sdb.ConnectorAccount
// per call (see processSyncJob), never persisted itself.
type syncAccount struct {
	ID             string
	OrganizationID string
	CorpusID       string
	Status         string
	LastSyncedAt   time.Time
	LastError      string
	// Config is opaque, connector-interpreted, non-secret connection
	// configuration (e.g. s3AccountConfig, JSON-encoded) - the counterpart
	// of syncSecret for settings that aren't credentials.
	Config string
}

// accessEntry names one identity or group allowed to see a resource
// ("user:alice@example.com", "group:eng-team", "domain:example.com"). A nil
// or empty AccessControl on a syncItem means "inherit the connector
// account's own scope" - today's coarser org-scoped corpus permissions.
type accessEntry string

// syncSecret is the decrypted connection material a knowledgeConnector needs
// to call its external API - decrypted from sdb.ConnectorAccount's encrypted
// columns per call (see processSyncJob), never persisted itself.
type syncSecret struct {
	AccessToken  string
	RefreshToken string
	ExpiresAt    time.Time
}

// resourceRef is what Discover returns per resource found - enough to
// decide whether/how to sync it without fetching its content yet.
type resourceRef struct {
	ID       string
	Name     string
	Kind     string // "file", "folder", "record", ...
	Modified time.Time
}

// syncItem is what Sync yields per resource - content ready for Knowledge
// ingestion (handed to knowledge.Service.IngestFromConnector), plus the
// access control list it should carry.
type syncItem struct {
	resourceRef
	Text          string
	AccessControl []accessEntry
}

// knowledgeConnector discovers and syncs external resources into Knowledge.
// Every connector implementation in this package (s3Connector today) and
// connectorFor's registry satisfy this.
type knowledgeConnector interface {
	Kind() connectorKind
	Discover(ctx context.Context, account syncAccount, secret syncSecret) ([]resourceRef, error)
	Sync(ctx context.Context, account syncAccount, secret syncSecret, cursor string) (items []syncItem, nextCursor string, err error)
}
