package automation

import (
	"context"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// echoExecutor is a minimal real dataflow.NodeExecutor for TestRunGraph
// tests - doubles its input's "n" field, so a test can assert real
// execution actually happened without needing any of the SDK's own
// built-in node types.
type echoExecutor struct{}

func (echoExecutor) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "echo", Name: "Echo"}
}
func (echoExecutor) ValidateParameters(map[string]any) error { return nil }
func (echoExecutor) Execute(_ context.Context, _ *dataflow.Runtime, input []dataflow.Item, _ map[string]any) (dataflow.Output, error) {
	out := make([]dataflow.Item, len(input))
	for i, item := range input {
		n, _ := item["n"].(float64)
		out[i] = dataflow.Item{"n": n * 2}
	}
	return dataflow.Main(out), nil
}

func testRunGraphDef() dataflow.Definition {
	return dataflow.Definition{Name: "test", Nodes: []dataflow.Node{{ID: "a", Type: "echo"}}}
}

func TestTestRunGraphRequiresPrincipal(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.automation.TestRunGraph(context.Background(), nil, env.orgID, testRunGraphDef(), nil)
	if err == nil {
		t.Fatal("expected an error for a nil principal")
	}
}

func TestTestRunGraphRequiresOrganizationID(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.automation.TestRunGraph(context.Background(), env.adminPrincipal, "", testRunGraphDef(), nil)
	if err == nil {
		t.Fatal("expected an error for an empty organization_id")
	}
}

func TestTestRunGraphRejectsAPrincipalWithoutOrgAccess(t *testing.T) {
	env := newTestEnv(t)
	reg := dataflow.NewRegistry()
	reg.Register("echo", echoExecutor{})
	env.automation.SetNodeRegistry(reg)

	otherOrgID := "org-not-mine"
	_, err := env.automation.TestRunGraph(context.Background(), env.adminPrincipal, otherOrgID, testRunGraphDef(), nil)
	if err == nil {
		t.Fatal("expected an error for an organization the principal has no access to")
	}
}

func TestTestRunGraphRequiresNodeRegistry(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.automation.TestRunGraph(context.Background(), env.adminPrincipal, env.orgID, testRunGraphDef(), nil)
	if err == nil {
		t.Fatal("expected an error when no node registry is configured")
	}
}

func TestTestRunGraphActuallyExecutesTheGraph(t *testing.T) {
	env := newTestEnv(t)
	reg := dataflow.NewRegistry()
	reg.Register("echo", echoExecutor{})
	env.automation.SetNodeRegistry(reg)

	result, err := env.automation.TestRunGraph(context.Background(), env.adminPrincipal, env.orgID, testRunGraphDef(), []map[string]any{{"n": float64(3)}})
	if err != nil {
		t.Fatalf("test run: %v", err)
	}
	if !result.Success {
		t.Fatalf("expected success, got %#v", result)
	}
	a := result.Results["a"]
	if len(a.Output) != 1 || a.Output[0]["n"] != float64(6) {
		t.Fatalf("expected the real executor to have doubled n to 6, got %#v", a.Output)
	}
}

func TestTestRunGraphDoesNotCreateAnyJobRun(t *testing.T) {
	env := newTestEnv(t)
	reg := dataflow.NewRegistry()
	reg.Register("echo", echoExecutor{})
	env.automation.SetNodeRegistry(reg)

	if _, err := env.automation.TestRunGraph(context.Background(), env.adminPrincipal, env.orgID, testRunGraphDef(), nil); err != nil {
		t.Fatalf("test run: %v", err)
	}
	jobs, err := env.automation.ListJobs(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list jobs: %v", err)
	}
	if len(jobs) != 0 {
		t.Fatalf("expected TestRunGraph to create no Job/JobRun rows at all, got %d jobs", len(jobs))
	}
}

func TestTestRunGraphSurfacesRealValidationErrors(t *testing.T) {
	env := newTestEnv(t)
	reg := dataflow.NewRegistry()
	reg.Register("echo", echoExecutor{})
	env.automation.SetNodeRegistry(reg)

	badDef := dataflow.Definition{Name: "bad", Nodes: []dataflow.Node{
		{ID: "a", Type: "echo", Connections: map[string][]string{"main": {"missing"}}},
	}}
	_, err := env.automation.TestRunGraph(context.Background(), env.adminPrincipal, env.orgID, badDef, nil)
	if err == nil {
		t.Fatal("expected an error for a graph connecting to an unknown node")
	}
}
