// Package cloudautomation makes seshat-backend a real device client of
// seshat-server's automation control plane (register/heartbeat/claim/
// start/heartbeat/complete/fail — see helps/seshat-architecture-target.md).
// It also proxies job management (create/edit/pause/delete/trigger) via
// JobsClient, using the caller's own session token exactly like
// seshat-console does; seshat-server enforces the same jobs.manage/
// jobs.read permission check regardless of which client calls it.
package cloudautomation

import (
	"context"
	"time"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// Connection is this machine's pairing to one seshat-server organization,
// established by pasting a one-time device token generated in
// seshat-console → Devices → Register device. Persisted encrypted via the
// existing generic credential store (internal/db/credentials.go) — no
// dedicated table needed for a singleton value.
type Connection struct {
	ServerURL         string
	DeviceID          string
	DeviceName        string
	DeviceToken       string
	ConnectedByUserID string
	ConnectedAt       time.Time
}

// Status is the redacted view returned to seshat-ui — never includes DeviceToken.
type Status struct {
	Connected         bool       `json:"connected"`
	ServerURL         string     `json:"server_url,omitempty"`
	DeviceID          string     `json:"device_id,omitempty"`
	DeviceName        string     `json:"device_name,omitempty"`
	ConnectedByUserID string     `json:"connected_by_user_id,omitempty"`
	ConnectedAt       *time.Time `json:"connected_at,omitempty"`
	// Policies is this device's last-synced desktop policy bundle (see
	// PolicyStore) - empty (never nil) when never connected/never synced.
	// A code missing from this map must be treated as allowed, same as
	// PolicyStore.Allowed's own fail-open default.
	Policies map[string]bool `json:"policies"`
	// MinAppVersion/AppVersionOutdated are this device's last-synced
	// app-version-restriction status (see VersionStore) - nil/false when
	// never connected/never synced or when the organization has no minimum
	// configured. Warning-only: nothing reads this to block anything, it
	// exists purely for the UI to show a banner.
	MinAppVersion      *string `json:"min_app_version,omitempty"`
	AppVersionOutdated bool    `json:"app_version_outdated"`
}

// Device mirrors seshat-server's Device schema — only the fields this
// package actually uses. Policies is only ever populated on the response to
// POST /device/heartbeat (seshat-server's automation.HeartbeatResult) - it's
// nil/empty on responses from the other endpoints this package calls that
// also happen to return a Device (register), since desktop policies were
// only ever intended to be delivered on that one already-periodic call.
// MinAppVersion/AppVersionOutdated mirror seshat-server's
// automation.HeartbeatResult fields - like Policies, only ever populated on
// a heartbeat response (see version_store.go for why this is tracked
// separately from desktop policies).
type Device struct {
	ID                 string          `json:"id"`
	Name               string          `json:"name"`
	Platform           string          `json:"platform,omitempty"`
	Status             string          `json:"status"`
	LastSeenAt         string          `json:"last_seen_at,omitempty"`
	Policies           map[string]bool `json:"policies,omitempty"`
	MinAppVersion      *string         `json:"min_app_version,omitempty"`
	AppVersionOutdated bool            `json:"app_version_outdated,omitempty"`
}

// registerDeviceParams/registerDeviceResult mirror seshat-server's
// automation.RegisterDeviceParams/RegisterDeviceResult (POST /api/v1/devices),
// the self-service, user-session-authenticated registration call, distinct
// from the device-token-authenticated protocol Client wraps.
type registerDeviceParams struct {
	OrganizationID string `json:"organization_id"`
	Name           string `json:"name"`
	Platform       string `json:"platform"`
	AppVersion     string `json:"app_version"`
}

type registerDeviceResult struct {
	Device Device `json:"device"`
	Token  string `json:"token"`
}

// Run mirrors seshat-server's Run schema — tracking fields only, never the
// execution payload (see RunJob).
type Run struct {
	ID               string `json:"id"`
	JobID            string `json:"job_id"`
	OrganizationID   string `json:"organization_id,omitempty"`
	ExecutionTarget  string `json:"execution_target,omitempty"`
	AssignedDeviceID string `json:"assigned_device_id,omitempty"`
	Status           string `json:"status"`
	QueuedAt         string `json:"queued_at,omitempty"`
	ClaimedAt        string `json:"claimed_at,omitempty"`
	StartedAt        string `json:"started_at,omitempty"`
	LastHeartbeatAt  string `json:"last_heartbeat_at,omitempty"`
	FinishedAt       string `json:"finished_at,omitempty"`
	ExitReason       string `json:"exit_reason,omitempty"`
	OutputText       string `json:"output_text,omitempty"`
	ErrorText        string `json:"error_text,omitempty"`
}

// Job mirrors seshat-server's Job schema (automation.Job / openapi Job).
type Job struct {
	ID              string               `json:"id"`
	OrganizationID  string               `json:"organization_id"`
	CreatedByUserID string               `json:"created_by_user_id,omitempty"`
	Name            string               `json:"name"`
	Description     string               `json:"description,omitempty"`
	Status          string               `json:"status"`
	TriggerType     string               `json:"trigger_type"`
	CronExpr        string               `json:"cron_expr,omitempty"`
	IntervalSeconds int                  `json:"interval_seconds,omitempty"`
	RunAt           string               `json:"run_at,omitempty"`
	NextRunAt       string               `json:"next_run_at,omitempty"`
	LastRunAt       string               `json:"last_run_at,omitempty"`
	LastRunStatus   string               `json:"last_run_status,omitempty"`
	ExecutionTarget string               `json:"execution_target"`
	TargetDeviceID  string               `json:"target_device_id,omitempty"`
	Prompt          string               `json:"prompt,omitempty"`
	Graph           *dataflow.Definition `json:"graph,omitempty"`
	ModelOverride   string               `json:"model_override,omitempty"`
	Configuration   map[string]string    `json:"configuration,omitempty"`
	CreatedAt       string               `json:"created_at,omitempty"`
	UpdatedAt       string               `json:"updated_at,omitempty"`
}

// JobParams is the shared request shape for creating and updating a job,
// mirroring seshat-server's CreateJobParams/UpdateJobParams (they differ
// only by OrganizationID, which CreateJob takes as a separate argument here
// since a job can never move between organizations).
type JobParams struct {
	Name            string               `json:"name"`
	Description     string               `json:"description,omitempty"`
	TriggerType     string               `json:"trigger_type"`
	CronExpr        string               `json:"cron_expr,omitempty"`
	IntervalSeconds int                  `json:"interval_seconds,omitempty"`
	RunAt           string               `json:"run_at,omitempty"`
	ExecutionTarget string               `json:"execution_target"`
	TargetDeviceID  string               `json:"target_device_id,omitempty"`
	Prompt          string               `json:"prompt,omitempty"`
	Graph           *dataflow.Definition `json:"graph,omitempty"`
	ModelOverride   string               `json:"model_override,omitempty"`
	Configuration   map[string]string    `json:"configuration,omitempty"`
}

// RunJob is the execution payload for a run this device has claimed —
// fetched separately via GET /device/runs/{id}/job (see seshat-server's
// automation.RunJob).
type RunJob struct {
	Name          string            `json:"name"`
	Prompt        string            `json:"prompt"`
	ModelOverride string            `json:"model_override,omitempty"`
	Configuration map[string]string `json:"configuration,omitempty"`
}

// JobExecutor runs one claimed job's prompt locally and returns its output
// text. Implemented in bootstrap, which captures the query engine and
// settings service — this package never imports query/settings directly,
// mirroring the same decoupling the old internal/scheduler used.
type JobExecutor func(ctx context.Context, params ExecParams) (string, error)

// ExecParams are the inputs passed to the JobExecutor for one run.
type ExecParams struct {
	// UserID is whichever local seshat-backend user performed the Connect —
	// the job executes with their locally-configured LLM credentials, tools
	// and context, exactly like an interactive chat turn would.
	UserID string
	Prompt string
	// ModelOverride is "provider:model" (from the job's model_override), or
	// empty — the executor falls back to the user's default local provider.
	ModelOverride string
}
