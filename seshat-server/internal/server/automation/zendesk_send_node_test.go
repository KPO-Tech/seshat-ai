package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// stubOAuthAppSubdomainResolver mirrors stubTokenResolver - a minimal
// OAuthAppSubdomainResolver double, org-level (not per-user).
type stubOAuthAppSubdomainResolver struct {
	subdomain string
	err       error
	calls     []string
}

func (r *stubOAuthAppSubdomainResolver) OAuthAppSubdomain(ctx context.Context, organizationID, kind string) (string, error) {
	r.calls = append(r.calls, organizationID+":"+kind)
	if r.err != nil {
		return "", r.err
	}
	return r.subdomain, nil
}

// zendeskTestNode wraps ZendeskCreateTicketNode's httpClient to point the
// literal "https://{subdomain}.zendesk.com" host this node always builds
// at a local httptest.Server - done via http.Client.Transport rather than
// an injectable baseURL field (ZendeskCreateTicketNode has none, since in
// production its host is entirely subdomain-derived, not a fixed field
// worth overriding).
func zendeskTestNode(t *testing.T, tokens ConnectorTokenResolver, subdomains OAuthAppSubdomainResolver, server *httptest.Server) *ZendeskCreateTicketNode {
	t.Helper()
	n := NewZendeskCreateTicketNode(tokens, subdomains)
	n.httpClient = &http.Client{Transport: rewriteHostTransport{target: server.URL}}
	return n
}

// rewriteHostTransport redirects every request to target's host/scheme,
// keeping the original path - lets a test point a hardcoded
// "https://X.zendesk.com/..." URL at a local httptest.Server.
// req.Clone preserves Body/ContentLength/GetBody correctly, unlike
// reconstructing a *http.Request from scratch with http.NewRequest (which
// can't recover ContentLength from an already-wrapped io.ReadCloser body).
type rewriteHostTransport struct{ target string }

func (t rewriteHostTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	target, err := url.Parse(t.target)
	if err != nil {
		return nil, err
	}
	req = req.Clone(req.Context())
	req.URL.Scheme = target.Scheme
	req.URL.Host = target.Host
	return http.DefaultTransport.RoundTrip(req)
}

// newFakeZendeskServer serves just enough of the Zendesk API for
// zendesk_create_ticket's tickets call to succeed.
func newFakeZendeskServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v2/tickets.json", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"ticket": map[string]any{"id": 99}})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestZendeskCreateTicketNodeExecuteRequiresJobContext(t *testing.T) {
	n := NewZendeskCreateTicketNode(&stubTokenResolver{}, &stubOAuthAppSubdomainResolver{})
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, nil, nil)
	if err == nil {
		t.Fatal("expected an error when input has no job context")
	}
}

func TestZendeskCreateTicketNodeExecuteRequiresConnectedAccount(t *testing.T) {
	env := newTestEnv(t)
	n := NewZendeskCreateTicketNode(&stubTokenResolver{}, &stubOAuthAppSubdomainResolver{subdomain: "acme"})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"subject": "hi", "comment": "body"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when the job owner has no connected Zendesk account")
	}
}

func TestZendeskCreateTicketNodeExecutePropagatesTokenResolverError(t *testing.T) {
	env := newTestEnv(t)
	n := NewZendeskCreateTicketNode(&stubTokenResolver{err: errors.New("boom")}, &stubOAuthAppSubdomainResolver{subdomain: "acme"})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"subject": "hi", "comment": "body"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected the token resolver's error to propagate")
	}
}

func TestZendeskCreateTicketNodeExecuteRequiresSubdomain(t *testing.T) {
	env := newTestEnv(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewZendeskCreateTicketNode(tokens, &stubOAuthAppSubdomainResolver{})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"subject": "hi", "comment": "body"}
	_, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err == nil {
		t.Fatal("expected an error when no zendesk oauth app (with a subdomain) is registered")
	}
}

func TestZendeskCreateTicketNodeExecuteRequiresParams(t *testing.T) {
	env := newTestEnv(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	n := NewZendeskCreateTicketNode(tokens, &stubOAuthAppSubdomainResolver{subdomain: "acme"})
	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	if _, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, map[string]any{}); err == nil {
		t.Fatal("expected an error when subject/comment are missing")
	}
}

func TestZendeskCreateTicketNodeExecuteCreatesAndReturnsTicketID(t *testing.T) {
	env := newTestEnv(t)
	server := newFakeZendeskServer(t)
	tokens := &stubTokenResolver{tokensByUser: map[string]string{"user-1": "fake-token"}}
	subdomains := &stubOAuthAppSubdomainResolver{subdomain: "acme"}
	n := zendeskTestNode(t, tokens, subdomains, server)

	input := []dataflow.Item{{"job_id": "job-1", "owner_id": "user-1", "organization_id": env.orgID}}
	params := map[string]any{"subject": "hi", "comment": "body", "requesterEmail": "a@example.com"}
	out, err := n.Execute(context.Background(), &dataflow.Runtime{}, input, params)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	items := out.Ports["main"]
	if len(items) != 1 || items[0]["ticket_id"] != 99 {
		t.Fatalf("unexpected output: %+v", items)
	}
	if len(subdomains.calls) != 1 || subdomains.calls[0] != env.orgID+":zendesk" {
		t.Fatalf("expected OAuthAppSubdomain to be called once for org/zendesk, got %v", subdomains.calls)
	}
}
