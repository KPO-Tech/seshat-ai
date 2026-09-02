package automation

import (
	"context"
	"errors"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
	sdktypes "github.com/KPO-Tech/seshat/pkg/types"
	"github.com/KPO-Tech/seshat/pkg/workflow"
)

type fakeSecretResolver struct {
	calledOrg, calledRef string
	value                string
	err                  error
}

func (f *fakeSecretResolver) ResolveDataflowSecret(_ context.Context, organizationID, name string) (string, error) {
	f.calledOrg, f.calledRef = organizationID, name
	return f.value, f.err
}

func TestSetSecretResolverWiresItIn(t *testing.T) {
	env := newTestEnv(t)
	if env.automation.secrets != nil {
		t.Fatal("expected a fresh Service to have no secret resolver until SetSecretResolver is called")
	}
	fake := &fakeSecretResolver{}
	env.automation.SetSecretResolver(fake)
	if env.automation.secrets == nil {
		t.Fatal("expected SetSecretResolver to set the resolver")
	}
}

func TestSetNodeRegistryWiresItIn(t *testing.T) {
	env := newTestEnv(t)
	if env.automation.nodeRegistry != nil {
		t.Fatal("expected a fresh Service to have no node registry until SetNodeRegistry is called")
	}
	registry := dataflow.NewRegistry()
	env.automation.SetNodeRegistry(registry)
	if env.automation.nodeRegistry == nil {
		t.Fatal("expected SetNodeRegistry to set the registry")
	}
}

func TestOrgScopedSecretResolverBindsOrganization(t *testing.T) {
	fake := &fakeSecretResolver{value: "resolved-value"}
	resolver := orgScopedSecretResolver{resolver: fake, organizationID: "org-123"}
	got, err := resolver.Resolve(context.Background(), "my-ref")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if got != "resolved-value" {
		t.Fatalf("expected resolved-value, got %q", got)
	}
	if fake.calledOrg != "org-123" || fake.calledRef != "my-ref" {
		t.Fatalf("expected org-123/my-ref, got %q/%q", fake.calledOrg, fake.calledRef)
	}
}

func TestOrgScopedSecretResolverPropagatesError(t *testing.T) {
	fake := &fakeSecretResolver{err: errors.New("boom")}
	resolver := orgScopedSecretResolver{resolver: fake, organizationID: "org-123"}
	if _, err := resolver.Resolve(context.Background(), "ref"); err == nil {
		t.Fatal("expected error to propagate")
	}
}

func TestLastAssistantTextExtractsTrailingAssistantMessage(t *testing.T) {
	messages := []sdktypes.Message{
		{Role: sdktypes.RoleUser, Content: []sdktypes.ContentBlock{sdktypes.TextContent{Text: "ignored"}}},
		{Role: sdktypes.RoleAssistant, Content: []sdktypes.ContentBlock{sdktypes.TextContent{Text: "last"}}},
	}
	if got := lastAssistantText(messages); got != "last" {
		t.Fatalf("expected %q, got %q", "last", got)
	}
}

func TestJobWorkflowRunGraphFailsClearlyWithoutRegistry(t *testing.T) {
	wf := &jobWorkflow{
		id:    "job-1",
		graph: &dataflow.Definition{Name: "g", Nodes: []dataflow.Node{{ID: "a", Type: "noop"}}},
	}
	err := wf.runGraph(context.Background(), nil)
	if err == nil {
		t.Fatal("expected error when registry is nil")
	}
}

func TestDataflowSubworkflowRunnerExecutesNodes(t *testing.T) {
	// A nil *sdk.Session is fine here because dataflowSubworkflowRunner never
	// calls SubmitMessage until Run's ExecutorFunc actually fires for a
	// node — this test only exercises workflow.Validate's early rejection
	// of an empty definition, not a real session call.
	runner := dataflowSubworkflowRunner{session: nil}
	_, err := runner.Run(context.Background(), workflow.Definition{Name: "empty"})
	if err == nil {
		t.Fatal("expected workflow.Run to reject a definition with no nodes before touching the session")
	}
}
