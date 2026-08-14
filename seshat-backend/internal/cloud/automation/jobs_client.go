package cloudautomation

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// JobsClient talks to seshat-server's job-management API
// (/api/v1/jobs*, /api/v1/devices), authenticated with the caller's own
// session token rather than a device token — the same way seshat-console
// does. Distinct from Client, which wraps the device-token-authenticated
// execution protocol a paired machine uses to claim and run its own work.
type JobsClient struct {
	serverURL  string
	httpClient *http.Client
}

func NewJobsClient(serverURL string) *JobsClient {
	return &JobsClient{
		serverURL:  strings.TrimRight(strings.TrimSpace(serverURL), "/"),
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *JobsClient) do(ctx context.Context, method, path, token string, body, out any) (int, error) {
	return cloudhttp.Do(ctx, c.httpClient, method, c.serverURL+path, token, body, out)
}

// ListJobs returns every job the caller can see in organizationID (an empty
// list, not an error, when the caller lacks jobs.read/jobs.manage).
func (c *JobsClient) ListJobs(ctx context.Context, token, organizationID string) ([]Job, error) {
	q := url.Values{"organization_id": {organizationID}}
	var payload struct {
		Jobs []Job `json:"jobs"`
	}
	if _, err := c.do(ctx, http.MethodGet, "/api/v1/jobs?"+q.Encode(), token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.Jobs, nil
}

func (c *JobsClient) GetJob(ctx context.Context, token, jobID string) (*Job, error) {
	var job Job
	if _, err := c.do(ctx, http.MethodGet, "/api/v1/jobs/"+jobID, token, nil, &job); err != nil {
		return nil, err
	}
	return &job, nil
}

func (c *JobsClient) CreateJob(ctx context.Context, token, organizationID string, params JobParams) (*Job, error) {
	body := struct {
		JobParams
		OrganizationID string `json:"organization_id"`
	}{JobParams: params, OrganizationID: organizationID}
	var job Job
	if _, err := c.do(ctx, http.MethodPost, "/api/v1/jobs", token, body, &job); err != nil {
		return nil, err
	}
	return &job, nil
}

func (c *JobsClient) UpdateJob(ctx context.Context, token, jobID string, params JobParams) (*Job, error) {
	var job Job
	if _, err := c.do(ctx, http.MethodPut, "/api/v1/jobs/"+jobID, token, params, &job); err != nil {
		return nil, err
	}
	return &job, nil
}

func (c *JobsClient) DeleteJob(ctx context.Context, token, jobID string) error {
	_, err := c.do(ctx, http.MethodDelete, "/api/v1/jobs/"+jobID, token, nil, nil)
	return err
}

// SetJobPaused pauses or resumes a job (POST .../pause or .../resume).
func (c *JobsClient) SetJobPaused(ctx context.Context, token, jobID string, paused bool) (*Job, error) {
	action := "resume"
	if paused {
		action = "pause"
	}
	var job Job
	if _, err := c.do(ctx, http.MethodPost, "/api/v1/jobs/"+jobID+"/"+action, token, nil, &job); err != nil {
		return nil, err
	}
	return &job, nil
}

// TriggerJobNow queues an out-of-band run for jobID, independent of its
// schedule.
func (c *JobsClient) TriggerJobNow(ctx context.Context, token, jobID string) (*Run, error) {
	var run Run
	if _, err := c.do(ctx, http.MethodPost, "/api/v1/jobs/"+jobID+"/run", token, nil, &run); err != nil {
		return nil, err
	}
	return &run, nil
}

func (c *JobsClient) ListJobRuns(ctx context.Context, token, jobID string) ([]Run, error) {
	var payload struct {
		Runs []Run `json:"runs"`
	}
	if _, err := c.do(ctx, http.MethodGet, "/api/v1/jobs/"+jobID+"/runs", token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.Runs, nil
}

// ListOrgDevices returns the organization's registered devices, for
// populating a job's target_device_id picker (an empty list, not an error,
// when the caller lacks devices.read/devices.manage).
func (c *JobsClient) ListOrgDevices(ctx context.Context, token, organizationID string) ([]Device, error) {
	q := url.Values{"organization_id": {organizationID}}
	var payload struct {
		Devices []Device `json:"devices"`
	}
	if _, err := c.do(ctx, http.MethodGet, "/api/v1/devices?"+q.Encode(), token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.Devices, nil
}
