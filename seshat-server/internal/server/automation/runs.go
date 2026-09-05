package automation

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

const (
	RunStatusQueued    = "queued"
	RunStatusClaimed   = "claimed"
	RunStatusRunning   = "running"
	RunStatusCompleted = "completed"
	RunStatusFailed    = "failed"
	RunStatusCancelled = "cancelled"
)

// Run is one execution instance of a Job.
type Run struct {
	ID               string               `json:"id"`
	JobID            string               `json:"job_id"`
	OrganizationID   string               `json:"organization_id"`
	ExecutionTarget  string               `json:"execution_target"`
	AssignedDeviceID string               `json:"assigned_device_id,omitempty"`
	Status           string               `json:"status"`
	QueuedAt         time.Time            `json:"queued_at"`
	ClaimedAt        *time.Time           `json:"claimed_at,omitempty"`
	StartedAt        *time.Time           `json:"started_at,omitempty"`
	LastHeartbeatAt  *time.Time           `json:"last_heartbeat_at,omitempty"`
	FinishedAt       *time.Time           `json:"finished_at,omitempty"`
	ExitReason       string               `json:"exit_reason,omitempty"`
	OutputText       string               `json:"output_text,omitempty"`
	ErrorText        string               `json:"error_text,omitempty"`
	Metadata         map[string]string    `json:"metadata,omitempty"`
	NodeTrace        []sdb.NodeTraceEntry `json:"node_trace,omitempty"`
}

type ListRunsParams struct {
	OrganizationID string
	JobID          string
	Status         string
}

// RunJob is the minimal execution payload a device needs to actually run a
// job it has claimed — deliberately not the full Job (no organization_id,
// created_by_user_id, etc. — least exposure, and the device already knows
// which org/run this is from the claim response).
type RunJob struct {
	Name          string            `json:"name"`
	Prompt        string            `json:"prompt"`
	ModelOverride string            `json:"model_override,omitempty"`
	Configuration map[string]string `json:"configuration,omitempty"`
}

var runSortFields = map[string]sdb.SortField{
	"queued_at":        {Column: "queued_at"},
	"status":           {Column: "status"},
	"execution_target": {Column: "execution_target"},
}

var runSearchColumns = []string{
	"id", "job_id", "organization_id", "execution_target", "assigned_device_id",
	"status", "exit_reason", "output_text", "error_text", "metadata",
}

// ListRuns returns a page of runs visible to the caller. Consistent with
// every other list endpoint in this control plane: a caller lacking
// jobs.read/jobs.manage/organization.manage gets an empty list, not a 403.
// Runs are append-only execution history with no natural upper bound on how
// many a busy job accumulates, so — more than any other list in this
// control plane — this one must never load every matching row into memory
// just to hand back one page of it.
func (s *Service) ListRuns(ctx context.Context, principal *iam.Principal, params ListRunsParams, listParams sdb.ListParams) ([]Run, int64, error) {
	if principal == nil {
		return nil, 0, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	if organizationID == "" {
		return nil, 0, ErrInvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "jobs.read", "jobs.manage", "organization.manage"); err != nil {
			return []Run{}, 0, nil
		}
	}

	query := s.db.Gorm().WithContext(ctx).Model(&sdb.JobRun{}).Where("organization_id = ?", organizationID)
	if jobID := strings.TrimSpace(params.JobID); jobID != "" {
		query = query.Where("job_id = ?", jobID)
	}
	if status := strings.TrimSpace(params.Status); status != "" {
		query = query.Where("status = ?", status)
	}

	sortField, err := sdb.ResolveSortField(runSortFields, listParams.Sort)
	if err != nil {
		return nil, 0, ErrInvalidInput(err.Error())
	}
	query = sdb.ApplySearch(query, listParams.Search, runSearchColumns...)
	query = sdb.ApplySort(query, sortField, listParams.Order)

	records, total, err := sdb.Page[sdb.JobRun](query, listParams.Limit, listParams.Offset)
	if err != nil {
		return nil, 0, err
	}
	runs := make([]Run, 0, len(records))
	for _, record := range records {
		runs = append(runs, toRun(record))
	}
	return runs, total, nil
}

// GetRun resolves one run. Requires jobs.read, jobs.manage or organization.manage.
func (s *Service) GetRun(ctx context.Context, principal *iam.Principal, runID string) (*Run, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	runID = strings.TrimSpace(runID)
	if runID == "" {
		return nil, ErrInvalidInput("run_id is required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	var record sdb.JobRun
	if err := tx.First(&record, "id = ?", runID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("run not found")
		}
		return nil, err
	}
	if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "jobs.read", "jobs.manage", "organization.manage"); err != nil {
		return nil, err
	}
	run := toRun(record)
	return &run, nil
}

// CancelRun stops a run that hasn't finished yet. Requires jobs.manage or
// organization.manage.
func (s *Service) CancelRun(ctx context.Context, principal *iam.Principal, runID string) (*Run, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	runID = strings.TrimSpace(runID)
	if runID == "" {
		return nil, ErrInvalidInput("run_id is required")
	}
	var run *Run
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.JobRun
		if err := tx.First(&record, "id = ?", runID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("run not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "jobs.manage", "organization.manage"); err != nil {
			return err
		}
		if isTerminalRunStatus(record.Status) {
			return ErrConflict("run has already finished")
		}
		expectedStatus := record.Status
		now := time.Now().UTC()
		record.Status = RunStatusCancelled
		record.FinishedAt = &now
		record.ExitReason = "cancelled"
		result := tx.Model(&sdb.JobRun{}).
			Where("id = ? AND status = ?", record.ID, expectedStatus).
			Updates(map[string]any{"status": record.Status, "finished_at": record.FinishedAt, "exit_reason": record.ExitReason})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return ErrConflict("run is not in the expected state")
		}
		if err := reflectRunOutcomeOnJob(tx, record); err != nil {
			return err
		}
		if err := s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "run.cancelled", "run", record.ID, map[string]string{"job_id": record.JobID}); err != nil {
			return err
		}
		converted := toRun(record)
		run = &converted
		return nil
	})
	return run, err
}

// ─── Device claim protocol ─────────────────────────────────────────────────
// These methods authenticate via a device bearer token (resolved by the API
// layer's device auth middleware), not a user session.

// MyRuns returns every non-terminal run currently assigned to the calling
// device (queued, claimed or running) — this is the state-reconciliation
// call a local backend makes on startup/reconnect: "what does the cloud
// think I still owe it?" A crash mid-run leaves a run claimed/running until
// either the device reports back or the scheduler reaps it as stale (see
// Scheduler.reapStaleRuns); this lets the device notice and react on its own
// terms first, without waiting for the reaper's timeout.
func (s *Service) MyRuns(ctx context.Context, deviceToken string) ([]Run, error) {
	device, err := s.resolveDeviceByToken(ctx, deviceToken)
	if err != nil {
		return nil, err
	}
	var records []sdb.JobRun
	err = s.db.Gorm().WithContext(ctx).
		Where("assigned_device_id = ? AND status IN ?", device.ID, []string{RunStatusQueued, RunStatusClaimed, RunStatusRunning}).
		Order("queued_at asc").
		Find(&records).Error
	if err != nil {
		return nil, err
	}
	runs := make([]Run, 0, len(records))
	for _, record := range records {
		runs = append(runs, toRun(record))
	}
	return runs, nil
}

// ClaimRun hands the oldest queued run assigned to this device, if any. A
// nil, nil result means there is currently nothing to claim — normal during
// polling, not an error.
func (s *Service) ClaimRun(ctx context.Context, deviceToken string) (*Run, error) {
	device, err := s.resolveDeviceByToken(ctx, deviceToken)
	if err != nil {
		return nil, err
	}

	var run *Run
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		for {
			var record sdb.JobRun
			err := tx.Where("assigned_device_id = ? AND status = ?", device.ID, RunStatusQueued).
				Order("queued_at asc").
				First(&record).Error
			if err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return nil
				}
				return err
			}
			now := time.Now().UTC()
			record.Status = RunStatusClaimed
			record.ClaimedAt = &now
			result := tx.Model(&sdb.JobRun{}).
				Where("id = ? AND assigned_device_id = ? AND status = ?", record.ID, device.ID, RunStatusQueued).
				Updates(map[string]any{"status": record.Status, "claimed_at": record.ClaimedAt})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				continue
			}
			converted := toRun(record)
			run = &converted
			return nil
		}
	})
	return run, err
}

// GetRunJob returns the execution payload (prompt/model/configuration) for a
// run the calling device currently holds. Deliberately scoped by run, not by
// a bare job id: the device must already have claimed this specific run
// (status claimed/running, assigned to it) before it can read what to
// execute — the same "this device currently owns this run" check every
// other device/run endpoint already applies, just for a read instead of a
// state transition. There is no broader device-accessible job-read route;
// this is intentional (least exposure — a device sees only jobs it's
// actively executing, never the org's full job list).
func (s *Service) GetRunJob(ctx context.Context, deviceToken, runID string) (*RunJob, error) {
	device, err := s.resolveDeviceByToken(ctx, deviceToken)
	if err != nil {
		return nil, err
	}
	runID = strings.TrimSpace(runID)
	if runID == "" {
		return nil, ErrInvalidInput("run_id is required")
	}

	tx := s.db.Gorm().WithContext(ctx)
	var run sdb.JobRun
	if err := tx.First(&run, "id = ?", runID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("run not found")
		}
		return nil, err
	}
	if run.AssignedDeviceID != device.ID {
		return nil, ErrForbidden("run is not assigned to this device")
	}
	switch run.Status {
	case RunStatusClaimed, RunStatusRunning:
		// only these two states mean the device is actively meant to execute it
	default:
		return nil, ErrConflict("run must be claimed or running to read its job")
	}

	var job sdb.ScheduledJob
	if err := tx.First(&job, "id = ?", run.JobID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("job not found")
		}
		return nil, err
	}
	return &RunJob{
		Name:          job.Name,
		Prompt:        job.Prompt,
		ModelOverride: job.ModelOverride,
		Configuration: job.Configuration,
	}, nil
}

// StartRun confirms the device has begun executing a claimed run.
func (s *Service) StartRun(ctx context.Context, deviceToken, runID string) (*Run, error) {
	return s.transitionDeviceRun(ctx, deviceToken, runID, RunStatusClaimed, func(record *sdb.JobRun, now time.Time) {
		record.Status = RunStatusRunning
		record.StartedAt = &now
	})
}

// HeartbeatRun records that a running run is still alive.
func (s *Service) HeartbeatRun(ctx context.Context, deviceToken, runID string) (*Run, error) {
	return s.transitionDeviceRun(ctx, deviceToken, runID, RunStatusRunning, func(record *sdb.JobRun, now time.Time) {
		record.LastHeartbeatAt = &now
	})
}

// CompleteRun records a successful run outcome.
func (s *Service) CompleteRun(ctx context.Context, deviceToken, runID, outputText string) (*Run, error) {
	return s.finishDeviceRun(ctx, deviceToken, runID, RunStatusCompleted, outputText, "")
}

// FailRun records a failed run outcome.
func (s *Service) FailRun(ctx context.Context, deviceToken, runID, errorText string) (*Run, error) {
	return s.finishDeviceRun(ctx, deviceToken, runID, RunStatusFailed, "", errorText)
}

// transitionDeviceRun applies a device-authenticated in-flight state change
// (start/heartbeat), verifying the run belongs to the calling device and is
// in the expected prior state.
func (s *Service) transitionDeviceRun(ctx context.Context, deviceToken, runID, requiredStatus string, apply func(record *sdb.JobRun, now time.Time)) (*Run, error) {
	device, err := s.resolveDeviceByToken(ctx, deviceToken)
	if err != nil {
		return nil, err
	}
	runID = strings.TrimSpace(runID)
	if runID == "" {
		return nil, ErrInvalidInput("run_id is required")
	}

	var run *Run
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.JobRun
		if err := tx.First(&record, "id = ?", runID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("run not found")
			}
			return err
		}
		if record.AssignedDeviceID != device.ID {
			return ErrForbidden("run is not assigned to this device")
		}
		if record.Status != requiredStatus {
			return ErrConflict("run is not in the expected state")
		}
		apply(&record, time.Now().UTC())
		updates := map[string]any{"status": record.Status}
		if record.StartedAt != nil {
			updates["started_at"] = record.StartedAt
		}
		if record.LastHeartbeatAt != nil {
			updates["last_heartbeat_at"] = record.LastHeartbeatAt
		}
		result := tx.Model(&sdb.JobRun{}).
			Where("id = ? AND assigned_device_id = ? AND status = ?", record.ID, device.ID, requiredStatus).
			Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return ErrConflict("run is not in the expected state")
		}
		converted := toRun(record)
		run = &converted
		return nil
	})
	return run, err
}

// finishDeviceRun applies a terminal device-authenticated outcome
// (complete/fail) and reflects it onto the parent job.
func (s *Service) finishDeviceRun(ctx context.Context, deviceToken, runID, status, outputText, errorText string) (*Run, error) {
	device, err := s.resolveDeviceByToken(ctx, deviceToken)
	if err != nil {
		return nil, err
	}
	runID = strings.TrimSpace(runID)
	if runID == "" {
		return nil, ErrInvalidInput("run_id is required")
	}

	var run *Run
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.JobRun
		if err := tx.First(&record, "id = ?", runID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("run not found")
			}
			return err
		}
		if record.AssignedDeviceID != device.ID {
			return ErrForbidden("run is not assigned to this device")
		}
		switch record.Status {
		case RunStatusClaimed, RunStatusRunning:
			// These are the only in-flight states a device may resolve.
		case RunStatusCompleted, RunStatusFailed, RunStatusCancelled:
			return ErrConflict("run has already finished")
		default:
			return ErrConflict("run must be claimed or running before it can be finished")
		}
		expectedStatus := record.Status
		now := time.Now().UTC()
		record.Status = status
		record.FinishedAt = &now
		record.OutputText = outputText
		record.ErrorText = errorText
		record.ExitReason = ""
		if errorText != "" {
			record.ExitReason = errorText
		}
		result := tx.Model(&sdb.JobRun{}).
			Where("id = ? AND assigned_device_id = ? AND status = ?", record.ID, device.ID, expectedStatus).
			Updates(map[string]any{"status": record.Status, "finished_at": record.FinishedAt, "output_text": record.OutputText, "error_text": record.ErrorText, "exit_reason": record.ExitReason})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return ErrConflict("run is not in the expected state")
		}
		if err := reflectRunOutcomeOnJob(tx, record); err != nil {
			return err
		}
		converted := toRun(record)
		run = &converted
		return nil
	})
	return run, err
}

func isTerminalRunStatus(status string) bool {
	switch status {
	case RunStatusCompleted, RunStatusFailed, RunStatusCancelled:
		return true
	default:
		return false
	}
}

// queueRunForJob creates a new run for a due job and reflects the fact that
// a run was just queued onto the job's last-run bookkeeping. Device-targeted
// runs stay queued for the assigned device to claim; cloud-targeted runs
// stay queued for the scheduler's own executeQueuedCloudRuns pass to pick
// up (see cloud_execution.go) — never executed synchronously here, since an
// LLM call is slow and this runs inside a DB transaction.
//
// payload is JSON-encoded external data to merge into the graph's seed
// input under a "webhook" key (see cloud_execution.go) — empty for every
// caller except the webhook trigger handler, which passes the incoming
// request's body/headers/query.
func queueRunForJob(tx *gorm.DB, job sdb.ScheduledJob, now time.Time, payload string) (sdb.JobRun, error) {
	if job.ExecutionTarget == ExecutionTargetDevice {
		if err := validateTargetDevice(tx, job.OrganizationID, job.TargetDeviceID); err != nil {
			return sdb.JobRun{}, err
		}
	}
	runIDValue, err := newID("run")
	if err != nil {
		return sdb.JobRun{}, err
	}
	run := sdb.JobRun{
		ID:               runIDValue,
		JobID:            job.ID,
		OrganizationID:   job.OrganizationID,
		ExecutionTarget:  job.ExecutionTarget,
		AssignedDeviceID: job.TargetDeviceID,
		Status:           RunStatusQueued,
		QueuedAt:         now,
		TriggerPayload:   payload,
	}
	if err := tx.Create(&run).Error; err != nil {
		return sdb.JobRun{}, err
	}

	job.LastRunAt = &now
	job.LastRunStatus = run.Status
	job.UpdatedAt = now
	if err := tx.Save(&job).Error; err != nil {
		return sdb.JobRun{}, err
	}
	return run, nil
}

// reflectRunOutcomeOnJob updates the parent job's last-run bookkeeping once
// a run reaches a terminal state via the device protocol or cancellation
// (the cloud-stub path in queueRunForJob already sets this at queue time).
func reflectRunOutcomeOnJob(tx *gorm.DB, run sdb.JobRun) error {
	var job sdb.ScheduledJob
	if err := tx.First(&job, "id = ?", run.JobID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	job.LastRunStatus = run.Status
	if run.FinishedAt != nil {
		job.LastRunAt = run.FinishedAt
	}
	job.UpdatedAt = time.Now().UTC()
	return tx.Save(&job).Error
}

func toRun(record sdb.JobRun) Run {
	return Run{
		ID:               record.ID,
		JobID:            record.JobID,
		OrganizationID:   record.OrganizationID,
		ExecutionTarget:  record.ExecutionTarget,
		AssignedDeviceID: record.AssignedDeviceID,
		Status:           record.Status,
		QueuedAt:         record.QueuedAt,
		ClaimedAt:        record.ClaimedAt,
		StartedAt:        record.StartedAt,
		LastHeartbeatAt:  record.LastHeartbeatAt,
		FinishedAt:       record.FinishedAt,
		ExitReason:       record.ExitReason,
		OutputText:       record.OutputText,
		ErrorText:        record.ErrorText,
		Metadata:         record.Metadata,
		NodeTrace:        record.NodeTrace,
	}
}
