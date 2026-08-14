// Package knowledgegdrive implements connector.KnowledgeConnector for
// Google Drive (read-only) via the Drive API v3 - structurally mirrors
// internal/inboxgmail's connector (thin translation layer; persistence
// lives in knowledge.Service, not here). See helps/roadmap.md Phase 1.
package knowledgegdrive

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"golang.org/x/oauth2"
	drive "google.golang.org/api/drive/v3"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/option"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/connector"
)

const Kind connector.Kind = "gdrive"

// fileListFields/changeListFields/permissionFields limit each Drive API
// response to only the fields this connector reads - Drive returns a large
// default field set otherwise.
const (
	fileListFields   = "nextPageToken, files(id, name, mimeType, modifiedTime, trashed, size)"
	changeListFields = "nextPageToken, newStartPageToken, changes(fileId, removed, file(id, name, mimeType, modifiedTime, trashed, size))"
	permissionFields = "permissions(type, emailAddress, domain, role)"
)

// exportMimeTypes maps a Google-native document's mimeType to the mimeType
// requested from Files.Export - only Docs/Sheets/Slides need this; every
// other file downloads its raw bytes directly via Files.Get(...).Download().
var exportMimeTypes = map[string]string{
	"application/vnd.google-apps.document":     "text/plain",
	"application/vnd.google-apps.spreadsheet":  "text/csv",
	"application/vnd.google-apps.presentation": "text/plain",
}

// folderMimeType identifies a Drive folder, which Discover/Sync both skip -
// there's no content to ingest, only files.
const folderMimeType = "application/vnd.google-apps.folder"

// maxFileBytes bounds a single file's exported/downloaded content - a
// pragmatic cap so one huge file can't stall or blow up memory during a
// sync. Files over this are skipped, not truncated silently mid-ingest.
const maxFileBytes = 20 * 1024 * 1024 // 20MB

type Connector struct {
	oauthConfig *oauth2.Config
}

func NewConnector(oauthConfig *oauth2.Config) *Connector {
	return &Connector{oauthConfig: oauthConfig}
}

func (c *Connector) Kind() connector.Kind { return Kind }

func (c *Connector) Capabilities() []connector.Capability {
	return []connector.Capability{connector.CapabilityKnowledge}
}

func (c *Connector) client(ctx context.Context, secret connector.Secret) (*drive.Service, error) {
	if c.oauthConfig == nil {
		return nil, fmt.Errorf("google drive oauth is not configured")
	}
	token := &oauth2.Token{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		Expiry:       secret.ExpiresAt,
	}
	ts := c.oauthConfig.TokenSource(ctx, token)
	return drive.NewService(ctx, option.WithTokenSource(ts))
}

// Discover lists files in the account's Drive without fetching their
// content - a lightweight preview of what a Sync would pull in.
func (c *Connector) Discover(ctx context.Context, account connector.Account, secret connector.Secret) ([]connector.ResourceRef, error) {
	srv, err := c.client(ctx, secret)
	if err != nil {
		return nil, err
	}

	var refs []connector.ResourceRef
	pageToken := ""
	for {
		call := srv.Files.List().Q("trashed = false").Fields(googleapi.Field(fileListFields)).PageSize(200)
		if pageToken != "" {
			call = call.PageToken(pageToken)
		}
		list, err := call.Context(ctx).Do()
		if err != nil {
			return nil, fmt.Errorf("list drive files: %w", err)
		}
		for _, f := range list.Files {
			if f.MimeType == folderMimeType {
				continue
			}
			refs = append(refs, driveFileToResourceRef(f))
		}
		if list.NextPageToken == "" {
			break
		}
		pageToken = list.NextPageToken
	}
	return refs, nil
}

// Sync bootstraps (cursor == "") by listing and downloading every file, or
// pulls only what changed since cursor via Drive's Changes API - mirroring
// inboxgmail's bootstrap/incremental split (a Gmail historyId there, a
// Drive changes page token here).
func (c *Connector) Sync(ctx context.Context, account connector.Account, secret connector.Secret, cursor string) ([]connector.SyncItem, string, error) {
	srv, err := c.client(ctx, secret)
	if err != nil {
		return nil, "", err
	}
	if cursor == "" {
		return c.bootstrapSync(ctx, srv)
	}
	return c.incrementalSync(ctx, srv, cursor)
}

func (c *Connector) bootstrapSync(ctx context.Context, srv *drive.Service) ([]connector.SyncItem, string, error) {
	// Capture the current page token before listing so nothing that changes
	// during this (possibly long) initial sync is missed by the first
	// incremental sync that follows.
	startToken, err := srv.Changes.GetStartPageToken().Context(ctx).Do()
	if err != nil {
		return nil, "", fmt.Errorf("get drive start page token: %w", err)
	}

	var items []connector.SyncItem
	pageToken := ""
	for {
		call := srv.Files.List().Q("trashed = false").Fields(googleapi.Field(fileListFields)).PageSize(100)
		if pageToken != "" {
			call = call.PageToken(pageToken)
		}
		list, err := call.Context(ctx).Do()
		if err != nil {
			return nil, "", fmt.Errorf("list drive files: %w", err)
		}
		for _, f := range list.Files {
			if f.MimeType == folderMimeType {
				continue
			}
			if item, ok := c.syncOneFile(ctx, srv, f); ok {
				items = append(items, item)
			}
		}
		if list.NextPageToken == "" {
			break
		}
		pageToken = list.NextPageToken
	}
	return items, startToken.StartPageToken, nil
}

func (c *Connector) incrementalSync(ctx context.Context, srv *drive.Service, cursor string) ([]connector.SyncItem, string, error) {
	var items []connector.SyncItem
	pageToken := cursor
	nextCursor := cursor
	for {
		list, err := srv.Changes.List(pageToken).Fields(googleapi.Field(changeListFields)).PageSize(100).Context(ctx).Do()
		if err != nil {
			return nil, "", fmt.Errorf("list drive changes: %w", err)
		}
		for _, ch := range list.Changes {
			if ch.Removed || ch.File == nil || ch.File.Trashed || ch.File.MimeType == folderMimeType {
				continue
			}
			if item, ok := c.syncOneFile(ctx, srv, ch.File); ok {
				items = append(items, item)
			}
		}
		if list.NewStartPageToken != "" {
			nextCursor = list.NewStartPageToken
		}
		if list.NextPageToken == "" {
			break
		}
		pageToken = list.NextPageToken
	}
	return items, nextCursor, nil
}

// syncOneFile fetches a file's content and permissions. ok=false is a
// normal skip, not an error - an unexportable Google-native type (forms,
// drawings, ...), a file over maxFileBytes, or content that fails to
// download all fall through to "not synced this round" rather than failing
// the whole batch.
func (c *Connector) syncOneFile(ctx context.Context, srv *drive.Service, f *drive.File) (connector.SyncItem, bool) {
	if f.Size > maxFileBytes {
		return connector.SyncItem{}, false
	}
	text, ok := c.downloadText(ctx, srv, f)
	if !ok {
		return connector.SyncItem{}, false
	}
	return connector.SyncItem{
		ResourceRef:   driveFileToResourceRef(f),
		Text:          text,
		AccessControl: c.fetchAccessControl(ctx, srv, f.Id),
	}, true
}

func (c *Connector) downloadText(ctx context.Context, srv *drive.Service, f *drive.File) (string, bool) {
	var resp *http.Response
	var err error
	if exportMime, ok := exportMimeTypes[f.MimeType]; ok {
		resp, err = srv.Files.Export(f.Id, exportMime).Context(ctx).Download()
	} else {
		resp, err = srv.Files.Get(f.Id).Context(ctx).Download()
	}
	if err != nil || resp == nil {
		return "", false
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxFileBytes))
	if err != nil || len(data) == 0 {
		return "", false
	}
	return string(data), true
}

// fetchAccessControl maps Drive's per-file permissions to prefixed identity
// strings, mirroring Elastic Connectors' _allow_access_control model (see
// helps/elastic-connectors's connectors/access_control.py) -
// "user:email", "group:email", "domain:name", or "public" for
// anyone-with-the-link. Errors are swallowed (nil result): IngestExternal
// already falls back to the corpus's own scope when AccessControl is
// empty, so a permissions-fetch failure degrades to "only the connecting
// account can see this," never to over-sharing.
func (c *Connector) fetchAccessControl(ctx context.Context, srv *drive.Service, fileID string) []connector.AccessEntry {
	list, err := srv.Permissions.List(fileID).Fields(googleapi.Field(permissionFields)).Context(ctx).Do()
	if err != nil {
		return nil
	}
	return permissionsToAccessControl(list.Permissions)
}

// permissionsToAccessControl is the pure mapping fetchAccessControl applies
// to whatever the Drive API returns - split out so it's unit-testable
// without a live *drive.Service/HTTP mock.
func permissionsToAccessControl(permissions []*drive.Permission) []connector.AccessEntry {
	var acl []connector.AccessEntry
	for _, p := range permissions {
		switch p.Type {
		case "user":
			if p.EmailAddress != "" {
				acl = append(acl, connector.AccessEntry("user:"+p.EmailAddress))
			}
		case "group":
			if p.EmailAddress != "" {
				acl = append(acl, connector.AccessEntry("group:"+p.EmailAddress))
			}
		case "domain":
			if p.Domain != "" {
				acl = append(acl, connector.AccessEntry("domain:"+p.Domain))
			}
		case "anyone":
			acl = append(acl, connector.AccessEntry("public"))
		}
	}
	return acl
}

func driveFileToResourceRef(f *drive.File) connector.ResourceRef {
	modified, _ := time.Parse(time.RFC3339, f.ModifiedTime)
	return connector.ResourceRef{
		ID:       f.Id,
		Name:     f.Name,
		Kind:     "file",
		Modified: modified,
	}
}

var _ connector.KnowledgeConnector = (*Connector)(nil)
