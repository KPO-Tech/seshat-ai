package automation

import (
	"context"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

func validTestGraph() *dataflow.Definition {
	return &dataflow.Definition{Name: "poll gmail", Nodes: []dataflow.Node{{ID: "poll", Type: "gmail_new_messages"}}}
}

func TestCreateJobRequiresEitherPromptOrGraph(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Neither", TriggerType: TriggerTypeInterval,
		IntervalSeconds: 60, ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
	})
	if err == nil {
		t.Fatal("expected an error when neither prompt nor graph is set")
	}
}

func TestCreateJobRejectsBothPromptAndGraph(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Both", TriggerType: TriggerTypeInterval,
		IntervalSeconds: 60, ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Prompt: "do something", Graph: validTestGraph(),
	})
	if err == nil {
		t.Fatal("expected an error when both prompt and graph are set")
	}
}

func TestCreateJobRejectsInvalidGraph(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Invalid graph", TriggerType: TriggerTypeInterval,
		IntervalSeconds: 60, ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Graph: &dataflow.Definition{Name: "empty"},
	})
	if err == nil {
		t.Fatal("expected an error for a graph with no nodes")
	}
}

func TestCreateJobWithGraphPersistsAndRoundTrips(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Poll inbox", TriggerType: TriggerTypeInterval,
		IntervalSeconds: 300, ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Graph: validTestGraph(),
	})
	if err != nil {
		t.Fatalf("create job with graph: %v", err)
	}
	if job.Prompt != "" {
		t.Fatalf("expected empty prompt when graph is set, got %q", job.Prompt)
	}
	if job.Graph == nil || job.Graph.Name != "poll gmail" {
		t.Fatalf("expected the created job to echo back the graph, got %+v", job.Graph)
	}

	fetched, err := env.automation.GetJob(context.Background(), env.adminPrincipal, job.ID)
	if err != nil {
		t.Fatalf("get job: %v", err)
	}
	if fetched.Graph == nil || len(fetched.Graph.Nodes) != 1 || fetched.Graph.Nodes[0].Type != "gmail_new_messages" {
		t.Fatalf("expected GetJob to round-trip the persisted graph, got %+v", fetched.Graph)
	}
}

func TestUpdateJobCanSwitchFromPromptToGraph(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Starts as prompt", TriggerType: TriggerTypeInterval,
		IntervalSeconds: 300, ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Prompt: "Summarize inbox.",
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	updated, err := env.automation.UpdateJob(context.Background(), env.adminPrincipal, job.ID, UpdateJobParams{
		Name: job.Name, TriggerType: TriggerTypeInterval, IntervalSeconds: 300,
		ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Graph: validTestGraph(),
	})
	if err != nil {
		t.Fatalf("update job to graph: %v", err)
	}
	if updated.Prompt != "" {
		t.Fatalf("expected prompt cleared after switching to graph, got %q", updated.Prompt)
	}
	if updated.Graph == nil || updated.Graph.Name != "poll gmail" {
		t.Fatalf("expected the updated job to carry the new graph, got %+v", updated.Graph)
	}
}
