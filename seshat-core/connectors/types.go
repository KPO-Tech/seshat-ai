// Package connectors is the tenant-agnostic core of SeshatOS's Knowledge
// connectors: the Google Drive, SharePoint, and S3-compatible Discover/Sync
// logic, extracted out of both seshat-backend (internal/knowledge/gdrive,
// internal/knowledge/sharepoint, internal/knowledge/s3) and seshat-server
// (internal/server/connectors) after both had independently ported the same
// ~1,700 lines of API-client/permission-mapping/extension-allowlist code -
// see ROADMAP.md's "core/connectors" entry for the extraction and why it
// mirrors core/prospecting's shape (a small sibling Go module shared via
// go.work, not imported by either backend directly into the other).
//
// Deliberately does not export an Account type or a shared connector
// interface: neither is needed. Grepping both original sides confirmed
// Discover/Sync never used anything from the caller's account struct except
// S3's own Config string (bucket/region/endpoint/prefix) - so each
// connector's methods take exactly what they use (Secret, plus an explicit
// config string for S3 only), not a generic Account shape. Each side keeps
// its own connector-selection interface (connector.KnowledgeConnector in
// seshat-backend, knowledgeConnector in seshat-server) and its own thin
// wrapper adapting that interface to these concrete types - the two
// interfaces' shapes already differed slightly before this extraction, and
// unifying them isn't this package's job.
//
// OAuth flow orchestration (state/PKCE/token exchange/app credentials) also
// stays on each side, since it's genuinely different per side (seshat-backend:
// one shared global client; seshat-server: a per-organization app registry) -
// only the scope lists a connector actually needs (GDriveScopes/
// SharePointScopes) are shared here, since both sides were duplicating the
// same string literals.
package connectors

import (
	"context"
	"time"
)

// TextExtractorFunc converts a downloaded binary file's raw bytes into
// ingestable text (e.g. PDF/DOCX/PPTX via Docling) - nil means "no
// extractor wired", and each connector falls back to treating raw bytes as
// text, which is wrong for binary formats. Wired via each connector type's
// WithTextExtractor, normally to the caller's own docling-backed extraction
// so connector-synced content goes through the same path as a manual upload.
type TextExtractorFunc func(ctx context.Context, data []byte, contentType, filename string) string

// Secret is the decrypted connection material a connector needs to call its
// external API. For gdrive/sharepoint these are OAuth access/refresh
// tokens; for S3, AccessToken/RefreshToken are reinterpreted as the access
// key ID and secret access key (a deliberate reuse of the generic field
// names, not a naming mistake - see S3Connector's doc comment).
type Secret struct {
	AccessToken  string
	RefreshToken string
	ExpiresAt    time.Time
}

// AccessEntry names one identity or group allowed to see a resource
// ("user:alice@example.com", "group:eng-team", "domain:example.com", or
// "public"), mirroring Elastic Connectors' prefixed-identity ACL model. A
// nil or empty AccessControl on a SyncItem means "inherit the caller's own
// coarser scope" - neither connector over-shares when it can't resolve a
// permission to a concrete identity.
type AccessEntry string

// ResourceRef is what Discover returns per resource found - enough to
// decide whether/how to sync it without fetching its content yet.
type ResourceRef struct {
	ID       string
	Name     string
	Kind     string // "file", "folder", "record", ...
	Modified time.Time
}

// SyncItem is what Sync yields per resource - content ready for ingestion,
// plus the access control list it should carry.
type SyncItem struct {
	ResourceRef
	Data          []byte
	ContentType   string
	Text          string
	AccessControl []AccessEntry
}
