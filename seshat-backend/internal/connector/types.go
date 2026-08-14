// Package connector defines the shared contract every external-source
// integration implements, regardless of domain (messaging, Knowledge,
// Action). It generalizes what was previously a messaging-only Connector
// interface living in internal/inbox - see helps/roadmap.md Phase 1.
//
// The contract is deliberately two-layered, mirroring the "optional
// interface" pattern already used by inbox.AttachmentFetcher: Connector
// itself only declares identity and capabilities; the actual behavior for
// each capability lives in its own interface, which a caller type-asserts
// for only when it needs that capability. Messaging's own interface
// (inbox.Connector) lives in internal/inbox rather than here and simply
// embeds Connector - this package can't import inbox's types (ChannelAccount,
// ConnectorSecret) without an import cycle, since inbox imports this
// package. KnowledgeConnector/ActionConnector below have no such
// dependency, so they're defined here directly.
package connector

import (
	"context"
	"time"
)

// Kind identifies a connector implementation, e.g. "gmail", "whatsapp",
// "sharepoint", "gdrive".
type Kind string

// Capability declares one thing a connector can do. Capabilities() lets a
// caller (e.g. a future unified connector catalog in Settings) introspect
// what a connector supports without guessing via type assertions.
type Capability string

const (
	CapabilityMessaging Capability = "messaging"
	CapabilityKnowledge Capability = "knowledge"
	CapabilityAction    Capability = "action"
)

// Connector is the minimal contract every connector implements. Real
// behavior lives in the capability-specific interfaces below.
type Connector interface {
	Kind() Kind
	Capabilities() []Capability
}

// BlobFetcher generalizes inbox.AttachmentFetcher's lazy-fetch pattern
// beyond messaging attachments - e.g. a Knowledge connector fetching a
// discovered resource's bytes only at ingest time, not at Discover time.
type BlobFetcher interface {
	FetchBlob(ctx context.Context, ref string) (data []byte, err error)
}

// ─── Knowledge connectors (contract only - no implementation yet) ─────────
//
// Deliberately unimplemented in this phase: this is the shape a future
// read-only Knowledge connector (Google Drive, SharePoint - see
// helps/roadmap.md Phase 1's next item) will implement. Written now so
// that work can start directly against a settled contract instead of
// designing it from scratch when the time comes.

// Account is the minimal shape any external connection shares, regardless
// of domain - a messaging account, a SharePoint site, a Postgres
// connection all need: who owns it, is it healthy, when did it last sync.
// Messaging keeps its own concrete inbox.ChannelAccount rather than being
// retrofitted onto this - see MessagingConnector's doc comment.
type Account struct {
	ID           string
	UserID       string
	WorkspaceID  string
	Status       string
	LastSyncedAt time.Time
	LastError    string
}

// AccessEntry names one identity or group allowed to see a resource,
// mirroring Elastic Connectors' prefixed-identity ACL model
// ("user:alice@example.com", "group:eng-team", "domain:example.com" -
// see helps/elastic-connectors's connectors/access_control.py). A nil or
// empty AccessControl on a SyncItem means "inherit the connector account's
// own scope" - today's coarser scope_id (see internal/knowledge's
// permission filter, roadmap.md Phase 1's first item).
type AccessEntry string

// ResourceRef is what Discover returns per resource found - enough to
// decide whether/how to sync it without fetching its content yet.
type ResourceRef struct {
	ID       string
	Name     string
	Kind     string // "file", "folder", "record", ...
	Modified time.Time
}

// SyncItem is what Sync yields per resource - content ready for Knowledge
// ingestion, plus the access control list it should carry.
type SyncItem struct {
	ResourceRef
	Text          string
	AccessControl []AccessEntry
}

// KnowledgeConnector discovers and syncs external resources into Knowledge.
// No implementation exists yet - see helps/roadmap.md Phase 1.
type KnowledgeConnector interface {
	Connector
	Discover(ctx context.Context, account Account) ([]ResourceRef, error)
	Sync(ctx context.Context, account Account, cursor string) (items []SyncItem, nextCursor string, err error)
}

// ─── Action connectors (contract only - no implementation yet) ────────────

// ActionResult is the outcome of an ActionConnector.Act call.
type ActionResult struct {
	Success bool
	Message string
	Data    map[string]any
}

// ActionConnector performs a side-effecting operation against an external
// system (e.g. creating a CRM entry). No implementation exists yet.
type ActionConnector interface {
	Connector
	Act(ctx context.Context, account Account, action string, payload map[string]any) (ActionResult, error)
}
