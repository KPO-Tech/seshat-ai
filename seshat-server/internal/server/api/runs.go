package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/automation"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func (app *App) handleRuns(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	query, err := parseListQuery(r, "queued_at", "desc")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	runs, total, err := app.backend.Automation.ListRuns(r.Context(), principal, automation.ListRunsParams{
		OrganizationID: strings.TrimSpace(r.URL.Query().Get("organization_id")),
		JobID:          strings.TrimSpace(r.URL.Query().Get("job_id")),
		Status:         strings.TrimSpace(r.URL.Query().Get("status")),
	}, sdb.ListParams{
		Search: query.Search,
		Sort:   query.Sort,
		Order:  query.Order,
		Limit:  query.Limit,
		Offset: query.Offset,
	})
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeListResponse(w, http.StatusOK, "runs", runs, query, int(total))
}

func (app *App) handleRunByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	runID := strings.TrimSpace(r.PathValue("runID"))
	if runID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing run id")
		return
	}
	run, err := app.backend.Automation.GetRun(r.Context(), principal, runID)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, run)
}

func (app *App) handleRunCancel(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	runID := strings.TrimSpace(r.PathValue("runID"))
	if runID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing run id")
		return
	}
	run, err := app.backend.Automation.CancelRun(r.Context(), principal, runID)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, run)
}

// ─── Device claim protocol ─────────────────────────────────────────────────
// Every handler below is device-authenticated (bearer device token from
// RegisterDevice), not a user session.

// handleDeviceMyRuns lets a device reconcile its state on startup/reconnect:
// every non-terminal run currently assigned to it, including ones it claimed
// before a crash and never got to report back on.
func (app *App) handleDeviceMyRuns(w http.ResponseWriter, r *http.Request) {
	token, err := bearerTokenFromRequest(r)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, err.Error())
		return
	}
	runs, err := app.backend.Automation.MyRuns(r.Context(), token)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"runs": runs, "count": len(runs)})
}

func (app *App) handleDeviceRunsClaim(w http.ResponseWriter, r *http.Request) {
	token, err := bearerTokenFromRequest(r)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, err.Error())
		return
	}
	run, err := app.backend.Automation.ClaimRun(r.Context(), token)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	if run == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeJSON(w, http.StatusOK, run)
}

// handleDeviceRunJob returns the execution payload (prompt/model/config) for
// a run the calling device currently holds — see Service.GetRunJob for the
// exact scoping rule.
func (app *App) handleDeviceRunJob(w http.ResponseWriter, r *http.Request) {
	token, err := bearerTokenFromRequest(r)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, err.Error())
		return
	}
	runID := strings.TrimSpace(r.PathValue("runID"))
	job, err := app.backend.Automation.GetRunJob(r.Context(), token, runID)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (app *App) handleDeviceRunStart(w http.ResponseWriter, r *http.Request) {
	token, err := bearerTokenFromRequest(r)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, err.Error())
		return
	}
	runID := strings.TrimSpace(r.PathValue("runID"))
	run, err := app.backend.Automation.StartRun(r.Context(), token, runID)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, run)
}

func (app *App) handleDeviceRunHeartbeat(w http.ResponseWriter, r *http.Request) {
	token, err := bearerTokenFromRequest(r)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, err.Error())
		return
	}
	runID := strings.TrimSpace(r.PathValue("runID"))
	run, err := app.backend.Automation.HeartbeatRun(r.Context(), token, runID)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, run)
}

type completeRunRequest struct {
	OutputText string `json:"output_text"`
}

func (app *App) handleDeviceRunComplete(w http.ResponseWriter, r *http.Request) {
	token, err := bearerTokenFromRequest(r)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, err.Error())
		return
	}
	runID := strings.TrimSpace(r.PathValue("runID"))
	var req completeRunRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	run, err := app.backend.Automation.CompleteRun(r.Context(), token, runID, req.OutputText)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, run)
}

type failRunRequest struct {
	ErrorText string `json:"error_text"`
}

func (app *App) handleDeviceRunFail(w http.ResponseWriter, r *http.Request) {
	token, err := bearerTokenFromRequest(r)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, err.Error())
		return
	}
	runID := strings.TrimSpace(r.PathValue("runID"))
	var req failRunRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	run, err := app.backend.Automation.FailRun(r.Context(), token, runID, req.ErrorText)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, run)
}
