package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/automation"
)

func createJobWithWebhookTriggerOverHTTP(t *testing.T, handler http.Handler, token, orgID string) automation.Job {
	t.Helper()
	body, _ := json.Marshal(map[string]any{
		"organization_id":  orgID,
		"name":             "Webhook job",
		"execution_target": "cloud",
		"model_override":   "anthropic:claude-sonnet-5",
		"graph": map[string]any{
			"name": "webhook graph",
			"nodes": []map[string]any{
				{"id": "trigger", "type": "webhook_trigger", "parameters": map[string]any{"method": "POST"},
					"connections": map[string]any{"main": []string{"step"}}},
				{"id": "step", "type": "http_request", "parameters": map[string]any{"url": "https://example.com", "method": "GET"}},
			},
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/jobs", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected job creation success, got %d: %s", rec.Code, rec.Body.String())
	}
	var job automation.Job
	if err := json.NewDecoder(rec.Body).Decode(&job); err != nil {
		t.Fatalf("decode created job: %v", err)
	}
	if job.WebhookToken == "" {
		t.Fatal("expected the created job to carry a webhook_token")
	}
	return job
}

func TestWebhookTriggerEndToEndOverHTTP(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)
	job := createJobWithWebhookTriggerOverHTTP(t, handler, token, orgID)

	// The webhook call itself carries no Authorization header at all - that
	// is the point (see routes.go's comment on this route).
	callReq := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/"+job.WebhookToken, bytes.NewReader([]byte(`{"foo":"bar"}`)))
	callReq.Header.Set("Content-Type", "application/json")
	callRec := httptest.NewRecorder()
	handler.ServeHTTP(callRec, callReq)
	if callRec.Code != http.StatusAccepted {
		t.Fatalf("expected 202 Accepted, got %d: %s", callRec.Code, callRec.Body.String())
	}
	var result map[string]string
	if err := json.NewDecoder(callRec.Body).Decode(&result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if result["run_id"] == "" {
		t.Fatal("expected a run_id in the response")
	}
}

func TestWebhookTriggerUnknownTokenReturns404(t *testing.T) {
	handler, _, _, _, _ := newTestServerRouter(t)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/does-not-exist", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestWebhookTriggerWrongMethodReturns405(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)
	job := createJobWithWebhookTriggerOverHTTP(t, handler, token, orgID)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/webhooks/"+job.WebhookToken, nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestWebhookTriggerPausedJobReturns409(t *testing.T) {
	handler, backend, token, orgID, principal := newTestServerRouter(t)
	job := createJobWithWebhookTriggerOverHTTP(t, handler, token, orgID)
	if _, err := backend.Automation.SetJobPaused(t.Context(), principal, job.ID, true); err != nil {
		t.Fatalf("pause job: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/"+job.WebhookToken, nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", rec.Code, rec.Body.String())
	}
}
