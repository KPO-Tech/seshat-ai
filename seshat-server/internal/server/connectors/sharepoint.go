// SharePoint connector: implements knowledgeConnector for SharePoint Online
// (read-only) via Microsoft Graph. Ported from seshat-backend's
// internal/knowledgesharepoint (see docs/architecture.md's "Example:
// Knowledge connectors") - structurally mirrors gdrive.go, with two
// differences both because SharePoint/Graph works differently, not because
// this connector cuts corners:
//   - No native-format export step: Office files (.docx/.pptx/.xlsx) are
//     real binaries and download directly — there's no SharePoint
//     equivalent of a Google Doc with no native binary form.
//   - Delta (change tracking) is per-drive, not account-wide — a SharePoint
//     account can see many drives (one per site's document library), each
//     with its own delta link, so the sync cursor is a small JSON map
//     (driveID -> deltaLink) instead of Drive's single startPageToken. See
//     spDriveCursor.
package connectors

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/oauth2"
)

const sharepointKind connectorKind = "sharepoint"

// sharepointScopes requested from Microsoft - read-only Sites/Files access
// plus openid/profile/offline_access (the last is required to receive a
// refresh token, Microsoft's equivalent of Google's access_type=offline).
// Read-only by design: this is a Knowledge connector, never writes back to
// SharePoint.
var sharepointScopes = []string{
	"openid",
	"profile",
	"offline_access",
	"https://graph.microsoft.com/Files.Read.All",
	"https://graph.microsoft.com/Sites.Read.All",
}

// spAllowedExtensions is a business-document allowlist, not a code
// denylist - mirrors gdriveAllowedExtensions exactly, same rationale.
var spAllowedExtensions = map[string]bool{
	".pdf":  true,
	".doc":  true,
	".docx": true,
	".ppt":  true,
	".pptx": true,
	".txt":  true,
	".md":   true,
}

// maxSPFileBytes bounds a single file's downloaded content - same cap and
// same rationale as Drive's.
const maxSPFileBytes = 20 * 1024 * 1024 // 20MB

// spIsAllowedFile reports whether item should be discovered/synced at all.
// Folders, "package" items (OneNote notebooks and similar - no directly
// downloadable content), and delta-feed deletions are never allowed
// regardless of name.
func spIsAllowedFile(item spGraphDriveItem) bool {
	if item.Deleted != nil || item.Folder != nil || item.Package != nil || item.File == nil {
		return false
	}
	return spAllowedExtensions[strings.ToLower(filepath.Ext(item.Name))]
}

type sharepointConnector struct {
	oauthConfig *oauth2.Config
	// extractText converts a downloaded binary file's raw bytes into
	// ingestable text - nil means "no extractor wired", see extractedText.
	// Set via withTextExtractor, normally to knowledge.Service.ExtractText.
	extractText func(ctx context.Context, data []byte, contentType, filename string) string
}

func newSharePointConnector(oauthConfig *oauth2.Config) *sharepointConnector {
	return &sharepointConnector{oauthConfig: oauthConfig}
}

func (c *sharepointConnector) withTextExtractor(fn func(ctx context.Context, data []byte, contentType, filename string) string) *sharepointConnector {
	c.extractText = fn
	return c
}

func (c *sharepointConnector) Kind() connectorKind { return sharepointKind }

func (c *sharepointConnector) client(ctx context.Context, secret syncSecret) (*spGraphClient, error) {
	if c.oauthConfig == nil {
		return nil, fmt.Errorf("microsoft graph oauth is not configured")
	}
	token := &oauth2.Token{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		Expiry:       secret.ExpiresAt,
	}
	return &spGraphClient{http: c.oauthConfig.Client(ctx, token)}, nil
}

// spDriveCursor is the opaque payload stored as ConnectorAccount.SyncCursor -
// see the package doc comment for why it's a per-drive map rather than one
// account-wide token. Callers of Sync never need to know its shape.
type spDriveCursor map[string]string

func spDecodeCursor(raw string) spDriveCursor {
	cursor := spDriveCursor{}
	if raw == "" {
		return cursor
	}
	_ = json.Unmarshal([]byte(raw), &cursor)
	return cursor
}

func (c spDriveCursor) encode() string {
	data, err := json.Marshal(c)
	if err != nil {
		return "{}"
	}
	return string(data)
}

// Discover lists files across every site/drive the connected account can
// access, without downloading content - a lightweight preview, mirroring
// gdriveConnector.Discover. Always does a fresh full enumeration per drive
// (deltaPage with no stored link), never touching the account's own sync
// cursor.
func (c *sharepointConnector) Discover(ctx context.Context, account syncAccount, secret syncSecret) ([]resourceRef, error) {
	graph, err := c.client(ctx, secret)
	if err != nil {
		return nil, err
	}
	drives, err := c.allDrives(ctx, graph)
	if err != nil {
		return nil, err
	}
	var refs []resourceRef
	for _, driveID := range drives {
		items, _, err := graph.deltaPage(ctx, driveID, "")
		if err != nil {
			continue // one unreachable drive shouldn't fail the whole discovery
		}
		for _, item := range items {
			if !spIsAllowedFile(item) {
				continue
			}
			refs = append(refs, spDriveItemToResourceRef(driveID, item))
		}
	}
	return refs, nil
}

// Sync bootstraps (cursor == "") or continues (cursor holds a per-drive
// delta-link map, see spDriveCursor) - every drive the account can
// currently see is visited every call. A drive with no stored delta link
// yet gets a full enumeration just for that one drive, exactly like
// Discover; a drive that already has one only pulls what changed.
func (c *sharepointConnector) Sync(ctx context.Context, account syncAccount, secret syncSecret, cursor string) ([]syncItem, string, error) {
	graph, err := c.client(ctx, secret)
	if err != nil {
		return nil, "", err
	}
	drives, err := c.allDrives(ctx, graph)
	if err != nil {
		return nil, "", err
	}

	stored := spDecodeCursor(cursor)
	next := spDriveCursor{}
	var items []syncItem
	for _, driveID := range drives {
		pageItems, deltaLink, err := graph.deltaPage(ctx, driveID, stored[driveID])
		if err != nil {
			// One errored/unreachable drive shouldn't abort the whole sync -
			// keep whatever cursor it already had (retried next time) and
			// move on to the rest.
			if existing := stored[driveID]; existing != "" {
				next[driveID] = existing
			}
			continue
		}
		next[driveID] = deltaLink
		for _, item := range pageItems {
			if !spIsAllowedFile(item) {
				continue
			}
			if syncedItem, ok := c.syncOneItem(ctx, graph, driveID, item); ok {
				items = append(items, syncedItem)
			}
		}
	}
	return items, next.encode(), nil
}

func (c *sharepointConnector) allDrives(ctx context.Context, graph *spGraphClient) ([]string, error) {
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
// normal skip, not an error, mirroring gdriveConnector.syncOneFile.
func (c *sharepointConnector) syncOneItem(ctx context.Context, graph *spGraphClient, driveID string, item spGraphDriveItem) (syncItem, bool) {
	if item.Size > maxSPFileBytes {
		return syncItem{}, false
	}
	data, err := graph.downloadContent(ctx, driveID, item.ID, maxSPFileBytes)
	if err != nil || len(data) == 0 {
		return syncItem{}, false
	}
	text := c.extractedText(ctx, data, item.Name)
	if strings.TrimSpace(text) == "" {
		return syncItem{}, false
	}
	return syncItem{
		resourceRef:   spDriveItemToResourceRef(driveID, item),
		Text:          text,
		AccessControl: c.fetchAccessControl(ctx, graph, driveID, item.ID),
	}, true
}

// extractedText mirrors gdriveConnector.downloadText's non-native branch:
// every SharePoint file needs the same Docling-backed extraction an
// uploaded file gets, or its raw bytes get ingested as unsearchable noise.
// Plain-text/markdown pass through unchanged when no extractor is wired.
func (c *sharepointConnector) extractedText(ctx context.Context, data []byte, filename string) string {
	if c.extractText == nil {
		return string(data)
	}
	return c.extractText(ctx, data, "", filename)
}

// fetchAccessControl maps a DriveItem's permissions to prefixed identity
// strings - see spPermissionsToAccessControl for the actual mapping rules.
// Errors are swallowed (nil result), same discipline as
// gdriveConnector.fetchAccessControl.
func (c *sharepointConnector) fetchAccessControl(ctx context.Context, graph *spGraphClient, driveID, itemID string) []accessEntry {
	permissions, err := graph.listPermissions(ctx, driveID, itemID)
	if err != nil {
		return nil
	}
	return spPermissionsToAccessControl(permissions)
}

// spPermissionsToAccessControl is the pure mapping fetchAccessControl
// applies to whatever Graph returns - split out so it's unit-testable
// without a live *spGraphClient/HTTP mock, mirroring
// gdrivePermissionsToAccessControl.
//
// Deliberately conservative where Graph's identity data is ambiguous or
// incomplete:
//   - A granted user identity only becomes a "user:" entry when
//     siteUser.loginName is present (≈ the UPN/email on a work/school
//     tenant) - the bare user.id GUID+displayName pair Graph always returns
//     isn't enough to build a principal string that means anything to the
//     rest of this product's ACL model.
//   - An unredeemed email invitation becomes a "user:" entry directly
//     (invitation.email is reliably present, unlike grantedToV2.user).
//   - An "anonymous" sharing link becomes "public" (Drive's exact "anyone"
//     equivalent).
//   - An "organization" sharing link (anyone in the tenant) is NOT mapped
//     to "public" - that would broaden the item's visibility beyond what it
//     actually has, so it's simply skipped.
func spPermissionsToAccessControl(permissions []spGraphPermission) []accessEntry {
	var acl []accessEntry
	seen := map[accessEntry]bool{}
	add := func(entry accessEntry) {
		if entry == "" || seen[entry] {
			return
		}
		seen[entry] = true
		acl = append(acl, entry)
	}

	for _, p := range permissions {
		if p.GrantedToV2 != nil {
			spAddIdentitySetEntry(add, *p.GrantedToV2)
		}
		for _, ident := range p.GrantedToIdentitiesV2 {
			spAddIdentitySetEntry(add, ident)
		}
		if p.Invitation != nil && p.Invitation.Email != "" {
			add(accessEntry("user:" + p.Invitation.Email))
		}
		if p.Link != nil && p.Link.Scope == "anonymous" {
			add(accessEntry("public"))
		}
	}
	return acl
}

func spAddIdentitySetEntry(add func(accessEntry), identity spGraphIdentitySet) {
	if identity.SiteUser != nil && identity.SiteUser.LoginName != "" {
		add(accessEntry("user:" + identity.SiteUser.LoginName))
	}
	// No usable UPN/email otherwise (identity.User only ever carries an
	// opaque GUID + display name on this response) - skip rather than
	// guess, same restrictive-by-default handling as an unexploitable
	// permission entry.
}

// spDriveItemToResourceRef composites driveID into resourceRef.ID (a plain
// Graph item ID is only unique within its own drive, not account-wide, and
// this connector spans many drives).
func spDriveItemToResourceRef(driveID string, item spGraphDriveItem) resourceRef {
	modified, _ := time.Parse(time.RFC3339, item.LastModifiedDateTime)
	return resourceRef{
		ID:       driveID + ":" + item.ID,
		Name:     item.Name,
		Kind:     "file",
		Modified: modified,
	}
}

var _ knowledgeConnector = (*sharepointConnector)(nil)
