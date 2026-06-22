package api

import (
	"net/http"
	"path"
	"strings"

	"github.com/EngineerProjects/seshat-ai/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/internal/scheduler"
)

// ─── DTOs ─────────────────────────────────────────────────────────────────────

type scheduledJobResponse struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	CronExpr     string  `json:"cron_expr"`
	AgentSlug    string  `json:"agent_slug,omitempty"`
	Prompt       string  `json:"prompt"`
	SessionTitle string  `json:"session_title,omitempty"`
	Enabled      bool    `json:"enabled"`
	LastRunAt    *string `json:"last_run_at,omitempty"`
	NextRunAt    string  `json:"next_run_at"`
	LastStatus   string  `json:"last_status"`
	LastError    string  `json:"last_error,omitempty"`
	CreatedAt    string  `json:"created_at"`
	UpdatedAt    string  `json:"updated_at"`
}

func jobToResponse(j scheduler.Job) scheduledJobResponse {
	r := scheduledJobResponse{
		ID:           j.ID,
		Name:         j.Name,
		CronExpr:     j.CronExpr,
		AgentSlug:    j.AgentSlug,
		Prompt:       j.Prompt,
		SessionTitle: j.SessionTitle,
		Enabled:      j.Enabled,
		NextRunAt:    j.NextRunAt.Format("2006-01-02T15:04:05Z07:00"),
		LastStatus:   j.LastStatus,
		LastError:    j.LastError,
		CreatedAt:    j.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:    j.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	if j.LastRunAt != nil {
		s := j.LastRunAt.Format("2006-01-02T15:04:05Z07:00")
		r.LastRunAt = &s
	}
	return r
}

// ─── handleSchedulerJobs — GET /api/v1/scheduler/jobs, POST /api/v1/scheduler/jobs ──

func (a *App) handleSchedulerJobs(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		a.handleSchedulerJobsList(w, r)
	case http.MethodPost:
		a.handleSchedulerJobsCreate(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *App) handleSchedulerJobsList(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	jobs, err := a.backend.Scheduler.List(r.Context(), principal.User.ID)
	if err != nil {
		writeJSONError(w, bkerrStatus(err), err.Error())
		return
	}
	out := make([]scheduledJobResponse, 0, len(jobs))
	for _, j := range jobs {
		out = append(out, jobToResponse(j))
	}
	writeJSON(w, http.StatusOK, map[string]any{"jobs": out, "count": len(out)})
}

func (a *App) handleSchedulerJobsCreate(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	var body struct {
		Name         string `json:"name"`
		CronExpr     string `json:"cron_expr"`
		AgentSlug    string `json:"agent_slug"`
		Prompt       string `json:"prompt"`
		SessionTitle string `json:"session_title"`
		Enabled      *bool  `json:"enabled"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}
	job, err := a.backend.Scheduler.Create(r.Context(), principal.User.ID, scheduler.CreateParams{
		Name:         body.Name,
		CronExpr:     body.CronExpr,
		AgentSlug:    body.AgentSlug,
		Prompt:       body.Prompt,
		SessionTitle: body.SessionTitle,
		Enabled:      enabled,
	})
	if err != nil {
		writeJSONError(w, bkerrStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, jobToResponse(*job))
}

// ─── handleSchedulerJobByID — /api/v1/scheduler/jobs/:id and /api/v1/scheduler/jobs/:id/run ──

func (a *App) handleSchedulerJobByID(w http.ResponseWriter, r *http.Request) {
	// Strip prefix: /scheduler/jobs/
	trimmed := strings.TrimPrefix(r.URL.Path, "/scheduler/jobs/")
	trimmed = strings.Trim(trimmed, "/")
	parts := strings.SplitN(trimmed, "/", 2)
	id := path.Base(parts[0])

	if id == "" || id == "." {
		writeJSONError(w, http.StatusBadRequest, "job ID is required")
		return
	}

	// Sub-action: .../run
	if len(parts) == 2 && parts[1] == "run" {
		a.handleSchedulerJobRun(w, r, id)
		return
	}

	switch r.Method {
	case http.MethodGet:
		a.handleSchedulerJobGet(w, r, id)
	case http.MethodPut:
		a.handleSchedulerJobUpdate(w, r, id)
	case http.MethodDelete:
		a.handleSchedulerJobDelete(w, r, id)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *App) handleSchedulerJobGet(w http.ResponseWriter, r *http.Request, id string) {
	principal, _ := authPrincipalFromContext(r.Context())
	job, err := a.backend.Scheduler.Get(r.Context(), principal.User.ID, id)
	if err != nil {
		writeJSONError(w, bkerrStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, jobToResponse(*job))
}

func (a *App) handleSchedulerJobUpdate(w http.ResponseWriter, r *http.Request, id string) {
	principal, _ := authPrincipalFromContext(r.Context())
	var body struct {
		Name         *string `json:"name"`
		CronExpr     *string `json:"cron_expr"`
		AgentSlug    *string `json:"agent_slug"`
		Prompt       *string `json:"prompt"`
		SessionTitle *string `json:"session_title"`
		Enabled      *bool   `json:"enabled"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	job, err := a.backend.Scheduler.Update(r.Context(), principal.User.ID, id, scheduler.UpdateParams{
		Name:         body.Name,
		CronExpr:     body.CronExpr,
		AgentSlug:    body.AgentSlug,
		Prompt:       body.Prompt,
		SessionTitle: body.SessionTitle,
		Enabled:      body.Enabled,
	})
	if err != nil {
		writeJSONError(w, bkerrStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, jobToResponse(*job))
}

func (a *App) handleSchedulerJobDelete(w http.ResponseWriter, r *http.Request, id string) {
	principal, _ := authPrincipalFromContext(r.Context())
	if err := a.backend.Scheduler.Delete(r.Context(), principal.User.ID, id); err != nil {
		writeJSONError(w, bkerrStatus(err), err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/scheduler/jobs/:id/run — manual immediate trigger.
// Runs the job in the background and returns immediately.
func (a *App) handleSchedulerJobRun(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	job, err := a.backend.Scheduler.Get(r.Context(), principal.User.ID, id)
	if err != nil {
		writeJSONError(w, bkerrStatus(err), err.Error())
		return
	}
	if a.schedulerWorker != nil {
		a.schedulerWorker.TriggerNow(*job)
	}
	writeJSON(w, http.StatusAccepted, map[string]any{
		"id":      job.ID,
		"message": "job queued for immediate execution",
	})
}

// bkerrStatus maps bkerr error kinds to HTTP status codes.
func bkerrStatus(err error) int {
	switch bkerr.KindOf(err) {
	case bkerr.ErrorKindNotFound:
		return http.StatusNotFound
	case bkerr.ErrorKindForbidden:
		return http.StatusForbidden
	case bkerr.ErrorKindInvalidInput:
		return http.StatusBadRequest
	case bkerr.ErrorKindUnavailable:
		return http.StatusServiceUnavailable
	default:
		return http.StatusInternalServerError
	}
}
