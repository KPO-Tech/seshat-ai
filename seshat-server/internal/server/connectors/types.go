package connectors

import (
	"context"
	"time"

	coreconnectors "github.com/EngineerProjects/seshat-ai/seshat-core/connectors"
)

// connectorKind identifies a connector implementation - "s3", "gdrive", or
// "sharepoint". Each implementation lives in its own file within this
// package rather than its own subpackage: nothing outside connectors ever
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
	// configuration (e.g. coreconnectors.S3AccountConfig, JSON-encoded) -
	// the counterpart of syncSecret for settings that aren't credentials.
	Config string
}

// resourceRef, syncSecret, syncItem, accessEntry are aliases, not new
// types: the Discover/Sync logic that produces/consumes them now lives in
// core/connectors (see gdrive.go/sharepoint.go/s3.go's doc comments) -
// aliasing keeps every other file in this package working unchanged, with
// zero conversion code between this package's own shapes and core's.
type (
	resourceRef = coreconnectors.ResourceRef
	syncSecret  = coreconnectors.Secret
	syncItem    = coreconnectors.SyncItem
	accessEntry = coreconnectors.AccessEntry
)

// accessEntriesToStrings converts a SyncItem's ACL to the plain []string
// shape sdb.CorpusFile.ExternalAccess stores - accessEntry is a defined
// string type, not identical to string, so Go requires an explicit
// element-wise conversion rather than a bare slice cast.
func accessEntriesToStrings(entries []accessEntry) []string {
	if len(entries) == 0 {
		return nil
	}
	out := make([]string, len(entries))
	for i, e := range entries {
		out[i] = string(e)
	}
	return out
}

// knowledgeConnector discovers and syncs external resources into Knowledge.
// Every connector implementation in this package and connectorFor's
// registry satisfy this. account is accepted for interface uniformity but
// only s3Connector actually reads it (Config) - see core/connectors'
// package doc comment for why the shared core underneath doesn't need a
// generic Account shape at all.
type knowledgeConnector interface {
	Kind() connectorKind
	Discover(ctx context.Context, account syncAccount, secret syncSecret) ([]resourceRef, error)
	Sync(ctx context.Context, account syncAccount, secret syncSecret, cursor string) (items []syncItem, nextCursor string, err error)
}
