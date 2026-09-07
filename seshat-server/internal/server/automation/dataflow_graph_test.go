package automation

import (
	"context"
	"errors"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
	dataflowexpr "github.com/KPO-Tech/seshat/pkg/dataflow/expr"
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

// capturingNode records the input it was called with, so a test can assert
// on what runGraph seeded a graph's starting nodes with.
type capturingNode struct {
	dataflow.Base
	gotInput []dataflow.Item
}

func (n *capturingNode) Execute(_ context.Context, _ *dataflow.Runtime, input []dataflow.Item, _ map[string]any) (dataflow.Output, error) {
	n.gotInput = input
	return dataflow.Main(nil), nil
}

func TestJobWorkflowRunGraphSeedsJobOwnerAndOrganization(t *testing.T) {
	node := &capturingNode{Base: dataflow.NewBase(dataflow.NodeDescription{Type: "capture"})}
	registry := dataflow.NewRegistry()
	registry.Register("capture", node)

	wf := &jobWorkflow{
		id:           "job-1",
		organization: "org-1",
		ownerID:      "user-1",
		registry:     registry,
		graph:        &dataflow.Definition{Name: "g", Nodes: []dataflow.Node{{ID: "a", Type: "capture"}}},
	}
	if err := wf.runGraph(context.Background(), nil); err != nil {
		t.Fatalf("runGraph: %v", err)
	}
	if len(node.gotInput) != 1 {
		t.Fatalf("expected the starting node to receive one seeded item, got %d", len(node.gotInput))
	}
	got := node.gotInput[0]
	if got["job_id"] != "job-1" || got["owner_id"] != "user-1" || got["organization_id"] != "org-1" {
		t.Fatalf("expected job_id/owner_id/organization_id to be seeded, got %+v", got)
	}
}

// resolvingNode captures what ResolveParam("value") resolves its "value"
// parameter to, for a test proving runGraph actually threads Runtime.Vars
// (Tier 3.2) through to real expression resolution - not just wired to a
// field nothing reads.
type resolvingNode struct {
	dataflow.Base
	got any
}

func (n *resolvingNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	var item dataflow.Item
	if len(input) > 0 {
		item = input[0]
	}
	resolved, err := dataflow.ResolveParam(ctx, rt, params, "value", item, 0)
	if err != nil {
		return dataflow.Output{}, err
	}
	n.got = resolved
	return dataflow.Main(nil), nil
}

// TestJobWorkflowRunGraphResolvesVarsForRealExpressions is the real-run
// counterpart to expression_preview_test.go's TestPreviewExpressionResolves
// RealVarsForTheGivenOrganization - proves a graph job's own $vars.NAME
// resolves to the organization's actual configured value during a real
// dataflow.Run, not just in the editor's preview. No provider/session
// needed: this graph has no agent/subworkflow node, so runGraph's own
// nil-session tolerance (see TestJobWorkflowRunGraphSeedsJobOwnerAndOrganization)
// applies here too.
func TestJobWorkflowRunGraphResolvesVarsForRealExpressions(t *testing.T) {
	node := &resolvingNode{Base: dataflow.NewBase(dataflow.NodeDescription{Type: "resolve"})}
	registry := dataflow.NewRegistry()
	registry.Register("resolve", node)

	wf := &jobWorkflow{
		id:           "job-1",
		organization: "org-1",
		registry:     registry,
		variables:    fakeVariableResolver{"API_BASE": "https://api.example.com"},
		exprEval:     dataflowexpr.NewPool(1),
		graph: &dataflow.Definition{Name: "g", Nodes: []dataflow.Node{
			{ID: "a", Type: "resolve", Parameters: map[string]any{"value": "=$vars.API_BASE"}},
		}},
	}
	if err := wf.runGraph(context.Background(), nil); err != nil {
		t.Fatalf("runGraph: %v", err)
	}
	if node.got != "https://api.example.com" {
		t.Fatalf("expected $vars.API_BASE to resolve to the real configured value, got %#v", node.got)
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
