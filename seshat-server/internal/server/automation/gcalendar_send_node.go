package automation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// GCalendarCreateEventNode is the "gcalendar_create_event" node type:
// creates an event on a calendar in the job owner's connected Google
// Calendar account. Deliberately not part of the generic pkg/dataflow SDK -
// same reasoning as GmailPollNode, it needs a seshat-ai connector account.
//
// No seshat-core/gcalendar package exists yet, so this hand-rolls the one
// request it needs directly (the Calendar API v3 events.insert endpoint) -
// the first representative Calendar action, not exhaustive API coverage.
// start/end are passed straight through as RFC3339 datetimes (the caller's
// responsibility to format, same as every other datetime-shaped parameter
// in this codebase's dataflow nodes) - no all-day/date-only event support
// in this pass. Reads job context (owner_id, organization_id) from its own
// input, same constraint as GmailSendNode - see its doc comment.
type GCalendarCreateEventNode struct {
	tokens ConnectorTokenResolver
	// httpClient/baseURL are injectable for tests, same pattern as
	// GmailPollNode's newGmailClient field.
	httpClient *http.Client
	baseURL    string
}

func NewGCalendarCreateEventNode(tokens ConnectorTokenResolver) *GCalendarCreateEventNode {
	return &GCalendarCreateEventNode{tokens: tokens, httpClient: http.DefaultClient, baseURL: "https://www.googleapis.com"}
}

func (n *GCalendarCreateEventNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "gcalendar_create_event", Name: "Google Calendar: Create Event", Category: "Productivity",
		Description: "Creates an event on a calendar in the job owner's connected Google Calendar account, emitting one item with the created event's id (field \"event_id\"). " +
			"Requires a connected Google Calendar account (connect one in your organization's Connections settings) and job/owner/organization identity in this node's input item (works cleanly right after the graph's start; a node that builds a brand new item, e.g. http_request, will not carry that identity forward). " +
			"Parameters: summary (string, required). start (string, required) - RFC3339 datetime, e.g. \"2026-09-10T15:00:00-07:00\". end (string, required) - RFC3339 datetime. calendarId (string, optional, defaults to \"primary\"). description (string, optional)."}
}

func (n *GCalendarCreateEventNode) ValidateParameters(params map[string]any) error {
	if dataflow.StringParam(params, "summary", "") == "" {
		return errors.New("summary is required")
	}
	if dataflow.StringParam(params, "start", "") == "" {
		return errors.New("start is required")
	}
	if dataflow.StringParam(params, "end", "") == "" {
		return errors.New("end is required")
	}
	return nil
}

func (n *GCalendarCreateEventNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("gcalendar_create_event: no job context in input (expected job_id/owner_id/organization_id)")
	}
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("gcalendar_create_event: owner_id/organization_id are required in input")
	}

	token, ok, err := n.tokens.AccessTokenForUser(ctx, organizationID, "gcalendar", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve gcalendar access token: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("gcalendar_create_event: job owner has no connected Google Calendar account")
	}

	if err := n.ValidateParameters(params); err != nil {
		return dataflow.Output{}, err
	}
	summary := dataflow.StringParam(params, "summary", "")
	start := dataflow.StringParam(params, "start", "")
	end := dataflow.StringParam(params, "end", "")
	calendarID := dataflow.StringParam(params, "calendarId", "primary")
	description := dataflow.StringParam(params, "description", "")

	body := map[string]any{
		"summary": summary,
		"start":   map[string]any{"dateTime": start},
		"end":     map[string]any{"dateTime": end},
	}
	if description != "" {
		body["description"] = description
	}
	encoded, err := json.Marshal(body)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("encode gcalendar request: %w", err)
	}

	requestURL := fmt.Sprintf("%s/calendar/v3/calendars/%s/events", n.baseURL, url.PathEscape(calendarID))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(encoded))
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build gcalendar request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("gcalendar create event: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return dataflow.Output{}, fmt.Errorf("gcalendar create event: status %d: %s", resp.StatusCode, string(respBody))
	}

	var event struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(respBody, &event); err != nil {
		return dataflow.Output{}, fmt.Errorf("decode gcalendar response: %w", err)
	}
	return dataflow.Main([]dataflow.Item{{"event_id": event.ID}}), nil
}
