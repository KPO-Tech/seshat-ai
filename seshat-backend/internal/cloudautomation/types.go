// Package cloudautomation makes seshat-backend a real device client of
// seshat-server's automation control plane (register/heartbeat/claim/
// start/heartbeat/complete/fail — see helps/seshat-architecture-target.md).
// Job management (create/edit/pause/delete/trigger) happens exclusively in
// seshat-console; this package only ever executes what it's assigned.
package cloudautomation

import (
	"context"
	"time"
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
}

// Device mirrors seshat-server's Device schema — only the fields this
// package actually uses.
type Device struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

// registerDeviceParams/registerDeviceResult mirror seshat-server's
// automation.RegisterDeviceParams/RegisterDeviceResult (POST /api/v1/devices)
// — the self-service, user-session-authenticated registration call, distinct
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
	ID     string `json:"id"`
	JobID  string `json:"job_id"`
	Status string `json:"status"`
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
