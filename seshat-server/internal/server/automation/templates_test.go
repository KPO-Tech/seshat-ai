package automation

import (
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
	dataflowexpr "github.com/KPO-Tech/seshat/pkg/dataflow/expr"
	dataflownodes "github.com/KPO-Tech/seshat/pkg/dataflow/nodes"
	dataflowdatabase "github.com/KPO-Tech/seshat/pkg/dataflow/nodes/database"
)

// realNodeRegistry mirrors app.go's own registration exactly (RegisterBuiltins
// + dataflownodes.Register + dataflowdatabase.Register) - the same registry a
// deployed server actually builds, so a template that validates against it
// here is genuinely usable, not just superficially shaped like a Definition.
func realNodeRegistry() *dataflow.Registry {
	reg := dataflow.NewRegistry()
	dataflow.RegisterBuiltins(reg)
	dataflownodes.Register(reg, dataflowexpr.NewPool(2))
	dataflowdatabase.Register(reg)
	return reg
}

func TestListTemplatesReturnsAllBuiltInTemplates(t *testing.T) {
	env := newTestEnv(t)
	got := env.automation.ListTemplates()
	if len(got) != 4 {
		t.Fatalf("expected 4 built-in templates, got %d", len(got))
	}
	seen := map[string]bool{}
	for _, tpl := range got {
		if tpl.ID == "" || tpl.Name == "" || tpl.Description == "" || tpl.Category == "" {
			t.Fatalf("template %+v is missing required metadata", tpl)
		}
		if len(tpl.Definition.Nodes) == 0 {
			t.Fatalf("template %q has no nodes", tpl.ID)
		}
		if seen[tpl.ID] {
			t.Fatalf("duplicate template id %q", tpl.ID)
		}
		seen[tpl.ID] = true
	}
}

// TestBuiltInTemplatesValidateAgainstTheRealNodeRegistry is what keeps a
// template from silently drifting out of sync with real node schemas as the
// SDK evolves - every node type referenced by every template must actually
// be registered, and its own parameters must pass that node type's real
// ValidateParameters, exactly as a hand-built graph's would when saved.
func TestBuiltInTemplatesValidateAgainstTheRealNodeRegistry(t *testing.T) {
	reg := realNodeRegistry()
	for _, tpl := range templates {
		for _, node := range tpl.Definition.Nodes {
			executor, err := reg.Get(node.Type)
			if err != nil {
				t.Fatalf("template %q, node %q: %v", tpl.ID, node.ID, err)
			}
			if err := executor.ValidateParameters(node.Parameters); err != nil {
				t.Fatalf("template %q, node %q (%s): invalid parameters: %v", tpl.ID, node.ID, node.Type, err)
			}
		}
	}
}

// TestBuiltInTemplatesConnectionsReferenceRealNodeIDs guards against a typo
// in a Connections map pointing at a node id that doesn't exist in the same
// template - dataflow.Run would reject this at save/run time for a real
// job, so a template should never ship in that state either.
func TestBuiltInTemplatesConnectionsReferenceRealNodeIDs(t *testing.T) {
	for _, tpl := range templates {
		ids := map[string]bool{}
		for _, node := range tpl.Definition.Nodes {
			ids[node.ID] = true
		}
		for _, node := range tpl.Definition.Nodes {
			for port, targets := range node.Connections {
				for _, target := range targets {
					if !ids[target] {
						t.Fatalf("template %q, node %q, port %q: connects to unknown node id %q", tpl.ID, node.ID, port, target)
					}
				}
			}
		}
	}
}
