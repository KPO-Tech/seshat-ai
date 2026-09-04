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
	Prompt          string     `json:"prompt,omitempty"`
	// Graph, when set, runs instead of Prompt — mutually exclusive, exactly
	// one is required. See internal/server/automation/gmail_poll_node.go
	// for the node type this exists to support (an interval-triggered job
	// polling a mailbox), and executeCloudRun for how a graph run is seeded
	// with this job's own id/owner/organization.
	Graph         *dataflow.Definition `json:"graph,omitempty"`
	ModelOverride string               `json:"model_override,omitempty"`
	Configuration map[string]string    `json:"configuration,omitempty"`
	CreatedAt     time.Time            `json:"created_at"`
	UpdatedAt     time.Time            `json:"updated_at"`
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
}

type CreateJobParams struct {
	OrganizationID  string               `json:"organization_id"`
	Name            string               `json:"name"`
	Description     string               `json:"description"`
	TriggerType     string               `json:"trigger_type"`
	CronExpr        string               `json:"cron_expr"`
	IntervalSeconds int                  `json:"interval_seconds"`
	RunAt           *time.Time           `json:"run_at"`
	ExecutionTarget string               `json:"execution_target"`
	TargetDeviceID  string               `json:"target_device_id"`
	Prompt          string               `json:"prompt"`
	Graph           *dataflow.Definition `json:"graph"`
	ModelOverride   string               `json:"model_override"`
	Configuration   map[string]string    `json:"configuration"`
}

type UpdateJobParams struct {
	Name            string               `json:"name"`
	Description     string               `json:"description"`
	TriggerType     string               `json:"trigger_type"`
	CronExpr        string               `json:"cron_expr"`
	IntervalSeconds int                  `json:"interval_seconds"`
	RunAt           *time.Time           `json:"run_at"`
	ExecutionTarget string               `json:"execution_target"`
	TargetDeviceID  string               `json:"target_device_id"`
	Prompt          string               `json:"prompt"`
	Graph           *dataflow.Definition `json:"graph"`
	ModelOverride   string               `json:"model_override"`
	Configuration   map[string]string    `json:"configuration"`
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

		trigger, err := normalizeJobTrigger(jobTriggerParams{
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
		})
		if err != nil {
			return err
		}
		if trigger.ExecutionTarget == ExecutionTargetDevice {
			if err := validateTargetDevice(tx, organizationID, trigger.TargetDeviceID); err != nil {
				return err
			}
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
			ID:              jobIDValue,
			OrganizationID:  organizationID,
			CreatedByUserID: principal.User.ID,
			Name:            trigger.Name,
			Description:     trigger.Description,
			Status:          JobStatusActive,
			TriggerType:     trigger.TriggerType,
			CronExpr:        trigger.CronExpr,
			IntervalSeconds: trigger.IntervalSeconds,
			RunAt:           trigger.RunAt,
			NextRunAt:       nextRunAt,
			ExecutionTarget: trigger.ExecutionTarget,
			TargetDeviceID:  trigger.TargetDeviceID,
			Prompt:          trigger.Prompt,
			GraphJSON:       graphToJSON(trigger.Graph),
			ModelOverride:   trigger.ModelOverride,
			Configuration:   trigger.Configuration,
			CreatedAt:       now,
			UpdatedAt:       now,
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

		trigger, err := normalizeJobTrigger(jobTriggerParams(params))
		if err != nil {
			return err
		}
		if trigger.ExecutionTarget == ExecutionTargetDevice {
			if err := validateTargetDevice(tx, record.OrganizationID, trigger.TargetDeviceID); err != nil {
				return err
			}
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
		created, err := queueRunForJob(tx, record, time.Now().UTC())
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

// normalizedJobTrigger is jobTriggerParams after validation/defaulting.
type normalizedJobTrigger = jobTriggerParams

func normalizeJobTrigger(input jobTriggerParams) (normalizedJobTrigger, error) {
	name := strings.TrimSpace(input.Name)
	prompt := strings.TrimSpace(input.Prompt)
	if name == "" {
		return normalizedJobTrigger{}, ErrInvalidInput("name is required")
	}
	if prompt == "" && input.Graph == nil {
		return normalizedJobTrigger{}, ErrInvalidInput("prompt or graph is required")
	}
	if prompt != "" && input.Graph != nil {
		return normalizedJobTrigger{}, ErrInvalidInput("prompt and graph are mutually exclusive")
	}
	if input.Graph != nil {
		if err := dataflow.Validate(*input.Graph); err != nil {
			return normalizedJobTrigger{}, ErrInvalidInput("invalid graph: " + err.Error())
		}
		// A schedule_trigger node on the graph is the trigger config now,
		// not a separate Job Settings field (see docs/helps/audit-2026-09-04-
		// n8n-gap-analysis.md, Tier 1.1) - override whatever the caller sent
		// for trigger_type/cron_expr/etc with what the graph itself declares.
		// A graph saved before this feature has no such node; ok is false and
		// this falls through to validating input.TriggerType etc as sent,
		// exactly today's behavior - no migration needed for existing jobs.
		if trig, ok, err := scheduleTriggerFromGraph(*input.Graph); err != nil {
			return normalizedJobTrigger{}, ErrInvalidInput("invalid schedule_trigger node: " + err.Error())
		} else if ok {
			input.TriggerType = trig.TriggerType
			input.CronExpr = trig.CronExpr
			input.IntervalSeconds = trig.IntervalSeconds
			input.RunAt = trig.RunAt
		}
	}

	triggerType := strings.ToLower(strings.TrimSpace(input.TriggerType))
	switch triggerType {
	case TriggerTypeCron:
		if strings.TrimSpace(input.CronExpr) == "" {
			return normalizedJobTrigger{}, ErrInvalidInput("cron_expr is required for a cron trigger")
		}
	case TriggerTypeInterval:
		if input.IntervalSeconds <= 0 {
			return normalizedJobTrigger{}, ErrInvalidInput("interval_seconds must be positive for an interval trigger")
		}
	case TriggerTypeOnce:
		if input.RunAt == nil {
			return normalizedJobTrigger{}, ErrInvalidInput("run_at is required for a once trigger")
		}
	default:
		return normalizedJobTrigger{}, ErrInvalidInput("unsupported trigger_type")
	}

	executionTarget := strings.ToLower(strings.TrimSpace(input.ExecutionTarget))
	targetDeviceID := strings.TrimSpace(input.TargetDeviceID)
	switch executionTarget {
	case ExecutionTargetCloud:
		targetDeviceID = ""
		if _, _, err := parseModelOverride(input.ModelOverride); err != nil {
			return normalizedJobTrigger{}, err
		}
	case ExecutionTargetDevice:
		if targetDeviceID == "" {
			return normalizedJobTrigger{}, ErrInvalidInput("target_device_id is required when execution_target is device")
		}
	default:
		return normalizedJobTrigger{}, ErrInvalidInput("unsupported execution_target")
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
	}, nil
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
	return Job{
		ID:              record.ID,
		OrganizationID:  record.OrganizationID,
		CreatedByUserID: record.CreatedByUserID,
		Name:            record.Name,
		Description:     record.Description,
		Status:          record.Status,
		TriggerType:     record.TriggerType,
		CronExpr:        record.CronExpr,
		IntervalSeconds: record.IntervalSeconds,
		RunAt:           record.RunAt,
		NextRunAt:       record.NextRunAt,
		LastRunAt:       record.LastRunAt,
		LastRunStatus:   record.LastRunStatus,
		ExecutionTarget: record.ExecutionTarget,
		TargetDeviceID:  record.TargetDeviceID,
		Prompt:          record.Prompt,
		Graph:           graphFromJSON(record.GraphJSON),
		ModelOverride:   record.ModelOverride,
		Configuration:   record.Configuration,
		CreatedAt:       record.CreatedAt,
		UpdatedAt:       record.UpdatedAt,
	}
}
