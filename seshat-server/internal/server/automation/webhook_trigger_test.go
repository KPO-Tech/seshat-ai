package automation

import (
	"context"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

func graphWithWebhookTrigger(method string) *dataflow.Definition {
	params := map[string]any{}
	if method != "" {
		params["method"] = method
	}
	return &dataflow.Definition{
		Name: "webhook graph",
		Nodes: []dataflow.Node{
			{ID: "trigger", Type: "webhook_trigger", Parameters: params, Connections: map[string][]string{"main": {"step"}}},
			{ID: "step", Type: "http_request", Parameters: map[string]any{"url": "https://example.com", "method": "GET"}},
		},
	}
}

func graphWithBothTriggers() *dataflow.Definition {
	return &dataflow.Definition{
		Name: "both triggers",
		Nodes: []dataflow.Node{
			{ID: "schedule", Type: "schedule_trigger", Parameters: map[string]any{"mode": TriggerTypeInterval, "intervalSeconds": float64(60)}},
			{ID: "webhook", Type: "webhook_trigger", Parameters: map[string]any{"method": "POST"}},
			{ID: "step", Type: "http_request", Parameters: map[string]any{"url": "https://example.com", "method": "GET"}},
		},
	}
}

func TestWebhookTriggerFromGraphDefaultsMethodToPost(t *testing.T) {
	trig, ok, err := webhookTriggerFromGraph(*graphWithWebhookTrigger(""))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok || trig.Method != "POST" {
		t.Fatalf("unexpected extracted trigger: %+v ok=%v", trig, ok)
	}
}

func TestWebhookTriggerFromGraphExplicitMethod(t *testing.T) {
	trig, ok, err := webhookTriggerFromGraph(*graphWithWebhookTrigger("get"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok || trig.Method != "GET" {
		t.Fatalf("unexpected extracted trigger: %+v ok=%v", trig, ok)
	}
}

func TestWebhookTriggerFromGraphRejectsUnknownMethod(t *testing.T) {
	if _, _, err := webhookTriggerFromGraph(*graphWithWebhookTrigger("TRACE")); err == nil {
		t.Fatal("expected an error for an unsupported method")
	}
}

func TestWebhookTriggerFromGraphNoTriggerNode(t *testing.T) {
	_, ok, err := webhookTriggerFromGraph(*validTestGraph())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Fatal("expected ok=false for a graph with no webhook_trigger node")
	}
}

// TestCreateJobWithOnlyWebhookTriggerNeedsNoLegacyFields is the case
// normalizeJobTrigger's webhook bypass exists for: a graph whose only
// trigger is a webhook_trigger node must validate on its own, with no
// cron/interval/run_at required and no schedule_trigger node present.
func TestCreateJobWithOnlyWebhookTriggerNeedsNoLegacyFields(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Webhook only",
		ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Graph: graphWithWebhookTrigger("POST"),
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	if job.TriggerType != "" {
		t.Fatalf("expected an empty trigger_type for a purely event-driven job, got %q", job.TriggerType)
	}
	if job.NextRunAt != nil {
		t.Fatalf("expected no next_run_at for a webhook-only job, got %v", job.NextRunAt)
	}
	if job.WebhookMethod != "POST" {
		t.Fatalf("expected webhook_method POST, got %q", job.WebhookMethod)
	}
	if job.WebhookToken == "" {
		t.Fatal("expected a webhook_token to be generated")
	}
}

func TestCreateJobWithBothScheduleAndWebhookTriggersKeepsBoth(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Both triggers",
		ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Graph: graphWithBothTriggers(),
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	if job.TriggerType != TriggerTypeInterval || job.IntervalSeconds != 60 {
		t.Fatalf("expected the schedule_trigger's config preserved, got type=%q interval=%d", job.TriggerType, job.IntervalSeconds)
	}
	if job.WebhookToken == "" || job.WebhookMethod != "POST" {
		t.Fatalf("expected the webhook_trigger's config also preserved, got token=%q method=%q", job.WebhookToken, job.WebhookMethod)
	}
}

func TestUpdateJobKeepsWebhookTokenStableAcrossEdits(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Stable token",
		ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Graph: graphWithWebhookTrigger("POST"),
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	firstToken := job.WebhookToken

	updated, err := env.automation.UpdateJob(context.Background(), env.adminPrincipal, job.ID, UpdateJobParams{
		Name: "Stable token renamed", ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Graph: graphWithWebhookTrigger("POST"),
	})
	if err != nil {
		t.Fatalf("update job: %v", err)
	}
	if updated.WebhookToken != firstToken {
		t.Fatalf("expected the webhook token to stay stable across an edit, got %q then %q", firstToken, updated.WebhookToken)
	}

	cleared, err := env.automation.UpdateJob(context.Background(), env.adminPrincipal, job.ID, UpdateJobParams{
		Name: "Trigger removed", TriggerType: TriggerTypeInterval, IntervalSeconds: 300,
		ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Graph: validTestGraph(),
	})
	if err != nil {
		t.Fatalf("update job (remove webhook trigger): %v", err)
	}
	if cleared.WebhookToken != "" {
		t.Fatalf("expected the webhook token to be revoked once the webhook_trigger node is removed, got %q", cleared.WebhookToken)
	}
}

func TestTriggerJobByWebhookQueuesARunWithThePayload(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Webhook run",
		ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Graph: graphWithWebhookTrigger("POST"),
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	run, err := env.automation.TriggerJobByWebhook(context.Background(), job.WebhookToken, "POST", `{"body":{"foo":"bar"}}`)
	if err != nil {
		t.Fatalf("trigger job by webhook: %v", err)
	}
	if run.Status != RunStatusQueued {
		t.Fatalf("expected the run to be queued for async execution, got status %s", run.Status)
	}
}

func TestTriggerJobByWebhookRejectsWrongMethod(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Wrong method",
		ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Graph: graphWithWebhookTrigger("POST"),
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	if _, err := env.automation.TriggerJobByWebhook(context.Background(), job.WebhookToken, "GET", ""); err == nil {
		t.Fatal("expected an error for a method that doesn't match the configured one")
	}
}

func TestTriggerJobByWebhookRejectsUnknownToken(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.automation.TriggerJobByWebhook(context.Background(), "does-not-exist", "POST", ""); err == nil {
		t.Fatal("expected an error for an unknown token")
	}
}

func TestTriggerJobByWebhookRejectsPausedJob(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Paused",
		ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Graph: graphWithWebhookTrigger("POST"),
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	if _, err := env.automation.SetJobPaused(context.Background(), env.adminPrincipal, job.ID, true); err != nil {
		t.Fatalf("pause job: %v", err)
	}
	if _, err := env.automation.TriggerJobByWebhook(context.Background(), job.WebhookToken, "POST", ""); err == nil {
		t.Fatal("expected an error for a paused job's webhook")
	}
}
