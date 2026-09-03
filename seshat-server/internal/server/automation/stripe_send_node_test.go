package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// stubStaticSecretResolver mirrors stubTokenResolver — a minimal
// StaticSecretResolver double keyed by userID.
type stubStaticSecretResolver struct {
	secretsByUser map[string]string
	err           error
	calls         []string
}

func (r *stubStaticSecretResolver) StaticSecretForUser(ctx context.Context, organizationID, kind, userID string) (string, bool, error) {
	r.calls = append(r.calls, organizationID+":"+kind+":"+userID)
	if r.err != nil {
		return "", false, r.err
	}
	secret, ok := r.secretsByUser[userID]
	if !ok || secret == "" {
		return "", false, nil
	}
	return secret, true, nil
}

// newFakeStripeServer serves just enough of the Stripe API for
// stripe_create_customer's POST /v1/customers call to succeed.
func newFakeStripeServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/customers", func(w http.ResponseWriter, r *http.Request) {
		if ct := r.Header.Get("Content-Type"); ct != "application/x-www-form-urlencoded" {
			http.Error(w, "expected form-encoded body, got "+ct, http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]any{"id": "cus_1"})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestStripeCreateCustomerNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewStripeCreateCustomerNode(&stubStaticSecretResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestStripeCreateCustomerNodeExecuteRequiresConnectedStripeAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewStripeCreateCustomerNode(&stubStaticSecretResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"email": "a@example.com"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Stripe account")
	}
}

func TestStripeCreateCustomerNodeExecutePropagatesSecretResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewStripeCreateCustomerNode(&stubStaticSecretResolver{err: errors.New("boom")})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"email": "a@example.com"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the secret resolver's error to propagate")
	}
}

func TestStripeCreateCustomerNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	secrets := &stubStaticSecretResolver{secretsByUser: map[string]string{"user-1": "sk_test_fake"}}
	n := NewStripeCreateCustomerNode(secrets)
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when email is missing")
	}
}

func TestStripeCreateCustomerNodeExecuteCreatesAndReturnsCustomerID(t *testing.T) {
	env := newTestEnv(t)
	server := newFakeStripeServer(t)
	secrets := &stubStaticSecretResolver{secretsByUser: map[string]string{"user-1": "sk_test_fake"}}
	n := NewStripeCreateCustomerNode(secrets)
	n.baseURL = server.URL

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"email": "a@example.com", "name": "Alice"}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["customer_id"] != "cus_1" {
		t.Fatalf("unexpected output: %+v", items)
	}
	if len(secrets.calls) != 1 || secrets.calls[0] != env.orgID+":stripe:user-1" {
		t.Fatalf("expected StaticSecretForUser to be called once for org/stripe/user-1, got %v", secrets.calls)
	}
}
