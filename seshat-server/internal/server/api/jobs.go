package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/automation"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

type createJobRequest struct {
	OrganizationID  string            `json:"organization_id"`
	Name            string            `json:"name"`
	Description     string            `json:"description"`
	TriggerType     string            `json:"trigger_type"`
	CronExpr        string            `json:"cron_expr"`
	IntervalSeconds int               `json:"interval_seconds"`
	RunAt           *time.Time        `json:"run_at"`
	ExecutionTarget string            `json:"execution_target"`
	TargetDeviceID  string            `json:"target_device_id"`
	Prompt          string            `json:"prompt"`
	ModelOverride   string            `json:"model_override"`
	Configuration   map[string]string `json:"configuration"`
}

type updateJobRequest struct {
	Name            string            `json:"name"`
	Description     string            `json:"description"`
	TriggerType     string            `json:"trigger_type"`
	CronExpr        string            `json:"cron_expr"`
	IntervalSeconds int               `json:"interval_seconds"`
	RunAt           *time.Time        `json:"run_at"`
	ExecutionTarget string            `json:"execution_target"`
	TargetDeviceID  string            `json:"target_device_id"`
	Prompt          string            `json:"prompt"`
	ModelOverride   string            `json:"model_override"`
	Configuration   map[string]string `json:"configuration"`
}

func (app *App) handleJobs(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		jobs, err := app.backend.Automation.ListJobs(r.Context(), principal, organizationID)
		if err != nil {
			writeAutomationError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"jobs": jobs, "count": len(jobs)})
	case http.MethodPost:
		var req createJobRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		job, err := app.backend.Automation.CreateJob(r.Context(), principal, automation.CreateJobParams{
			OrganizationID:  req.OrganizationID,
			Name:            req.Name,
			Description:     req.Description,
			TriggerType:     req.TriggerType,
			CronExpr:        req.CronExpr,
			IntervalSeconds: req.IntervalSeconds,
			RunAt:           req.RunAt,
			ExecutionTarget: req.ExecutionTarget,
			TargetDeviceID:  req.TargetDeviceID,
			Prompt:          req.Prompt,
			ModelOverride:   req.ModelOverride,
			Configuration:   req.Configuration,
		})
		if err != nil {
			writeAutomationError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, job)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleJobByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	jobID := strings.TrimSpace(r.PathValue("jobID"))
	if jobID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing job id")
		return
	}

	switch r.Method {
	case http.MethodGet:
		job, err := app.backend.Automation.GetJob(r.Context(), principal, jobID)
		if err != nil {
			writeAutomationError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, job)
	case http.MethodPut:
		var req updateJobRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		job, err := app.backend.Automation.UpdateJob(r.Context(), principal, jobID, automation.UpdateJobParams{
			Name:            req.Name,
			Description:     req.Description,
			TriggerType:     req.TriggerType,
			CronExpr:        req.CronExpr,
			IntervalSeconds: req.IntervalSeconds,
			RunAt:           req.RunAt,
			ExecutionTarget: req.ExecutionTarget,
			TargetDeviceID:  req.TargetDeviceID,
			Prompt:          req.Prompt,
			ModelOverride:   req.ModelOverride,
			Configuration:   req.Configuration,
		})
		if err != nil {
			writeAutomationError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, job)
	case http.MethodDelete:
		if err := app.backend.Automation.DeleteJob(r.Context(), principal, jobID); err != nil {
			writeAutomationError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleJobPause(w http.ResponseWriter, r *http.Request) {
	app.setJobPaused(w, r, true)
}

func (app *App) handleJobResume(w http.ResponseWriter, r *http.Request) {
	app.setJobPaused(w, r, false)
}

func (app *App) setJobPaused(w http.ResponseWriter, r *http.Request, paused bool) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	jobID := strings.TrimSpace(r.PathValue("jobID"))
	if jobID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing job id")
		return
	}
	job, err := app.backend.Automation.SetJobPaused(r.Context(), principal, jobID, paused)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (app *App) handleJobRunNow(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	jobID := strings.TrimSpace(r.PathValue("jobID"))
	if jobID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing job id")
		return
	}
	run, err := app.backend.Automation.TriggerJobNow(r.Context(), principal, jobID)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, run)
}

func (app *App) handleJobRuns(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	jobID := strings.TrimSpace(r.PathValue("jobID"))
	if jobID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing job id")
		return
	}
	query, err := parseListQuery(r, "queued_at", "desc")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	// The job's own organization scopes the run listing, so callers don't
	// need to pass organization_id redundantly on a job-scoped endpoint.
	job, err := app.backend.Automation.GetJob(r.Context(), principal, jobID)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	runs, total, err := app.backend.Automation.ListRuns(r.Context(), principal, automation.ListRunsParams{
		OrganizationID: job.OrganizationID,
		JobID:          jobID,
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
