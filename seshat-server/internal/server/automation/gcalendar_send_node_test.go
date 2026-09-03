package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// newFakeGCalendarServer serves just enough of the Calendar API for
// gcalendar_create_event's events.insert call to succeed.
func newFakeGCalendarServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /calendar/v3/calendars/primary/events", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"id": "event-1"})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestGCalendarCreateEventNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewGCalendarCreateEventNode(&stubTokenResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestGCalendarCreateEventNodeExecuteRequiresConnectedAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewGCalendarCreateEventNode(&stubTokenResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"summary": "Sync", "start": "2026-09-10T15:00:00-07:00", "end": "2026-09-10T15:30:00-07:00"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Google Calendar account")
	}
}

func TestGCalendarCreateEventNodeExecutePropagatesTokenResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewGCalendarCreateEventNode(&stubTokenResolver{err: errors.New("boom")})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"summary": "Sync", "start": "2026-09-10T15:00:00-07:00", "end": "2026-09-10T15:30:00-07:00"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the token resolver's error to propagate")
	}
}

func TestGCalendarCreateEventNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewGCalendarCreateEventNode(tokens)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when summary/start/end are missing")
	}
}

func TestGCalendarCreateEventNodeExecuteCreatesAndReturnsEventID(t *testing.T) {
	env := newTestEnv(t)
	server := newFakeGCalendarServer(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewGCalendarCreateEventNode(tokens)
	n.baseURL = server.URL

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"summary": "Sync", "start": "2026-09-10T15:00:00-07:00", "end": "2026-09-10T15:30:00-07:00", "description": "weekly sync"}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["event_id"] != "event-1" {
		t.Fatalf("unexpected output: %+v", items)
	}
	if len(tokens.calls) != 1 || tokens.calls[0] != env.orgID+":gcalendar:user-1" {
		t.Fatalf("expected AccessTokenForUser to be called once for org/gcalendar/user-1, got %v", tokens.calls)
	}
}
