package automation

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/KPO-Tech/seshat/pkg/automation"
	"github.com/KPO-Tech/seshat/pkg/dataflow"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

const (
	JobStatusActive = "active"
	JobStatusPaused = "paused"

	TriggerTypeCron     = "cron"
	TriggerTypeInterval = "interval"
	TriggerTypeOnce     = "once"

	ExecutionTargetCloud  = "cloud"
	ExecutionTargetDevice = "device"
)

// Job is a scheduled automation definition.
type Job struct {
	ID              string     `json:"id"`
	OrganizationID  string     `json:"organization_id"`
	CreatedByUserID string     `json:"created_by_user_id"`
	Name            string     `json:"name"`
	Description     string     `json:"description"`
	Status          string     `json:"status"`
	TriggerType     string     `json:"trigger_type"`
	CronExpr        string     `json:"cron_expr,omitempty"`
	IntervalSeconds int        `json:"interval_seconds,omitempty"`
	RunAt           *time.Time `json:"run_at,omitempty"`
	NextRunAt       *time.Time `json:"next_run_at,omitempty"`
	LastRunAt       *time.Time `json:"last_run_at,omitempty"`
	LastRunStatus   string     `json:"last_run_status,omitempty"`
	ExecutionTarget string     `json:"execution_target"`
	TargetDeviceID  string     `json:"target_device_id,omitempty"`
	// WebhookToken is the raw token a caller uses at POST /api/v1/webhooks/
	// {token} to start a run of this job - present only once a
	// webhook_trigger node has been saved on Graph. The client builds the
	// full URL by prefixing its own known API base URL.
	WebhookToken        string `json:"webhook_token,omitempty"`
	WebhookMethod       string `json:"webhook_method,omitempty"`
	WebhookResponseMode string `json:"webhook_response_mode,omitempty"`
	Prompt              string `json:"prompt,omitempty"`
	// Graph, when set, runs instead of Prompt — mutually exclusive, exactly
	// one is required. See internal/server/automation/gmail_poll_node.go
	// for the node type this exists to support (an interval-triggered job
	// polling a mailbox), and executeCloudRun for how a graph run is seeded
	// with this job's own id/owner/organization.
	Graph         *dataflow.Definition `json:"graph,omitempty"`
	ModelOverride string               `json:"model_override,omitempty"`
	Configuration map[string]string    `json:"configuration,omitempty"`
	// ResolvedAgents is the save-time snapshot resolved by seshat-backend
	// for this graph's "agent" nodes - see sdb.ResolvedAgent's doc comment.
	ResolvedAgents map[string]sdb.ResolvedAgent `json:"resolved_agents,omitempty"`
	// ErrorWorkflowJobID (Tier 3.1) is another job in this organization to
	// queue a run for whenever this job's own run fails - see
	// Service.triggerErrorWorkflowIfConfigured.
	ErrorWorkflowJobID *string `json:"error_workflow_job_id,omitempty"`
	// Tags (Tier 3.4) - free-text labels for Overview's search/filter.
	Tags      []string  `json:"tags,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// jobTriggerParams is the mutable trigger/target/payload shape shared by
// create and update.
type jobTriggerParams struct {
	Name            string
	Description     string
	TriggerType     string
	CronExpr        string
	IntervalSeconds int
	RunAt           *time.Time
	ExecutionTarget string
	TargetDeviceID  string
	Prompt          string
	Graph           *dataflow.Definition
	ModelOverride   string
	Configuration   map[string]string
	ResolvedAgents  map[string]sdb.ResolvedAgent
}

type CreateJobParams struct {
	OrganizationID  string                       `json:"organization_id"`
	Name            string                       `json:"name"`
	Description     string                       `json:"description"`
	TriggerType     string                       `json:"trigger_type"`
	CronExpr        string                       `json:"cron_expr"`
	IntervalSeconds int                          `json:"interval_seconds"`
	RunAt           *time.Time                   `json:"run_at"`
	ExecutionTarget string                       `json:"execution_target"`
	TargetDeviceID  string                       `json:"target_device_id"`
	Prompt          string                       `json:"prompt"`
	Graph           *dataflow.Definition         `json:"graph"`
	ModelOverride   string                       `json:"model_override"`
	Configuration   map[string]string            `json:"configuration"`
	ResolvedAgents  map[string]sdb.ResolvedAgent `json:"resolved_agents"`
	// ErrorWorkflowJobID (Tier 3.1) is error-handling config, not a trigger
	// concern - kept separate from jobTriggerParams (see normalizeErrorWorkflowJobID).
	ErrorWorkflowJobID string `json:"error_workflow_job_id"`
	// Tags (Tier 3.4) - free-text labels for Overview's search/filter, also
	// kept separate from jobTriggerParams since they're organizational
	// metadata, not trigger config.
	Tags []string `json:"tags"`
}

type UpdateJobParams struct {
	Name            string                       `json:"name"`
	Description     string                       `json:"description"`
	TriggerType     string                       `json:"trigger_type"`
	CronExpr        string                       `json:"cron_expr"`
	IntervalSeconds int                          `json:"interval_seconds"`
	RunAt           *time.Time                   `json:"run_at"`
	ExecutionTarget string                       `json:"execution_target"`
	TargetDeviceID  string                       `json:"target_device_id"`
	Prompt          string                       `json:"prompt"`
	Graph           *dataflow.Definition         `json:"graph"`
	ModelOverride   string                       `json:"model_override"`
	Configuration   map[string]string            `json:"configuration"`
	ResolvedAgents  map[string]sdb.ResolvedAgent `json:"resolved_agents"`
	// See CreateJobParams.ErrorWorkflowJobID's doc comment. Empty clears any
	// existing setting.
	ErrorWorkflowJobID string `json:"error_workflow_job_id"`
	// See CreateJobParams.Tags's doc comment. Empty/omitted clears any
	// existing tags.
	Tags []string `json:"tags"`
}

// ListJobs returns jobs in an organization the caller can see. Consistent
// with every other list endpoint in this control plane (applications,
// providers, groups, ...): a caller lacking jobs.read/jobs.manage/
// organization.manage gets an empty list, not a 403 — visibility is scoped,
// not gated, the same way GET /applications never errors for a viewer.
func (s *Service) ListJobs(ctx context.Context, principal *iam.Principal, organizationID string) ([]Job, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "jobs.read", "jobs.manage", "organization.manage"); err != nil {
			return []Job{}, nil
		}
	}

	var records []sdb.ScheduledJob
	if err := s.db.Gorm().WithContext(ctx).Where("organization_id = ?", organizationID).Find(&records).Error; err != nil {
		return nil, err
	}
	jobs := make([]Job, 0, len(records))
	for _, record := range records {
		jobs = append(jobs, toJob(record))
	}
	sort.Slice(jobs, func(i, j int) bool { return jobs[i].Name < jobs[j].Name })
	return jobs, nil
}

// GetJob resolves one job. Requires jobs.read, jobs.manage or organization.manage.
func (s *Service) GetJob(ctx context.Context, principal *iam.Principal, jobID string) (*Job, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	jobID = strings.TrimSpace(jobID)
	if jobID == "" {
		return nil, ErrInvalidInput("job_id is required")
	}

	tx := s.db.Gorm().WithContext(ctx)
	var record sdb.ScheduledJob
	if err := tx.First(&record, "id = ?", jobID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("job not found")
		}
		return nil, err
	}
	if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "jobs.read", "jobs.manage", "organization.manage"); err != nil {
		return nil, err
	}
	job := toJob(record)
	return &job, nil
}

// CreateJob defines a new scheduled automation. Requires jobs.manage or
// organization.manage.
func (s *Service) CreateJob(ctx context.Context, principal *iam.Principal, params CreateJobParams) (*Job, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}

	var job *Job
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "jobs.manage", "organization.manage"); err != nil {
			return err
		}

		trigger, webhook, err := normalizeJobTrigger(jobTriggerParams{
			Name:            params.Name,
			Description:     params.Description,
			TriggerType:     params.TriggerType,
			CronExpr:        params.CronExpr,
			IntervalSeconds: params.IntervalSeconds,
			RunAt:           params.RunAt,
			ExecutionTarget: params.ExecutionTarget,
			TargetDeviceID:  params.TargetDeviceID,
			Prompt:          params.Prompt,
			Graph:           params.Graph,
			ModelOverride:   params.ModelOverride,
			Configuration:   params.Configuration,
			ResolvedAgents:  params.ResolvedAgents,
		})
		if err != nil {
			return err
		}
		if trigger.ExecutionTarget == ExecutionTargetDevice {
			if err := validateTargetDevice(tx, organizationID, trigger.TargetDeviceID); err != nil {
				return err
			}
		}
		// A brand-new job's own ID doesn't exist yet, so there's no
		// self-reference to guard against here the way UpdateJob does.
		errorWorkflowJobID, err := normalizeErrorWorkflowJobID(tx, organizationID, "", params.ErrorWorkflowJobID)
		if err != nil {
			return err
		}

		now := time.Now().UTC()
		nextRunAt, err := computeNextRunAt(trigger, now)
		if err != nil {
			return err
		}

		jobIDValue, err := newID("job")
		if err != nil {
			return err
		}
		record := sdb.ScheduledJob{
			ID:                  jobIDValue,
			OrganizationID:      organizationID,
			CreatedByUserID:     principal.User.ID,
			Name:                trigger.Name,
			Description:         trigger.Description,
			Status:              JobStatusActive,
			TriggerType:         trigger.TriggerType,
			CronExpr:            trigger.CronExpr,
			IntervalSeconds:     trigger.IntervalSeconds,
			RunAt:               trigger.RunAt,
			NextRunAt:           nextRunAt,
			ExecutionTarget:     trigger.ExecutionTarget,
			TargetDeviceID:      trigger.TargetDeviceID,
			WebhookMethod:       webhook.Method,
			WebhookResponseMode: webhook.ResponseMode,
			Prompt:              trigger.Prompt,
			GraphJSON:           graphToJSON(trigger.Graph),
			ModelOverride:       trigger.ModelOverride,
			Configuration:       trigger.Configuration,
			ResolvedAgents:      trigger.ResolvedAgents,
			ErrorWorkflowJobID:  errorWorkflowJobID,
			Tags:                normalizeTags(params.Tags),
			CreatedAt:           now,
			UpdatedAt:           now,
		}
		if webhook.Method != "" {
			token, err := newToken()
			if err != nil {
				return err
			}
			record.WebhookToken = &token
		}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		if err := s.iam.AppendAuditEvent(tx, principal, organizationID, "job.created", "job", record.ID, map[string]string{"name": record.Name, "execution_target": record.ExecutionTarget}); err != nil {
			return err
		}
		converted := toJob(record)
		job = &converted
		return nil
	})
	return job, err
}

// UpdateJob updates a job's trigger and payload. Requires jobs.manage or
// organization.manage.
func (s *Service) UpdateJob(ctx context.Context, principal *iam.Principal, jobID string, params UpdateJobParams) (*Job, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	jobID = strings.TrimSpace(jobID)
	if jobID == "" {
		return nil, ErrInvalidInput("job_id is required")
	}

	var job *Job
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.ScheduledJob
		if err := tx.First(&record, "id = ?", jobID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("job not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "jobs.manage", "organization.manage"); err != nil {
			return err
		}

		trigger, webhook, err := normalizeJobTrigger(jobTriggerParams{
			Name:            params.Name,
			Description:     params.Description,
			TriggerType:     params.TriggerType,
			CronExpr:        params.CronExpr,
			IntervalSeconds: params.IntervalSeconds,
			RunAt:           params.RunAt,
			ExecutionTarget: params.ExecutionTarget,
			TargetDeviceID:  params.TargetDeviceID,
			Prompt:          params.Prompt,
			Graph:           params.Graph,
			ModelOverride:   params.ModelOverride,
			Configuration:   params.Configuration,
			ResolvedAgents:  params.ResolvedAgents,
		})
		if err != nil {
			return err
		}
		if trigger.ExecutionTarget == ExecutionTargetDevice {
			if err := validateTargetDevice(tx, record.OrganizationID, trigger.TargetDeviceID); err != nil {
				return err
			}
		}
		errorWorkflowJobID, err := normalizeErrorWorkflowJobID(tx, record.OrganizationID, record.ID, params.ErrorWorkflowJobID)
		if err != nil {
			return err
		}

		now := time.Now().UTC()
		nextRunAt, err := computeNextRunAt(trigger, now)
		if err != nil {
			return err
		}

		record.Name = trigger.Name
		record.Description = trigger.Description
		record.TriggerType = trigger.TriggerType
		record.CronExpr = trigger.CronExpr
		record.IntervalSeconds = trigger.IntervalSeconds
		record.RunAt = trigger.RunAt
		record.NextRunAt = nextRunAt
		record.ExecutionTarget = trigger.ExecutionTarget
		record.TargetDeviceID = trigger.TargetDeviceID
		record.Prompt = trigger.Prompt
		record.GraphJSON = graphToJSON(trigger.Graph)
		record.ModelOverride = trigger.ModelOverride
		record.Configuration = trigger.Configuration
		record.ResolvedAgents = trigger.ResolvedAgents
		record.WebhookMethod = webhook.Method
		record.WebhookResponseMode = webhook.ResponseMode
		record.ErrorWorkflowJobID = errorWorkflowJobID
		record.Tags = normalizeTags(params.Tags)
		switch {
		case webhook.Method == "":
			// The graph no longer has a webhook_trigger node - revoke the
			// URL rather than leaving a stale, unlisted one still live.
			record.WebhookToken = nil
		case record.WebhookToken == nil:
			// First time a webhook_trigger node is saved on this job.
			token, err := newToken()
			if err != nil {
				return err
			}
			record.WebhookToken = &token
		default:
			// Already has a token from an earlier save - keep it stable
			// across edits, same as any other webhook/API-key URL.
		}
		record.UpdatedAt = now
		if err := tx.Save(&record).Error; err != nil {
			return err
		}
		if err := s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "job.updated", "job", record.ID, map[string]string{"name": record.Name}); err != nil {
			return err
		}
		converted := toJob(record)
		job = &converted
		return nil
	})
	return job, err
}

// DeleteJob removes a job. Requires jobs.manage or organization.manage.
func (s *Service) DeleteJob(ctx context.Context, principal *iam.Principal, jobID string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	jobID = strings.TrimSpace(jobID)
	if jobID == "" {
		return ErrInvalidInput("job_id is required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.ScheduledJob
		if err := tx.First(&record, "id = ?", jobID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("job not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "jobs.manage", "organization.manage"); err != nil {
			return err
		}
		if err := tx.Where("job_id = ?", record.ID).Delete(&sdb.JobRun{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&sdb.ScheduledJob{}, "id = ?", record.ID).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "job.deleted", "job", record.ID, map[string]string{"name": record.Name})
	})
}

// SetJobPaused pauses or resumes a job. A paused job is skipped by the
// scheduler even past its next_run_at.
func (s *Service) SetJobPaused(ctx context.Context, principal *iam.Principal, jobID string, paused bool) (*Job, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	jobID = strings.TrimSpace(jobID)
	if jobID == "" {
		return nil, ErrInvalidInput("job_id is required")
	}
	var job *Job
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.ScheduledJob
		if err := tx.First(&record, "id = ?", jobID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("job not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "jobs.manage", "organization.manage"); err != nil {
			return err
		}
		action := "job.resumed"
		record.Status = JobStatusActive
		if paused {
			action = "job.paused"
			record.Status = JobStatusPaused
		}
		record.UpdatedAt = time.Now().UTC()
		if err := tx.Save(&record).Error; err != nil {
			return err
		}
		if err := s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, action, "job", record.ID, nil); err != nil {
			return err
		}
		converted := toJob(record)
		job = &converted
		return nil
	})
	return job, err
}

// TriggerJobNow queues an immediate run outside the job's normal schedule.
// Requires jobs.manage or organization.manage.
func (s *Service) TriggerJobNow(ctx context.Context, principal *iam.Principal, jobID string) (*Run, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	jobID = strings.TrimSpace(jobID)
	if jobID == "" {
		return nil, ErrInvalidInput("job_id is required")
	}
	var run *Run
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.ScheduledJob
		if err := tx.First(&record, "id = ?", jobID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("job not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "jobs.manage", "organization.manage"); err != nil {
			return err
		}
		created, err := queueRunForJob(tx, record, time.Now().UTC(), "")
		if err != nil {
			return err
		}
		if err := s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "job.triggered", "job", record.ID, map[string]string{"run_id": created.ID}); err != nil {
			return err
		}
		converted := toRun(created)
		run = &converted
		return nil
	})
	return run, err
}

// ErrWebhookMethodMismatch is a sentinel (not an apperr.Error, since none of
// its existing Kinds map to HTTP 405) that api.handleWebhookTrigger checks
// for with errors.Is to answer Method Not Allowed itself, rather than
// growing apperr's shared taxonomy for this one endpoint's own nuance.
var ErrWebhookMethodMismatch = errors.New("method does not match this webhook's configured method")

// TriggerJobByWebhook queues a run for the job whose webhook_trigger node
// was saved with this token (see webhookTriggerFromGraph/normalizeJobTrigger)
// — the external-HTTP-call counterpart to TriggerJobNow. Deliberately no
// principal/permission check: an unguessable 192-bit token is the trust
// boundary here, the same posture as handleConnectorOAuthCallback's signed
// state param. payload is JSON-encoded request body/headers/query, merged
// into the graph's seed under a "webhook" key (see jobWorkflow.runGraph).
func (s *Service) TriggerJobByWebhook(ctx context.Context, token, method, payload string) (*Run, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, ErrNotFound("webhook not found")
	}
	var created sdb.JobRun
	var record sdb.ScheduledJob
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := tx.First(&record, "webhook_token = ?", token).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("webhook not found")
			}
			return err
		}
		if record.Status != JobStatusActive {
			return ErrConflict("this automation is paused")
		}
		if !strings.EqualFold(record.WebhookMethod, method) {
			return ErrWebhookMethodMismatch
		}
		var err error
		created, err = queueRunForJob(tx, record, time.Now().UTC(), payload)
		if err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, nil, record.OrganizationID, "job.triggered_by_webhook", "job", record.ID, map[string]string{"run_id": created.ID})
	})
	if err != nil {
		return nil, err
	}

	if record.WebhookResponseMode != WebhookResponseModeWhenFinished {
		run := toRun(created)
		return &run, nil
	}
	return s.waitForWebhookRun(ctx, created.ID), nil
}

// waitForWebhookRun implements "whenFinished": the run was already queued
// (same audit trail/statuses as any other run) by the caller, but nothing
// executes it until either the scheduler's own tick eventually picks it up
// (up to ~30s later, see Scheduler.tick) or - what actually happens here -
// this call runs it immediately itself. execution is handed a context
// detached from the incoming HTTP request (context.WithoutCancel) so it
// keeps going to completion even if this function gives up waiting once
// resolveWebhookSyncTimeout elapses; executeCloudRun's own claim step
// (UPDATE ... WHERE status = 'queued') is what makes it safe for the
// scheduler's tick to also race for the same run without double-executing
// it - the same mechanism that already protects against concurrent
// scheduler instances.
func (s *Service) waitForWebhookRun(ctx context.Context, runID string) *Run {
	done := make(chan struct{})
	go func() {
		defer close(done)
		_ = s.executeCloudRun(context.WithoutCancel(ctx), runID)
	}()

	select {
	case <-done:
	case <-time.After(s.resolveWebhookSyncTimeout()):
		// Still running - fall through and report whatever state it's in;
		// execution itself is unaffected, it keeps going in the background.
	}

	var final sdb.JobRun
	if err := s.db.Gorm().First(&final, "id = ?", runID).Error; err != nil {
		run := toRun(sdb.JobRun{ID: runID, Status: RunStatusQueued})
		return &run
	}
	run := toRun(final)
	return &run
}

// normalizeErrorWorkflowJobID validates a job's Tier 3.1 "Error Workflow"
// setting: empty clears it (nil), otherwise it must reference a real job in
// the same organization and must not be the job's own ID (selfJobID is ""
// for a not-yet-created job, which can never collide). This is only a
// structural safeguard - the real anti-loop guard against an error workflow
// cascading into itself (or a longer cycle) is the TriggerPayload marker
// check in Service.triggerErrorWorkflowIfConfigured, since a same-org cycle
// through several jobs would still pass this simple check.
func normalizeErrorWorkflowJobID(tx *gorm.DB, organizationID, selfJobID, raw string) (*string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	if raw == selfJobID {
		return nil, ErrInvalidInput("a job cannot be its own error workflow")
	}
	var count int64
	if err := tx.Model(&sdb.ScheduledJob{}).Where("id = ? AND organization_id = ?", raw, organizationID).Count(&count).Error; err != nil {
		return nil, err
	}
	if count == 0 {
		return nil, ErrInvalidInput("error_workflow_job_id does not reference a job in this organization")
	}
	return &raw, nil
}

// normalizeTags trims each tag, drops empties, and de-duplicates
// case-insensitively (keeping the first-seen casing) - a job's free-text
// Tier 3.4 labels. nil/empty in means nil out (untagged), never an empty
// non-nil slice, so a job that predates this field and one explicitly
// cleared of tags round-trip identically.
func normalizeTags(raw []string) []string {
	if len(raw) == 0 {
		return nil
	}
	seen := make(map[string]bool, len(raw))
	out := make([]string, 0, len(raw))
	for _, tag := range raw {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}
		key := strings.ToLower(tag)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, tag)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// normalizedJobTrigger is jobTriggerParams after validation/defaulting.
type normalizedJobTrigger = jobTriggerParams

func normalizeJobTrigger(input jobTriggerParams) (normalizedJobTrigger, extractedWebhookTrigger, error) {
	name := strings.TrimSpace(input.Name)
	prompt := strings.TrimSpace(input.Prompt)
	if name == "" {
		return normalizedJobTrigger{}, extractedWebhookTrigger{}, ErrInvalidInput("name is required")
	}
	if prompt == "" && input.Graph == nil {
		return normalizedJobTrigger{}, extractedWebhookTrigger{}, ErrInvalidInput("prompt or graph is required")
	}
	if prompt != "" && input.Graph != nil {
		return normalizedJobTrigger{}, extractedWebhookTrigger{}, ErrInvalidInput("prompt and graph are mutually exclusive")
	}

	hasGraphSchedule := false
	var webhook extractedWebhookTrigger
	if input.Graph != nil {
		if err := dataflow.Validate(*input.Graph); err != nil {
			return normalizedJobTrigger{}, extractedWebhookTrigger{}, ErrInvalidInput("invalid graph: " + err.Error())
		}
		// A schedule_trigger node on the graph is the trigger config now,
		// not a separate Job Settings field (see docs/helps/audit-2026-09-04-
		// n8n-gap-analysis.md, Tier 1.1) - override whatever the caller sent
		// for trigger_type/cron_expr/etc with what the graph itself declares.
		// A graph saved before this feature has no such node; ok is false and
		// this falls through to validating input.TriggerType etc as sent,
		// exactly today's behavior - no migration needed for existing jobs.
		if trig, ok, err := scheduleTriggerFromGraph(*input.Graph); err != nil {
			return normalizedJobTrigger{}, extractedWebhookTrigger{}, ErrInvalidInput("invalid schedule_trigger node: " + err.Error())
		} else if ok {
			hasGraphSchedule = true
			input.TriggerType = trig.TriggerType
			input.CronExpr = trig.CronExpr
			input.IntervalSeconds = trig.IntervalSeconds
			input.RunAt = trig.RunAt
		}
		// A webhook_trigger node (Tier 1.2) is an independent entry point,
		// not a replacement for a schedule_trigger - a graph can carry both,
		// each starting its own run (see docs/helps/audit-2026-09-04-n8n-gap-
		// analysis.md's Tier 1 note: n8n itself never combines triggers with
		// AND/OR, each just starts its own execution). webhook.Method is ""
		// when the graph has no such node; the caller (CreateJob/UpdateJob)
		// uses that to decide whether to mint/keep/clear a WebhookToken.
		if wtrig, ok, err := webhookTriggerFromGraph(*input.Graph); err != nil {
			return normalizedJobTrigger{}, extractedWebhookTrigger{}, ErrInvalidInput("invalid webhook_trigger node: " + err.Error())
		} else if ok {
			webhook = wtrig
		}
	}

	triggerType := strings.ToLower(strings.TrimSpace(input.TriggerType))
	if webhook.Method != "" && !hasGraphSchedule {
		// Purely event-driven via the webhook - no polling fields required
		// or meaningful. Leaving TriggerType empty keeps this job out of
		// Scheduler.tick()'s polling query entirely (it only selects rows
		// with a set NextRunAt - see computeNextRunAt).
		triggerType = ""
		input.CronExpr = ""
		input.IntervalSeconds = 0
		input.RunAt = nil
	} else {
		switch triggerType {
		case TriggerTypeCron:
			if strings.TrimSpace(input.CronExpr) == "" {
				return normalizedJobTrigger{}, extractedWebhookTrigger{}, ErrInvalidInput("cron_expr is required for a cron trigger")
			}
		case TriggerTypeInterval:
			if input.IntervalSeconds <= 0 {
				return normalizedJobTrigger{}, extractedWebhookTrigger{}, ErrInvalidInput("interval_seconds must be positive for an interval trigger")
			}
		case TriggerTypeOnce:
			if input.RunAt == nil {
				return normalizedJobTrigger{}, extractedWebhookTrigger{}, ErrInvalidInput("run_at is required for a once trigger")
			}
		default:
			return normalizedJobTrigger{}, extractedWebhookTrigger{}, ErrInvalidInput("unsupported trigger_type")
		}
	}

	executionTarget := strings.ToLower(strings.TrimSpace(input.ExecutionTarget))
	targetDeviceID := strings.TrimSpace(input.TargetDeviceID)
	switch executionTarget {
	case ExecutionTargetCloud:
		targetDeviceID = ""
		if _, _, err := parseModelOverride(input.ModelOverride); err != nil {
			return normalizedJobTrigger{}, extractedWebhookTrigger{}, err
		}
	case ExecutionTargetDevice:
		if targetDeviceID == "" {
			return normalizedJobTrigger{}, extractedWebhookTrigger{}, ErrInvalidInput("target_device_id is required when execution_target is device")
		}
		if webhook.ResponseMode == WebhookResponseModeWhenFinished {
			// A device-targeted run waits for a device to poll in whenever
			// it next comes online - no bound a synchronous HTTP caller
			// could wait on (see TriggerJobByWebhook's cloud-only path).
			return normalizedJobTrigger{}, extractedWebhookTrigger{}, ErrInvalidInput(`webhook responseMode "whenFinished" requires execution_target "cloud"`)
		}
	default:
		return normalizedJobTrigger{}, extractedWebhookTrigger{}, ErrInvalidInput("unsupported execution_target")
	}

	return normalizedJobTrigger{
		Name:            name,
		Description:     strings.TrimSpace(input.Description),
		TriggerType:     triggerType,
		CronExpr:        strings.TrimSpace(input.CronExpr),
		IntervalSeconds: input.IntervalSeconds,
		RunAt:           input.RunAt,
		ExecutionTarget: executionTarget,
		TargetDeviceID:  targetDeviceID,
		Prompt:          prompt,
		Graph:           input.Graph,
		ModelOverride:   strings.TrimSpace(input.ModelOverride),
		Configuration:   input.Configuration,
		ResolvedAgents:  input.ResolvedAgents,
	}, webhook, nil
}

// extractedScheduleTrigger is what scheduleTriggerFromGraph reads off a
// schedule_trigger node's Parameters - same shape as jobTriggerParams'
// trigger fields, just scoped to exactly what that node type declares (see
// github.com/KPO-Tech/seshat/pkg/dataflow/nodes.ScheduleTrigger).
type extractedScheduleTrigger struct {
	TriggerType     string
	CronExpr        string
	IntervalSeconds int
	RunAt           *time.Time
}

// scheduleTriggerFromGraph scans def for the first schedule_trigger node and
// reads its schedule config, so a graph job's trigger comes from the graph
// itself rather than a separate Job Settings field. First-match only,
// deliberately - one schedule trigger per graph is this pass's scope; a
// future multi-trigger pass (see the audit doc's Tier 1.2+) revisits this.
// ok is false when the graph has no such node at all (nothing to override,
// not an error - see normalizeJobTrigger's fallback for why). An error is
// only returned for a schedule_trigger node whose own parameters don't
// satisfy its declared mode (mirrors that node's ValidateParameters, which
// only checks presence/shape - see its own doc comment for why full cron
// syntax validation happens here instead, via computeNextRunAt below).
func scheduleTriggerFromGraph(def dataflow.Definition) (extractedScheduleTrigger, bool, error) {
	for _, node := range def.Nodes {
		if node.Type != "schedule_trigger" {
			continue
		}
		mode := dataflow.StringParam(node.Parameters, "mode", "")
		switch mode {
		case TriggerTypeCron:
			expr := strings.TrimSpace(dataflow.StringParam(node.Parameters, "cronExpr", ""))
			if expr == "" {
				return extractedScheduleTrigger{}, false, errors.New("cronExpr is required when mode is \"cron\"")
			}
			return extractedScheduleTrigger{TriggerType: TriggerTypeCron, CronExpr: expr}, true, nil
		case TriggerTypeInterval:
			seconds := dataflow.IntParam(node.Parameters, "intervalSeconds", 0)
			if seconds <= 0 {
				return extractedScheduleTrigger{}, false, errors.New("intervalSeconds must be positive when mode is \"interval\"")
			}
			return extractedScheduleTrigger{TriggerType: TriggerTypeInterval, IntervalSeconds: seconds}, true, nil
		case TriggerTypeOnce:
			raw := dataflow.StringParam(node.Parameters, "runAt", "")
			at, err := time.Parse(time.RFC3339, raw)
			if err != nil {
				return extractedScheduleTrigger{}, false, errors.New("runAt must be an RFC3339 datetime: " + err.Error())
			}
			return extractedScheduleTrigger{TriggerType: TriggerTypeOnce, RunAt: &at}, true, nil
		default:
			return extractedScheduleTrigger{}, false, errors.New(`mode must be one of "cron", "interval", "once"`)
		}
	}
	return extractedScheduleTrigger{}, false, nil
}

// extractedWebhookTrigger is what webhookTriggerFromGraph reads off a
// webhook_trigger node's Parameters. An empty Method means "no such node" -
// checked by callers instead of a separate ok bool, since the node itself
// (github.com/KPO-Tech/seshat/pkg/dataflow/nodes.WebhookTrigger) never
// produces an empty Method when it matches.
type extractedWebhookTrigger struct {
	Method       string
	ResponseMode string
}

const (
	WebhookResponseModeImmediate    = "immediate"
	WebhookResponseModeWhenFinished = "whenFinished"
)

// webhookTriggerFromGraph scans def for the first webhook_trigger node and
// reads its configured HTTP method and response mode, defaulting to POST/
// immediate like the node type itself does (see
// github.com/KPO-Tech/seshat/pkg/dataflow/nodes.WebhookTrigger). First-match
// only, same scope decision as scheduleTriggerFromGraph. Unlike a schedule
// trigger, a webhook trigger doesn't replace anything on the job - see
// normalizeJobTrigger's caller comment for why a graph can carry both at
// once.
func webhookTriggerFromGraph(def dataflow.Definition) (extractedWebhookTrigger, bool, error) {
	for _, node := range def.Nodes {
		if node.Type != "webhook_trigger" {
			continue
		}
		method := strings.ToUpper(strings.TrimSpace(dataflow.StringParam(node.Parameters, "method", "")))
		if method == "" {
			method = "POST" // matches nodes.WebhookTrigger's own Description() default
		}
		switch method {
		case "GET", "POST", "PUT", "PATCH", "DELETE":
		default:
			return extractedWebhookTrigger{}, false, errors.New(`method must be one of "GET", "POST", "PUT", "PATCH", "DELETE"`)
		}

		mode := strings.TrimSpace(dataflow.StringParam(node.Parameters, "responseMode", ""))
		if mode == "" {
			mode = WebhookResponseModeImmediate
		}
		if mode != WebhookResponseModeImmediate && mode != WebhookResponseModeWhenFinished {
			return extractedWebhookTrigger{}, false, errors.New(`responseMode must be one of "immediate", "whenFinished"`)
		}

		return extractedWebhookTrigger{Method: method, ResponseMode: mode}, true, nil
	}
	return extractedWebhookTrigger{}, false, nil
}

// graphToJSON/graphFromJSON mirror the same pattern already used by
// seshat-backend's inbox workflows (internal/inbox/workflow_store.go) for
// storing a *dataflow.Definition as a DB text column.
func graphToJSON(g *dataflow.Definition) string {
	if g == nil {
		return ""
	}
	data, _ := json.Marshal(g)
	return string(data)
}

func graphFromJSON(s string) *dataflow.Definition {
	if s == "" {
		return nil
	}
	var g dataflow.Definition
	if err := json.Unmarshal([]byte(s), &g); err != nil {
		return nil
	}
	return &g
}

func validateTargetDevice(tx *gorm.DB, organizationID, deviceID string) error {
	var device sdb.Device
	if err := tx.First(&device, "id = ?", deviceID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound("target device not found")
		}
		return err
	}
	if device.OrganizationID != organizationID {
		return ErrInvalidInput("target device must belong to the same organization")
	}
	if device.Status != DeviceStatusActive {
		return ErrInvalidInput("target device is revoked")
	}
	return nil
}

// computeNextRunAt reuses seshat's own Schedule primitives (Cron/Every/Once)
// rather than reimplementing cron parsing — the same code path
// seshat-automation itself runs on.
func computeNextRunAt(trigger normalizedJobTrigger, from time.Time) (*time.Time, error) {
	if trigger.TriggerType == "" {
		// Purely event-driven (a webhook_trigger node with no accompanying
		// schedule_trigger, see normalizeJobTrigger) - never polled, so
		// there's no "next" run to compute.
		return nil, nil
	}
	var schedule automation.Schedule
	switch trigger.TriggerType {
	case TriggerTypeCron:
		sched, err := automation.Cron(trigger.CronExpr)
		if err != nil {
			return nil, ErrInvalidInput("invalid cron_expr: " + err.Error())
		}
		schedule = sched
	case TriggerTypeInterval:
		schedule = automation.Every(time.Duration(trigger.IntervalSeconds) * time.Second)
	case TriggerTypeOnce:
		schedule = automation.Once(*trigger.RunAt)
	default:
		return nil, ErrInvalidInput("unsupported trigger_type")
	}
	next := schedule.Next(from)
	if next.IsZero() {
		return nil, nil
	}
	return &next, nil
}

func toJob(record sdb.ScheduledJob) Job {
	webhookToken := ""
	if record.WebhookToken != nil {
		webhookToken = *record.WebhookToken
	}
	return Job{
		ID:                  record.ID,
		OrganizationID:      record.OrganizationID,
		CreatedByUserID:     record.CreatedByUserID,
		Name:                record.Name,
		Description:         record.Description,
		Status:              record.Status,
		TriggerType:         record.TriggerType,
		CronExpr:            record.CronExpr,
		IntervalSeconds:     record.IntervalSeconds,
		RunAt:               record.RunAt,
		NextRunAt:           record.NextRunAt,
		LastRunAt:           record.LastRunAt,
		LastRunStatus:       record.LastRunStatus,
		ExecutionTarget:     record.ExecutionTarget,
		TargetDeviceID:      record.TargetDeviceID,
		WebhookToken:        webhookToken,
		WebhookMethod:       record.WebhookMethod,
		WebhookResponseMode: record.WebhookResponseMode,
		Prompt:              record.Prompt,
		Graph:               graphFromJSON(record.GraphJSON),
		ModelOverride:       record.ModelOverride,
		Configuration:       record.Configuration,
		ResolvedAgents:      record.ResolvedAgents,
		ErrorWorkflowJobID:  record.ErrorWorkflowJobID,
		Tags:                record.Tags,
		CreatedAt:           record.CreatedAt,
		UpdatedAt:           record.UpdatedAt,
	}
}
