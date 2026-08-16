package knowledgesharepoint

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// graphBaseURL is the stable v1.0 Microsoft Graph endpoint - deliberately
// not beta, since this connector only needs long-stable surfaces (sites,
// drives, delta, content, permissions).
const graphBaseURL = "https://graph.microsoft.com/v1.0"

// driveItemFields limits each delta/listing response to only the fields
// this connector reads - mirrors internal/knowledgegdrive's
// fileListFields/permissionFields discipline (Graph, like Drive, returns a
// larger default field set otherwise).
const driveItemFields = "id,name,size,lastModifiedDateTime,file,folder,package,deleted"

type graphSite struct {
	ID string `json:"id"`
}

type sitesResponse struct {
	Value    []graphSite `json:"value"`
	NextLink string      `json:"@odata.nextLink"`
}

type graphDrive struct {
	ID string `json:"id"`
}

type drivesResponse struct {
	Value []graphDrive `json:"value"`
}

// graphDriveItem is one file/folder/package as returned by a delta page.
// Deleted is non-nil when this item represents a deletion in the delta feed.
type graphDriveItem struct {
	ID                   string    `json:"id"`
	Name                 string    `json:"name"`
	Size                 int64     `json:"size"`
	LastModifiedDateTime string    `json:"lastModifiedDateTime"`
	File                 *struct{} `json:"file,omitempty"`
	Folder               *struct{} `json:"folder,omitempty"`
	Package              *struct{} `json:"package,omitempty"`
	Deleted              *struct{} `json:"deleted,omitempty"`
}

type deltaResponse struct {
	Value     []graphDriveItem `json:"value"`
	NextLink  string           `json:"@odata.nextLink"`
	DeltaLink string           `json:"@odata.deltaLink"`
}

type graphSiteUser struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	LoginName   string `json:"loginName"`
}

type graphIdentity struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
}

type graphIdentitySet struct {
	User     *graphIdentity `json:"user,omitempty"`
	SiteUser *graphSiteUser `json:"siteUser,omitempty"`
}

type graphPermission struct {
	GrantedToV2           *graphIdentitySet  `json:"grantedToV2,omitempty"`
	GrantedToIdentitiesV2 []graphIdentitySet `json:"grantedToIdentitiesV2,omitempty"`
	Invitation            *struct {
		Email string `json:"email"`
	} `json:"invitation,omitempty"`
	Link *struct {
		Scope string `json:"scope"`
	} `json:"link,omitempty"`
}

type permissionsResponse struct {
	Value []graphPermission `json:"value"`
}

// graphClient is a minimal hand-rolled Microsoft Graph HTTP client - no
// official Go SDK is vendored in this module, and the connector only needs
// five call shapes (see the package doc comment), not the full Graph
// surface a generated SDK would bring in.
type graphClient struct {
	http *http.Client
}

// graphError carries the HTTP status so callers can special-case 410 Gone
// (expired delta link, see deltaPage's doc comment).
type graphError struct {
	Status   int
	Location string
	Body     string
}

func (e *graphError) Error() string {
	return fmt.Sprintf("microsoft graph returned %d: %s", e.Status, e.Body)
}

func (c *graphClient) get(ctx context.Context, url string, out any) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return resp, &graphError{Status: resp.StatusCode, Location: resp.Header.Get("Location"), Body: string(body)}
	}
	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			return resp, fmt.Errorf("decode graph response: %w", err)
		}
	}
	return resp, nil
}

// listSites paginates GET /sites?search=* — a broad search matching every
// site the connected account can access, the SharePoint analog of Drive's
// unscoped Files.List (see connector.go's package doc for why this
// connector doesn't do manual per-site scoping).
func (c *graphClient) listSites(ctx context.Context) ([]graphSite, error) {
	var sites []graphSite
	url := graphBaseURL + "/sites?search=*&$select=id"
	for url != "" {
		var page sitesResponse
		if _, err := c.get(ctx, url, &page); err != nil {
			return nil, fmt.Errorf("list sites: %w", err)
		}
		sites = append(sites, page.Value...)
		url = page.NextLink
	}
	return sites, nil
}

// listDrives returns a site's document libraries (drives).
func (c *graphClient) listDrives(ctx context.Context, siteID string) ([]graphDrive, error) {
	var page drivesResponse
	url := graphBaseURL + "/sites/" + siteID + "/drives?$select=id"
	if _, err := c.get(ctx, url, &page); err != nil {
		return nil, fmt.Errorf("list drives for site %s: %w", siteID, err)
	}
	return page.Value, nil
}

// deltaPage returns every item changed since deltaLink (empty = full
// enumeration, matching Discover/a first-ever Sync) for one drive, paging
// through @odata.nextLink internally and returning once @odata.deltaLink
// is reached — the caller only ever sees one logical "page" (potentially
// large) plus the new deltaLink to persist as this drive's cursor.
//
// A 410 Gone response (an expired/invalidated delta link — see Microsoft's
// own delta-query docs) carries a fresh, token-less delta URL in its
// Location header; that's treated as "start this drive over from a full
// enumeration" rather than an error, since it's an expected, if
// infrequent, real-world occurrence for a long-lived synced account.
func (c *graphClient) deltaPage(ctx context.Context, driveID, deltaLink string) ([]graphDriveItem, string, error) {
	url := deltaLink
	if url == "" {
		url = graphBaseURL + "/drives/" + driveID + "/root/delta?$select=" + driveItemFields
	}

	var items []graphDriveItem
	for {
		var page deltaResponse
		_, err := c.get(ctx, url, &page)
		if err != nil {
			var gerr *graphError
			if isGraphError(err, &gerr) && gerr.Status == http.StatusGone && gerr.Location != "" {
				// Expired delta link - restart this drive's enumeration
				// from the fresh URL Graph handed back, discarding
				// whatever partial page we'd accumulated so far (it may
				// overlap/conflict with the restarted sequence).
				items = nil
				url = gerr.Location
				continue
			}
			return nil, "", fmt.Errorf("delta page for drive %s: %w", driveID, err)
		}
		items = append(items, page.Value...)
		if page.DeltaLink != "" {
			return items, page.DeltaLink, nil
		}
		if page.NextLink == "" {
			// Shouldn't happen (Graph always returns either nextLink or
			// deltaLink), but avoid an infinite loop if it ever does.
			return items, deltaLink, nil
		}
		url = page.NextLink
	}
}

func isGraphError(err error, target **graphError) bool {
	gerr, ok := err.(*graphError)
	if ok {
		*target = gerr
	}
	return ok
}

// downloadContent fetches a DriveItem's raw bytes. Unlike Google Docs/
// Slides, no native-format export step exists for SharePoint content —
// Office files (.docx/.pptx/.xlsx) are real binary files and download
// directly, same as a PDF (see connector.go's package doc). Graph responds
// with a 302 to a pre-authenticated, time-limited URL; Go's default
// http.Client follows redirects transparently, so no special handling is
// needed here.
func (c *graphClient) downloadContent(ctx context.Context, driveID, itemID string, maxBytes int64) ([]byte, error) {
	url := graphBaseURL + "/drives/" + driveID + "/items/" + itemID + "/content"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, &graphError{Status: resp.StatusCode, Body: string(body)}
	}
	return io.ReadAll(io.LimitReader(resp.Body, maxBytes))
}

// listPermissions returns a DriveItem's access list, mapped by the caller
// (fetchAccessControl in connector.go) into connector.AccessEntry values.
func (c *graphClient) listPermissions(ctx context.Context, driveID, itemID string) ([]graphPermission, error) {
	var page permissionsResponse
	url := graphBaseURL + "/drives/" + driveID + "/items/" + itemID + "/permissions"
	if _, err := c.get(ctx, url, &page); err != nil {
		return nil, fmt.Errorf("list permissions for item %s: %w", itemID, err)
	}
	return page.Value, nil
}
