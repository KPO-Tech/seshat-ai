package automation

import (
	"context"
	"testing"
	"time"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

func graphWithScheduleTrigger(mode string, params map[string]any) *dataflow.Definition {
	p := map[string]any{"mode": mode}
	for k, v := range params {
		p[k] = v
	}
	return &dataflow.Definition{
		Name: "trigger graph",
		Nodes: []dataflow.Node{
			{ID: "trigger", Type: "schedule_trigger", Parameters: p, Connections: map[string][]string{"main": {"step"}}},
			{ID: "step", Type: "http_request", Parameters: map[string]any{"url": "https://example.com", "method": "GET"}},
		},
	}
}

func TestScheduleTriggerFromGraphCron(t *testing.T) {
	trig, ok, err := scheduleTriggerFromGraph(*graphWithScheduleTrigger(TriggerTypeCron, map[string]any{"cronExpr": "0 0 * * *"}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok {
		t.Fatal("expected a trigger to be found")
	}
	if trig.TriggerType != TriggerTypeCron || trig.CronExpr != "0 0 * * *" {
		t.Fatalf("unexpected extracted trigger: %+v", trig)
	}
}

func TestScheduleTriggerFromGraphInterval(t *testing.T) {
	trig, ok, err := scheduleTriggerFromGraph(*graphWithScheduleTrigger(TriggerTypeInterval, map[string]any{"intervalSeconds": float64(300)}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok || trig.TriggerType != TriggerTypeInterval || trig.IntervalSeconds != 300 {
		t.Fatalf("unexpected extracted trigger: %+v ok=%v", trig, ok)
	}
}

func TestScheduleTriggerFromGraphOnce(t *testing.T) {
	trig, ok, err := scheduleTriggerFromGraph(*graphWithScheduleTrigger(TriggerTypeOnce, map[string]any{"runAt": "2026-01-01T09:00:00Z"}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want, _ := time.Parse(time.RFC3339, "2026-01-01T09:00:00Z")
	if !ok || trig.TriggerType != TriggerTypeOnce || trig.RunAt == nil || !trig.RunAt.Equal(want) {
		t.Fatalf("unexpected extracted trigger: %+v ok=%v", trig, ok)
	}
}

func TestScheduleTriggerFromGraphMalformedParameters(t *testing.T) {
	cases := []*dataflow.Definition{
		graphWithScheduleTrigger(TriggerTypeCron, nil),                                      // missing cronExpr
		graphWithScheduleTrigger(TriggerTypeInterval, map[string]any{"intervalSeconds": 0}), // non-positive
		graphWithScheduleTrigger(TriggerTypeOnce, map[string]any{"runAt": "not a date"}),    // malformed
		graphWithScheduleTrigger("weekly", nil),                                             // unknown mode
	}
	for i, def := range cases {
		if _, _, err := scheduleTriggerFromGraph(*def); err == nil {
			t.Fatalf("case %d: expected an error, got none", i)
		}
	}
}

func TestScheduleTriggerFromGraphNoTriggerNode(t *testing.T) {
	_, ok, err := scheduleTriggerFromGraph(*validTestGraph())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Fatal("expected ok=false for a graph with no schedule_trigger node")
	}
}

func TestCreateJobWithScheduleTriggerNodeDerivesColumnsFromGraph(t *testing.T) {
	env := newTestEnv(t)
	// Deliberately wrong top-level trigger fields - the graph's own
	// schedule_trigger node must win, proving the override actually happens
	// rather than just tolerating absent fields.
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Graph-driven schedule", TriggerType: TriggerTypeOnce,
		ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Graph: graphWithScheduleTrigger(TriggerTypeInterval, map[string]any{"intervalSeconds": float64(120)}),
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	if job.TriggerType != TriggerTypeInterval || job.IntervalSeconds != 120 {
		t.Fatalf("expected trigger derived from the graph's schedule_trigger node, got type=%q interval=%d", job.TriggerType, job.IntervalSeconds)
	}
}

func TestCreateJobWithGraphButNoTriggerNodeFallsBackToInputFields(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "No trigger node yet", TriggerType: TriggerTypeInterval,
		IntervalSeconds: 300, ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Graph: validTestGraph(), // pre-existing graph shape, no schedule_trigger node
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	if job.TriggerType != TriggerTypeInterval || job.IntervalSeconds != 300 {
		t.Fatalf("expected the input trigger fields preserved (backward compat), got type=%q interval=%d", job.TriggerType, job.IntervalSeconds)
	}
}
