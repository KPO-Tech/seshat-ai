package gmail

import (
	"context"
	"errors"
	"fmt"
	"strconv"

	"golang.org/x/oauth2"
	gmailapi "google.golang.org/api/gmail/v1"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/option"
)

// Scopes requested from Google - read + send only, matching what this
// client actually does. Gmail's read/send scopes are "restricted"
// (Google's sensitive-scope review applies), which is also why each
// deployment registers its own Google Cloud OAuth client and consent
// screen rather than sharing a public one.
var Scopes = []string{
	"https://www.googleapis.com/auth/gmail.readonly",
	"https://www.googleapis.com/auth/gmail.send",
	"https://www.googleapis.com/auth/userinfo.email",
}

// bootstrapMessageLimit caps how many messages a brand-new connection
// pulls in on its first sync - enough to seed a useful triage list without
// a multi-minute initial sync on a mailbox with years of history.
const bootstrapMessageLimit = 50

// Client wraps the official Gmail API client.
type Client struct {
	svc *gmailapi.Service
}

// New builds a Client from an oauth2.TokenSource - this package never sees
// a raw OAuth config or does its own token exchange. Extra opts are passed
// through to gmailapi.NewService, letting tests point at a fake server via
// option.WithHTTPClient/option.WithEndpoint.
func New(ctx context.Context, tokenSource oauth2.TokenSource, opts ...option.ClientOption) (*Client, error) {
	allOpts := append([]option.ClientOption{option.WithTokenSource(tokenSource)}, opts...)
	svc, err := gmailapi.NewService(ctx, allOpts...)
	if err != nil {
		return nil, err
	}
	return &Client{svc: svc}, nil
}

// Sync pulls everything new since cursor and returns it plus the cursor
// value to persist for next time. An empty cursor bootstraps (a snapshot
// of recent messages); a history-expired cursor (Gmail only retains
// history for ~7 days) transparently falls back to a fresh bootstrap
// instead of surfacing an error the caller can't act on.
func (c *Client) Sync(ctx context.Context, cursor string) ([]Message, string, error) {
	if cursor == "" {
		return c.bootstrapSync(ctx)
	}
	messages, nextCursor, err := c.incrementalSync(ctx, cursor)
	if err != nil && isHistoryExpired(err) {
		return c.bootstrapSync(ctx)
	}
	return messages, nextCursor, err
}

func (c *Client) bootstrapSync(ctx context.Context) ([]Message, string, error) {
	profile, err := c.svc.Users.GetProfile("me").Context(ctx).Do()
	if err != nil {
		return nil, "", fmt.Errorf("get profile: %w", err)
	}
	list, err := c.svc.Users.Messages.List("me").MaxResults(bootstrapMessageLimit).Context(ctx).Do()
	if err != nil {
		return nil, "", fmt.Errorf("list messages: %w", err)
	}
	messages, err := c.fetchAndTranslate(ctx, messageIDs(list.Messages))
	if err != nil {
		return nil, "", err
	}
	// The profile's HistoryId is captured after listing, so anything that
	// arrived mid-bootstrap is (at worst) re-observed on the very next
	// incremental sync - persistence on the caller's side is expected to
	// be idempotent per external message ID, so that's a no-op rather than
	// a duplicate.
	return messages, strconv.FormatUint(profile.HistoryId, 10), nil
}

func (c *Client) incrementalSync(ctx context.Context, cursor string) ([]Message, string, error) {
	startHistoryID, err := strconv.ParseUint(cursor, 10, 64)
	if err != nil {
		return nil, "", fmt.Errorf("invalid sync cursor %q: %w", cursor, err)
	}

	var ids []string
	latestHistoryID := startHistoryID
	pageToken := ""
	for {
		call := c.svc.Users.History.List("me").StartHistoryId(startHistoryID).HistoryTypes("messageAdded").Context(ctx)
		if pageToken != "" {
			call = call.PageToken(pageToken)
		}
		resp, err := call.Do()
		if err != nil {
			return nil, "", fmt.Errorf("list history: %w", err)
		}
		if resp.HistoryId > latestHistoryID {
			latestHistoryID = resp.HistoryId
		}
		for _, h := range resp.History {
			for _, added := range h.MessagesAdded {
				if added.Message != nil {
					ids = append(ids, added.Message.Id)
				}
			}
		}
		if resp.NextPageToken == "" {
			break
		}
		pageToken = resp.NextPageToken
	}

	messages, err := c.fetchAndTranslate(ctx, ids)
	if err != nil {
		return nil, "", err
	}
	return messages, strconv.FormatUint(latestHistoryID, 10), nil
}

func (c *Client) fetchAndTranslate(ctx context.Context, ids []string) ([]Message, error) {
	messages := make([]Message, 0, len(ids))
	for _, id := range ids {
		msg, err := c.svc.Users.Messages.Get("me", id).Format("full").Context(ctx).Do()
		if err != nil {
			return nil, fmt.Errorf("get message %s: %w", id, err)
		}
		m, err := translateRawMessage(msg)
		if err != nil {
			// A single unparseable message (e.g. a malformed header on some
			// automated sender) shouldn't fail the whole sync - skip it and
			// keep going.
			continue
		}
		messages = append(messages, m)
	}
	return messages, nil
}

func messageIDs(refs []*gmailapi.Message) []string {
	ids := make([]string, 0, len(refs))
	for _, r := range refs {
		ids = append(ids, r.Id)
	}
	return ids
}

func isHistoryExpired(err error) bool {
	var apiErr *googleapi.Error
	return errors.As(err, &apiErr) && apiErr.Code == 404
}
