package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/automation"
)

// handleWebhookTrigger is the external-HTTP-call counterpart to
// handleJobRunNow — see routes.go's comment on this route for why it's
// unauthenticated. Any HTTP method reaches this handler (the mux pattern
// carries no verb); which methods are actually accepted is a per-job
// choice (ScheduledJob.WebhookMethod, from the graph's webhook_trigger
// node) enforced by automation.TriggerJobByWebhook itself, not here.
func (app *App) handleWebhookTrigger(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.PathValue("token"))
	if token == "" {
		writeJSONError(w, http.StatusNotFound, "webhook not found")
		return
	}

	payload, err := webhookPayloadJSON(r)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	run, err := app.backend.Automation.TriggerJobByWebhook(r.Context(), token, r.Method, payload)
	if err != nil {
		if errors.Is(err, automation.ErrWebhookMethodMismatch) {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		writeAutomationError(w, err)
		return
	}
	writeWebhookRunResult(w, run)
}

// writeWebhookRunResult maps whatever state TriggerJobByWebhook's run came
// back in to an HTTP response - it doesn't need to know which responseMode
// produced that state. "immediate" mode always returns queued (unchanged,
// 202). "whenFinished" mode returns whatever the run's actual status is
// once TriggerJobByWebhook stops waiting: completed/failed if it finished
// in time, or still running/queued if resolveWebhookSyncTimeout elapsed
// first - the caller gets a run_id to poll via GET .../runs either way.
func writeWebhookRunResult(w http.ResponseWriter, run *automation.Run) {
	switch run.Status {
	case automation.RunStatusCompleted:
		writeJSON(w, http.StatusOK, map[string]any{
			"run_id": run.ID, "status": run.Status,
			"output_text": run.OutputText, "node_trace": run.NodeTrace,
		})
	case automation.RunStatusFailed:
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"run_id": run.ID, "status": run.Status, "error": run.ErrorText,
		})
	case automation.RunStatusQueued:
		writeJSON(w, http.StatusAccepted, map[string]string{"run_id": run.ID, "status": run.Status})
	default:
		// running/claimed/cancelled - "whenFinished" timed out before the
		// run reached a terminal state (execution itself is unaffected, it
		// keeps going in the background).
		writeJSON(w, http.StatusGatewayTimeout, map[string]string{"run_id": run.ID, "status": run.Status})
	}
}

// webhookPayloadJSON captures the incoming request as
// {"body":...,"headers":...,"query":...} for automation.TriggerJobByWebhook
// to store as JobRun.TriggerPayload — merged into the triggered run's graph
// seed under a "webhook" key (see jobWorkflow.runGraph). body is parsed as
// JSON when Content-Type says so, otherwise kept as a raw string; headers
// and query params are flattened to their first value each, which is
// enough for the common case without pulling in multi-value semantics this
// pass doesn't need.
func webhookPayloadJSON(r *http.Request) (string, error) {
	defer r.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1 MiB, generous for a webhook body
	if err != nil {
		return "", errors.New("failed to read request body")
	}

	var body any
	if len(raw) > 0 && strings.Contains(r.Header.Get("Content-Type"), "json") {
		if err := json.Unmarshal(raw, &body); err != nil {
			body = string(raw) // not valid JSON despite the header - keep it raw rather than reject the call
		}
	} else if len(raw) > 0 {
		body = string(raw)
	}

	headers := map[string]string{}
	for name, values := range r.Header {
		if len(values) > 0 {
			headers[name] = values[0]
		}
	}
	query := map[string]string{}
	for name, values := range r.URL.Query() {
		if len(values) > 0 {
			query[name] = values[0]
		}
	}

	encoded, err := json.Marshal(map[string]any{"body": body, "headers": headers, "query": query})
	if err != nil {
		return "", errors.New("failed to encode webhook payload")
	}
	return string(encoded), nil
}
