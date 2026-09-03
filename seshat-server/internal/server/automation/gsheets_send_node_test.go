package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// newFakeGSheetsServer serves just enough of the Sheets API for
// gsheets_append_row's values:append call to succeed.
func newFakeGSheetsServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v4/spreadsheets/sheet-1/values/Sheet1:append", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"updates": map[string]any{"updatedRange": "Sheet1!A2:B2"}})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestGSheetsAppendRowNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewGSheetsAppendRowNode(&stubTokenResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestGSheetsAppendRowNodeExecuteRequiresConnectedAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewGSheetsAppendRowNode(&stubTokenResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"spreadsheetId": "sheet-1", "sheetRange": "Sheet1", "values": []any{"a", "b"}}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Google Sheets account")
	}
}

func TestGSheetsAppendRowNodeExecutePropagatesTokenResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewGSheetsAppendRowNode(&stubTokenResolver{err: errors.New("boom")})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"spreadsheetId": "sheet-1", "sheetRange": "Sheet1", "values": []any{"a", "b"}}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the token resolver's error to propagate")
	}
}

func TestGSheetsAppendRowNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewGSheetsAppendRowNode(tokens)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when spreadsheetId/sheetRange/values are missing")
	}
}

func TestGSheetsAppendRowNodeExecuteAppendsAndReturnsUpdatedRange(t *testing.T) {
	env := newTestEnv(t)
	server := newFakeGSheetsServer(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewGSheetsAppendRowNode(tokens)
	n.baseURL = server.URL

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"spreadsheetId": "sheet-1", "sheetRange": "Sheet1", "values": []any{"a", "b"}}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["updated_range"] != "Sheet1!A2:B2" {
		t.Fatalf("unexpected output: %+v", items)
	}
	if len(tokens.calls) != 1 || tokens.calls[0] != env.orgID+":gsheets:user-1" {
		t.Fatalf("expected AccessTokenForUser to be called once for org/gsheets/user-1, got %v", tokens.calls)
	}
}
