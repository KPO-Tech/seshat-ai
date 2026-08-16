// Package knowledgesharepoint implements connector.KnowledgeConnector for
// SharePoint Online (read-only) via Microsoft Graph — structurally mirrors
// internal/knowledgegdrive (see that package's doc comment for the shared
// design: thin translation layer, persistence lives in knowledge.Service,
// business-document allowlist, per-item ACL mapped to prefixed identity
// strings). Deferred from Phase 1 alongside Drive, built once Drive's
// pattern had proven out end to end — see helps/roadmap.md.
//
// Two structural differences from Drive, both because SharePoint/Graph
// works differently, not because this connector cuts corners:
//   - No native-format export step: Office files (.docx/.pptx/.xlsx) are
//     real binaries and download directly — there's no SharePoint
//     equivalent of a Google Doc with no native binary form.
//   - Delta (change tracking) is per-drive, not account-wide — a
//     SharePoint account can see many drives (one per site's document
//     library), each with its own delta link, so the sync cursor is a
//     small JSON map (driveID -> deltaLink) instead of Drive's single
//     startPageToken. See driveCursor.
package knowledgesharepoint

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/oauth2"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/connector"
)

const Kind connector.Kind = "sharepoint"

// allowedExtensions is a business-document allowlist, not a code denylist -
// mirrors internal/knowledgegdrive's allowedExtensions exactly, same
// rationale (no source/notebook files, no spreadsheets - see that
// package's doc comment for the full reasoning, verified live with a real
// Drive account this session). Kept as one literal copy rather than a
// shared constant across the two connector packages: each is free to
// diverge later if one source's document mix turns out to need a
// different policy, and duplicating a 7-line map costs less than an
// import-cycle-avoiding shared package would.
var allowedExtensions = map[string]bool{
	".pdf":  true,
	".doc":  true,
	".docx": true,
	".ppt":  true,
	".pptx": true,
	".txt":  true,
	".md":   true,
}

// maxFileBytes bounds a single file's downloaded content - same cap and
// same rationale as Drive's (a pragmatic guard against one huge file
// stalling or blowing up memory during a sync).
const maxFileBytes = 20 * 1024 * 1024 // 20MB

// isAllowedFile reports whether item should be discovered/synced at all.
// Folders, "package" items (OneNote notebooks and similar - no directly
// downloadable content, see the package doc comment's Graph API research),
// and delta-feed deletions are never allowed regardless of name.
func isAllowedFile(item graphDriveItem) bool {
	if item.Deleted != nil || item.Folder != nil || item.Package != nil || item.File == nil {
		return false
	}
	return allowedExtensions[strings.ToLower(filepath.Ext(item.Name))]
}

type Connector struct {
	oauthConfig *oauth2.Config
	// extractText converts a downloaded binary file's raw bytes into
	// ingestable text (PDF/DOCX/PPTX via Docling, plain-text formats read
	// directly) - nil means "no extractor wired", see extractedText.  Set
	// via WithTextExtractor, normally to knowledge.Service.ExtractText
	// (see internal/app.go), same wiring as knowledgegdrive.
	extractText func(ctx context.Context, data []byte, contentType, filename string) string
}

func NewConnector(oauthConfig *oauth2.Config) *Connector {
	return &Connector{oauthConfig: oauthConfig}
}

// WithTextExtractor wires binary-file extraction into extractedText - see
// its doc comment. Returns the receiver so callers can chain it onto
// NewConnector, mirroring knowledgegdrive.Connector.WithTextExtractor.
func (c *Connector) WithTextExtractor(fn func(ctx context.Context, data []byte, contentType, filename string) string) *Connector {
	c.extractText = fn
	return c
}

func (c *Connector) Kind() connector.Kind { return Kind }

func (c *Connector) Capabilities() []connector.Capability {
	return []connector.Capability{connector.CapabilityKnowledge}
}

func (c *Connector) client(ctx context.Context, secret connector.Secret) (*graphClient, error) {
	if c.oauthConfig == nil {
		return nil, fmt.Errorf("microsoft graph oauth is not configured")
	}
	token := &oauth2.Token{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		Expiry:       secret.ExpiresAt,
	}
	return &graphClient{http: c.oauthConfig.Client(ctx, token)}, nil
}

// driveCursor is the opaque payload stored as ConnectorAccount.SyncCursor -
// see the package doc comment for why it's a per-drive map rather than one
// account-wide token. Callers of Sync never need to know its shape; it's
// only ever produced and consumed by this package.
type driveCursor map[string]string

func decodeCursor(raw string) driveCursor {
	cursor := driveCursor{}
	if raw == "" {
		return cursor
	}
	_ = json.Unmarshal([]byte(raw), &cursor)
	return cursor
}

func (c driveCursor) encode() string {
	data, err := json.Marshal(c)
	if err != nil {
		return "{}"
	}
	return string(data)
}

// Discover lists files across every site/drive the connected account can
// access, without downloading content - a lightweight preview, mirroring
// knowledgegdrive.Discover. Always does a fresh full enumeration per drive
// (deltaPage with no stored link), never touching the account's own sync
// cursor.
func (c *Connector) Discover(ctx context.Context, account connector.Account, secret connector.Secret) ([]connector.ResourceRef, error) {
	graph, err := c.client(ctx, secret)
	if err != nil {
		return nil, err
	}
	drives, err := c.allDrives(ctx, graph)
	if err != nil {
		return nil, err
	}
	var refs []connector.ResourceRef
	for _, driveID := range drives {
		items, _, err := graph.deltaPage(ctx, driveID, "")
		if err != nil {
			continue // one unreachable drive shouldn't fail the whole discovery
		}
		for _, item := range items {
			if !isAllowedFile(item) {
				continue
			}
			refs = append(refs, driveItemToResourceRef(driveID, item))
		}
	}
	return refs, nil
}

// Sync bootstraps (cursor == "") or continues (cursor holds a per-drive
// delta-link map, see driveCursor) - every drive the account can currently
// see is visited every call. A drive with no stored delta link yet (new
// since the last sync, or this is the very first sync) gets a full
// enumeration just for that one drive, exactly like Discover; a drive that
// already has one only pulls what changed.
func (c *Connector) Sync(ctx context.Context, account connector.Account, secret connector.Secret, cursor string) ([]connector.SyncItem, string, error) {
	graph, err := c.client(ctx, secret)
	if err != nil {
		return nil, "", err
	}
	drives, err := c.allDrives(ctx, graph)
	if err != nil {
		return nil, "", err
	}

	stored := decodeCursor(cursor)
	next := driveCursor{}
	var items []connector.SyncItem
	for _, driveID := range drives {
		pageItems, deltaLink, err := graph.deltaPage(ctx, driveID, stored[driveID])
		if err != nil {
			// One errored/unreachable drive shouldn't abort the whole
			// sync - keep whatever cursor it already had (retried next
			// time) and move on to the rest.
			if existing := stored[driveID]; existing != "" {
				next[driveID] = existing
			}
			continue
		}
		next[driveID] = deltaLink
		for _, item := range pageItems {
			if !isAllowedFile(item) {
				continue
			}
			if syncItem, ok := c.syncOneItem(ctx, graph, driveID, item); ok {
				items = append(items, syncItem)
			}
		}
	}
	return items, next.encode(), nil
}

func (c *Connector) allDrives(ctx context.Context, graph *graphClient) ([]string, error) {
	sites, err := graph.listSites(ctx)
	if err != nil {
		return nil, err
	}
	var driveIDs []string
	for _, site := range sites {
		drives, err := graph.listDrives(ctx, site.ID)
		if err != nil {
			continue // one inaccessible site shouldn't fail the whole crawl
		}
		for _, d := range drives {
			driveIDs = append(driveIDs, d.ID)
		}
	}
	return driveIDs, nil
}

// syncOneItem downloads one file's content and permissions. ok=false is a
// normal skip, not an error - a file over maxFileBytes, content that fails
// to download, or extracted text that comes back empty all fall through to
// "not synced this round" rather than failing the whole batch, mirroring
// knowledgegdrive.syncOneFile.
func (c *Connector) syncOneItem(ctx context.Context, graph *graphClient, driveID string, item graphDriveItem) (connector.SyncItem, bool) {
	if item.Size > maxFileBytes {
		return connector.SyncItem{}, false
	}
	data, err := graph.downloadContent(ctx, driveID, item.ID, maxFileBytes)
	if err != nil || len(data) == 0 {
		return connector.SyncItem{}, false
	}
	text := c.extractedText(ctx, data, item.Name)
	if strings.TrimSpace(text) == "" {
		return connector.SyncItem{}, false
	}
	return connector.SyncItem{
		ResourceRef:   driveItemToResourceRef(driveID, item),
		Text:          text,
		AccessControl: c.fetchAccessControl(ctx, graph, driveID, item.ID),
	}, true
}

// extractedText mirrors knowledgegdrive.downloadText's non-native branch:
// every SharePoint file needs the same Docling-backed extraction an
// uploaded file gets (PDF/DOCX/PPTX), or its raw bytes get ingested as
// unsearchable noise. Plain-text/markdown pass through unchanged when no
// extractor is wired (nil c.extractText).
func (c *Connector) extractedText(ctx context.Context, data []byte, filename string) string {
	if c.extractText == nil {
		return string(data)
	}
	return c.extractText(ctx, data, "", filename)
}

// fetchAccessControl maps a DriveItem's permissions to prefixed identity
// strings - see permissionsToAccessControl for the actual mapping rules.
// Errors are swallowed (nil result): IngestExternal already falls back to
// the corpus's own scope when AccessControl is empty, so a
// permissions-fetch failure degrades to "only the connecting account can
// see this," never to over-sharing - same discipline as
// knowledgegdrive.fetchAccessControl.
func (c *Connector) fetchAccessControl(ctx context.Context, graph *graphClient, driveID, itemID string) []connector.AccessEntry {
	permissions, err := graph.listPermissions(ctx, driveID, itemID)
	if err != nil {
		return nil
	}
	return permissionsToAccessControl(permissions)
}

// permissionsToAccessControl is the pure mapping fetchAccessControl applies
// to whatever Graph returns - split out so it's unit-testable without a
// live *graphClient/HTTP mock, mirroring
// knowledgegdrive.permissionsToAccessControl.
//
// Deliberately conservative where Graph's identity data is ambiguous or
// incomplete (see the package's design notes in helps' plan history):
//   - A granted user identity only becomes a "user:" entry when
//     siteUser.loginName is present (≈ the UPN/email on a work/school
//     tenant) - the bare user.id GUID+displayName pair Graph always
//     returns isn't enough to build a principal string that means anything
//     to the rest of this product's ACL model, and guessing would risk
//     under- or over-matching a real person.
//   - An unredeemed email invitation becomes a "user:" entry directly
//     (invitation.email is reliably present, unlike grantedToV2.user).
//   - An "anonymous" sharing link becomes "public" (Drive's exact "anyone"
//     equivalent).
//   - An "organization" sharing link (anyone in the tenant) is NOT mapped
//     to "public" - that would broaden the item's visibility beyond what
//     it actually has (tenant-wide is not the same as public), so it's
//     simply skipped, same as any other unexploitable permission entry.
func permissionsToAccessControl(permissions []graphPermission) []connector.AccessEntry {
	var acl []connector.AccessEntry
	seen := map[connector.AccessEntry]bool{}
	add := func(entry connector.AccessEntry) {
		if entry == "" || seen[entry] {
			return
		}
		seen[entry] = true
		acl = append(acl, entry)
	}

	for _, p := range permissions {
		if p.GrantedToV2 != nil {
			addIdentitySetEntry(add, *p.GrantedToV2)
		}
		for _, ident := range p.GrantedToIdentitiesV2 {
			addIdentitySetEntry(add, ident)
		}
		if p.Invitation != nil && p.Invitation.Email != "" {
			add(connector.AccessEntry("user:" + p.Invitation.Email))
		}
		if p.Link != nil && p.Link.Scope == "anonymous" {
			add(connector.AccessEntry("public"))
		}
	}
	return acl
}

func addIdentitySetEntry(add func(connector.AccessEntry), identity graphIdentitySet) {
	if identity.SiteUser != nil && identity.SiteUser.LoginName != "" {
		add(connector.AccessEntry("user:" + identity.SiteUser.LoginName))
	}
	// No usable UPN/email otherwise (identity.User only ever carries an
	// opaque GUID + display name on this response) - skip rather than
	// guess, same restrictive-by-default handling as an unexploitable
	// permission entry.
}

// driveItemToResourceRef composites driveID into ResourceRef.ID (a plain
// Graph item ID is only unique within its own drive, not account-wide, and
// this connector spans many drives) - ExternalID construction in the API
// layer relies on this being globally unique per account.
func driveItemToResourceRef(driveID string, item graphDriveItem) connector.ResourceRef {
	modified, _ := time.Parse(time.RFC3339, item.LastModifiedDateTime)
	return connector.ResourceRef{
		ID:       driveID + ":" + item.ID,
		Name:     item.Name,
		Kind:     "file",
		Modified: modified,
	}
}

var _ connector.KnowledgeConnector = (*Connector)(nil)
