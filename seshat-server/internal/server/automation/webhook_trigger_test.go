package automation

import (
	"context"
	"testing"
	"time"

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

func graphWithWebhookTriggerMode(method, responseMode string) *dataflow.Definition {
	params := map[string]any{}
	if method != "" {
		params["method"] = method
	}
	if responseMode != "" {
		params["responseMode"] = responseMode
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

func TestWebhookTriggerFromGraphResponseModeDefaultsToImmediate(t *testing.T) {
	trig, ok, err := webhookTriggerFromGraph(*graphWithWebhookTriggerMode("POST", ""))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok || trig.ResponseMode != WebhookResponseModeImmediate {
		t.Fatalf("unexpected extracted trigger: %+v ok=%v", trig, ok)
	}
}

func TestWebhookTriggerFromGraphExplicitResponseMode(t *testing.T) {
	trig, ok, err := webhookTriggerFromGraph(*graphWithWebhookTriggerMode("POST", WebhookResponseModeWhenFinished))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok || trig.ResponseMode != WebhookResponseModeWhenFinished {
		t.Fatalf("unexpected extracted trigger: %+v ok=%v", trig, ok)
	}
}

func TestWebhookTriggerFromGraphRejectsUnknownResponseMode(t *testing.T) {
	if _, _, err := webhookTriggerFromGraph(*graphWithWebhookTriggerMode("POST", "streaming")); err == nil {
		t.Fatal("expected an error for an unsupported responseMode")
	}
}

func TestCreateJobRejectsWhenFinishedWithDeviceTarget(t *testing.T) {
	env := newTestEnv(t)
	device, err := env.automation.RegisterDevice(context.Background(), env.adminPrincipal, RegisterDeviceParams{OrganizationID: env.orgID, Name: "Worker"})
	if err != nil {
		t.Fatalf("register device: %v", err)
	}
	_, err = env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Bad combo",
		ExecutionTarget: ExecutionTargetDevice, TargetDeviceID: device.Device.ID,
		Graph: graphWithWebhookTriggerMode("POST", WebhookResponseModeWhenFinished),
	})
	if err == nil {
		t.Fatal(`expected an error for responseMode "whenFinished" with a device execution target`)
	}
}

// TestTriggerJobByWebhookWhenFinishedWaitsForCompletion proves the wait-for-
// completion path itself works, not just its timeout edge: this job has no
// ProviderSetting configured, so executeCloudRun fails fast (a few
// milliseconds, see cloud_execution_test.go's own use of this exact
// fixture) - with the default (55s) timeout, the call must still return the
// terminal "failed" state synchronously, not "queued".
func TestTriggerJobByWebhookWhenFinishedWaitsForCompletion(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Sync webhook",
		ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Graph: graphWithWebhookTriggerMode("POST", WebhookResponseModeWhenFinished),
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	run, err := env.automation.TriggerJobByWebhook(context.Background(), job.WebhookToken, "POST", "")
	if err != nil {
		t.Fatalf("trigger job by webhook: %v", err)
	}
	if run.Status != RunStatusFailed && run.Status != RunStatusCompleted {
		t.Fatalf(`expected a terminal status ("failed" here, no provider configured), got %q`, run.Status)
	}
}

// TestTriggerJobByWebhookWhenFinishedRespectsTimeout proves the timeout
// branch: with the wait bounded to ~0, the call must return promptly
// instead of blocking, whatever state the run happens to be in yet.
// TestCreateJobWebhookTriggerNoGraph is the graph-less counterpart of
// TestCreateJobWithOnlyWebhookTriggerNeedsNoLegacyFields: a Scheduling job
// (Prompt only, no Graph) requesting TriggerTypeWebhook directly must mint a
// token exactly like a webhook_trigger node would, without needing a graph
// at all.
func TestCreateJobWebhookTriggerNoGraph(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Webhook prompt job",
		ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Prompt:              "Summarize whatever arrived in the webhook payload.",
		TriggerType:         TriggerTypeWebhook,
		WebhookMethod:       "PUT",
		WebhookResponseMode: WebhookResponseModeWhenFinished,
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
	if job.WebhookToken == "" {
		t.Fatal("expected a webhook_token to be generated for a graph-less webhook trigger")
	}
	if job.WebhookMethod != "PUT" || job.WebhookResponseMode != WebhookResponseModeWhenFinished {
		t.Fatalf("expected the requested method/response mode preserved, got method=%q mode=%q", job.WebhookMethod, job.WebhookResponseMode)
	}
}

func TestCreateJobWebhookTriggerNoGraphRejectsInvalidMethod(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Bad method",
		ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Prompt: "Do something.", TriggerType: TriggerTypeWebhook, WebhookMethod: "TRACE",
	})
	if err == nil {
		t.Fatal("expected an error for an unsupported webhook method")
	}
}

// TestUpdateJobAddsAndRemovesWebhookTriggerNoGraph mirrors
// TestUpdateJobKeepsWebhookTokenStableAcrossEdits for the graph-less path:
// switching a Prompt-only job's trigger_type to/from "webhook" must mint/
// clear WebhookToken the same way editing a graph's webhook_trigger node
// does.
func TestUpdateJobAddsAndRemovesWebhookTriggerNoGraph(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Starts as cron",
		ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Prompt: "Do something.", TriggerType: TriggerTypeCron, CronExpr: "0 9 * * 1",
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	if job.WebhookToken != "" {
		t.Fatalf("expected no webhook token on a cron job, got %q", job.WebhookToken)
	}

	toWebhook, err := env.automation.UpdateJob(context.Background(), env.adminPrincipal, job.ID, UpdateJobParams{
		Name: "Now webhook", ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Prompt: "Do something.", TriggerType: TriggerTypeWebhook,
	})
	if err != nil {
		t.Fatalf("update job to webhook: %v", err)
	}
	if toWebhook.WebhookToken == "" {
		t.Fatal("expected a webhook token to be minted once switched to a webhook trigger")
	}
	firstToken := toWebhook.WebhookToken

	stillWebhook, err := env.automation.UpdateJob(context.Background(), env.adminPrincipal, job.ID, UpdateJobParams{
		Name: "Still webhook", ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Prompt: "Do something else.", TriggerType: TriggerTypeWebhook,
	})
	if err != nil {
		t.Fatalf("update job (still webhook): %v", err)
	}
	if stillWebhook.WebhookToken != firstToken {
		t.Fatalf("expected the webhook token to stay stable across an edit, got %q then %q", firstToken, stillWebhook.WebhookToken)
	}

	backToCron, err := env.automation.UpdateJob(context.Background(), env.adminPrincipal, job.ID, UpdateJobParams{
		Name: "Back to cron", ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Prompt: "Do something.", TriggerType: TriggerTypeCron, CronExpr: "0 9 * * 1",
	})
	if err != nil {
		t.Fatalf("update job back to cron: %v", err)
	}
	if backToCron.WebhookToken != "" {
		t.Fatalf("expected the webhook token to be revoked once the trigger is no longer webhook, got %q", backToCron.WebhookToken)
	}
}

// TestTriggerJobByWebhookQueuesARunWithPayloadForPromptOnlyJob is the
// graph-less counterpart of TestTriggerJobByWebhookQueuesARunWithThePayload -
// proves the dispatch path (token lookup, method check, run queuing) works
// end to end for a job with no Graph at all, not just the trigger-config
// plumbing covered above.
func TestTriggerJobByWebhookQueuesARunWithPayloadForPromptOnlyJob(t *testing.T) {
	env := newTestEnv(t)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Webhook prompt run",
		ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Prompt: "Summarize whatever arrived.", TriggerType: TriggerTypeWebhook,
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

func TestTriggerJobByWebhookWhenFinishedRespectsTimeout(t *testing.T) {
	env := newTestEnv(t)
	env.automation.SetWebhookSyncTimeout(1 * time.Nanosecond)
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID: env.orgID, Name: "Sync webhook timeout",
		ExecutionTarget: ExecutionTargetCloud, ModelOverride: "anthropic:claude-sonnet-5",
		Graph: graphWithWebhookTriggerMode("POST", WebhookResponseModeWhenFinished),
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	started := time.Now()
	if _, err := env.automation.TriggerJobByWebhook(context.Background(), job.WebhookToken, "POST", ""); err != nil {
		t.Fatalf("trigger job by webhook: %v", err)
	}
	if elapsed := time.Since(started); elapsed > 2*time.Second {
		t.Fatalf("expected the call to return promptly once the timeout elapsed, took %s", elapsed)
	}
}
