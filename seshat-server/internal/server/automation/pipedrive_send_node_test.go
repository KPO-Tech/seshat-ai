package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// stubAccountConfigResolver mirrors stubTokenResolver - a minimal
// AccountConfigResolver double keyed by userID.
type stubAccountConfigResolver struct {
	configsByUser map[string]string
	err           error
	calls         []string
}

func (r *stubAccountConfigResolver) AccountConfigForUser(ctx context.Context, organizationID, kind, userID string) (string, bool, error) {
	r.calls = append(r.calls, organizationID+":"+kind+":"+userID)
	if r.err != nil {
		return "", false, r.err
	}
	config, ok := r.configsByUser[userID]
	if !ok || config == "" {
		return "", false, nil
	}
	return config, true, nil
}

// newFakePipedriveServer serves just enough of the Pipedrive API for
// pipedrive_create_deal's deals call to succeed.
func newFakePipedriveServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/deals", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"data": map[string]any{"id": 7}})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestPipedriveCreateDealNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewPipedriveCreateDealNode(&stubTokenResolver{}, &stubAccountConfigResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestPipedriveCreateDealNodeExecuteRequiresConnectedAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewPipedriveCreateDealNode(&stubTokenResolver{}, &stubAccountConfigResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"title": "hi"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Pipedrive account")
	}
}

func TestPipedriveCreateDealNodeExecutePropagatesTokenResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewPipedriveCreateDealNode(&stubTokenResolver{err: errors.New("boom")}, &stubAccountConfigResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"title": "hi"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the token resolver's error to propagate")
	}
}

func TestPipedriveCreateDealNodeExecuteRequiresAccountConfig(t *testing.T) {
	env := newTestEnv(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewPipedriveCreateDealNode(tokens, &stubAccountConfigResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"title": "hi"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the connected account has no api_domain config")
	}
}

func TestPipedriveCreateDealNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	configs := &stubAccountConfigResolver{configsByUser: map[string]string{"user-1": `{"api_domain":"https://acme.pipedrive.com"}`}}
	n := NewPipedriveCreateDealNode(tokens, configs)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when title is missing")
	}
}

func TestPipedriveCreateDealNodeExecuteCreatesAndReturnsDealID(t *testing.T) {
	env := newTestEnv(t)
	server := newFakePipedriveServer(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	configs := &stubAccountConfigResolver{configsByUser: map[string]string{"user-1": `{"api_domain":"` + server.URL + `"}`}}
	n := NewPipedriveCreateDealNode(tokens, configs)

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"title": "hi", "value": "1000", "currency": "USD"}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["deal_id"] != 7 {
		t.Fatalf("unexpected output: %+v", items)
	}
	if len(configs.calls) != 1 || configs.calls[0] != env.orgID+":pipedrive:user-1" {
		t.Fatalf("expected AccountConfigForUser to be called once for org/pipedrive/user-1, got %v", configs.calls)
	}
}
