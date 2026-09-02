package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/automation"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// Job management proxies seshat-server's /api/v1/jobs* API using the
// caller's own session token, exactly like seshat-console does — seshat-
// server enforces the same jobs.manage/jobs.read permission check
// regardless of which client calls it, so a plain org member without that
// permission gets an empty list (reads) or a 403 (writes), same as in
// seshat-console.

func (a *App) jobsClientForRequest(w http.ResponseWriter, r *http.Request) (*cloudautomation.JobsClient, string, string, bool) {
	if a.connectedServerURL == "" {
		writeJSONError(w, http.StatusBadRequest, "this device is not connected to an organization server")
		return nil, "", "", false
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return nil, "", "", false
	}
	return cloudautomation.NewJobsClient(a.connectedServerURL), principal.AuthSession.ID, principal.OrganizationID(), true
}

// handleAutomationJobs — GET/POST /api/v1/automation/jobs
func (a *App) handleAutomationJobs(w http.ResponseWriter, r *http.Request) {
	client, token, organizationID, ok := a.jobsClientForRequest(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		jobs, err := client.ListJobs(r.Context(), token, organizationID)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"jobs": jobs, "count": len(jobs)})
	case http.MethodPost:
		var params cloudautomation.JobParams
		if !decodeJSONBody(w, r, &params) {
			return
		}
		job, err := client.CreateJob(r.Context(), token, organizationID, params)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusCreated, job)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAutomationJobDispatch — GET/PUT/DELETE /api/v1/automation/jobs/{id}
// and POST .../pause, .../resume, .../run, GET .../runs.
func (a *App) handleAutomationJobDispatch(w http.ResponseWriter, r *http.Request) {
	client, token, _, ok := a.jobsClientForRequest(w, r)
	if !ok {
		return
	}

	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/automation/jobs/"), "/")
	if rest == "" {
		writeJSONError(w, http.StatusNotFound, "job id is required")
		return
	}
	jobID, action, _ := strings.Cut(rest, "/")

	switch {
	case action == "" && r.Method == http.MethodGet:
		job, err := client.GetJob(r.Context(), token, jobID)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, job)

	case action == "" && r.Method == http.MethodPut:
		var params cloudautomation.JobParams
		if !decodeJSONBody(w, r, &params) {
			return
		}
		job, err := client.UpdateJob(r.Context(), token, jobID, params)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, job)

	case action == "" && r.Method == http.MethodDelete:
		if err := client.DeleteJob(r.Context(), token, jobID); err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		w.WriteHeader(http.StatusNoContent)

	case action == "pause" && r.Method == http.MethodPost:
		job, err := client.SetJobPaused(r.Context(), token, jobID, true)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, job)

	case action == "resume" && r.Method == http.MethodPost:
		job, err := client.SetJobPaused(r.Context(), token, jobID, false)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, job)

	case action == "run" && r.Method == http.MethodPost:
		run, err := client.TriggerJobNow(r.Context(), token, jobID)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusCreated, run)

	case action == "runs" && r.Method == http.MethodGet:
		runs, err := client.ListJobRuns(r.Context(), token, jobID)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"runs": runs, "count": len(runs)})

	default:
		writeJSONError(w, http.StatusNotFound, "not found")
	}
}

// handleAutomationDevices — GET /api/v1/automation/devices, the organization's
// registered devices, for populating a job's target_device_id picker.
func (a *App) handleAutomationDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	client, token, organizationID, ok := a.jobsClientForRequest(w, r)
	if !ok {
		return
	}
	devices, err := client.ListOrgDevices(r.Context(), token, organizationID)
	if err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"devices": devices, "count": len(devices)})
}

// handleAutomationDataflowNodeTypes — GET /api/v1/automation/dataflow/node-types,
// proxying seshat-server's own node-type catalog so a graph-building UI in
// seshat-ui can populate its node palette without seshat-ui needing to know
// seshat-server's API shape directly - same proxy-with-the-caller's-own-
// token reasoning as every other handler in this file.
func (a *App) handleAutomationDataflowNodeTypes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	client, token, _, ok := a.jobsClientForRequest(w, r)
	if !ok {
		return
	}
	nodeTypes, err := client.ListNodeTypes(r.Context(), token)
	if err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"node_types": nodeTypes, "count": len(nodeTypes)})
}
