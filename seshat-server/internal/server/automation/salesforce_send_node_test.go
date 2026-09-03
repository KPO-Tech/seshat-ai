package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// newFakeSalesforceServer serves just enough of the Salesforce REST API
// for salesforce_create_record's sobjects call to succeed.
func newFakeSalesforceServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /services/data/"+salesforceAPIVersion+"/sobjects/Contact", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"id": "003fake"})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestSalesforceCreateRecordNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewSalesforceCreateRecordNode(&stubTokenResolver{}, &stubAccountConfigResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestSalesforceCreateRecordNodeExecuteRequiresConnectedAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewSalesforceCreateRecordNode(&stubTokenResolver{}, &stubAccountConfigResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"sobjectType": "Contact", "fields": map[string]any{"LastName": "Lovelace"}}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Salesforce account")
	}
}

func TestSalesforceCreateRecordNodeExecutePropagatesTokenResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewSalesforceCreateRecordNode(&stubTokenResolver{err: errors.New("boom")}, &stubAccountConfigResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"sobjectType": "Contact", "fields": map[string]any{"LastName": "Lovelace"}}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the token resolver's error to propagate")
	}
}

func TestSalesforceCreateRecordNodeExecuteRequiresAccountConfig(t *testing.T) {
	env := newTestEnv(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewSalesforceCreateRecordNode(tokens, &stubAccountConfigResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"sobjectType": "Contact", "fields": map[string]any{"LastName": "Lovelace"}}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the connected account has no instance_url config")
	}
}

func TestSalesforceCreateRecordNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	configs := &stubAccountConfigResolver{configsByUser: map[string]string{"user-1": `{"instance_url":"https://acme.my.salesforce.com"}`}}
	n := NewSalesforceCreateRecordNode(tokens, configs)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when sobjectType/fields are missing")
	}
}

func TestSalesforceCreateRecordNodeExecuteCreatesAndReturnsRecordID(t *testing.T) {
	env := newTestEnv(t)
	server := newFakeSalesforceServer(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	configs := &stubAccountConfigResolver{configsByUser: map[string]string{"user-1": `{"instance_url":"` + server.URL + `"}`}}
	n := NewSalesforceCreateRecordNode(tokens, configs)

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"sobjectType": "Contact", "fields": map[string]any{"LastName": "Lovelace"}}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["record_id"] != "003fake" {
		t.Fatalf("unexpected output: %+v", items)
	}
	if len(configs.calls) != 1 || configs.calls[0] != env.orgID+":salesforce:user-1" {
		t.Fatalf("expected AccountConfigForUser to be called once for org/salesforce/user-1, got %v", configs.calls)
	}
}
