package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// newFakeAirtableServer serves just enough of the Airtable API for
// airtable_create_record's create-record call to succeed.
func newFakeAirtableServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v0/app1/Table1", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"id": "rec-1"})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestAirtableCreateRecordNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewAirtableCreateRecordNode(&stubStaticSecretResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestAirtableCreateRecordNodeExecuteRequiresConnectedAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewAirtableCreateRecordNode(&stubStaticSecretResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"baseId": "app1", "tableIdOrName": "Table1", "fields": map[string]any{"Name": "Ada"}}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Airtable account")
	}
}

func TestAirtableCreateRecordNodeExecutePropagatesSecretResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewAirtableCreateRecordNode(&stubStaticSecretResolver{err: errors.New("boom")})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"baseId": "app1", "tableIdOrName": "Table1", "fields": map[string]any{"Name": "Ada"}}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the secret resolver's error to propagate")
	}
}

func TestAirtableCreateRecordNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	secrets := &stubStaticSecretResolver{secretsByUser: map[string]string{"user-1": "pat-fake"}}
	n := NewAirtableCreateRecordNode(secrets)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when baseId/tableIdOrName/fields are missing")
	}
}

func TestAirtableCreateRecordNodeExecuteCreatesAndReturnsRecordID(t *testing.T) {
	env := newTestEnv(t)
	server := newFakeAirtableServer(t)
	secrets := &stubStaticSecretResolver{secretsByUser: map[string]string{"user-1": "pat-fake"}}
	n := NewAirtableCreateRecordNode(secrets)
	n.baseURL = server.URL

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"baseId": "app1", "tableIdOrName": "Table1", "fields": map[string]any{"Name": "Ada"}}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["record_id"] != "rec-1" {
		t.Fatalf("unexpected output: %+v", items)
	}
	if len(secrets.calls) != 1 || secrets.calls[0] != env.orgID+":airtable:user-1" {
		t.Fatalf("expected StaticSecretForUser to be called once for org/airtable/user-1, got %v", secrets.calls)
	}
}
