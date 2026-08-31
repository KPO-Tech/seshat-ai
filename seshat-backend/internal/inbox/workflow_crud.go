package inbox

import (
	"context"
	"fmt"
	"strings"
	"time"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/KPO-Tech/seshat/pkg/automation"
)

// CreateWorkflowParams describes a new event-triggered Inbox workflow - see
// dispatchWorkflows for how EventFilter is evaluated once the workflow is
// active.
type CreateWorkflowParams struct {
	Name        string
	Description string
	// EventFilter is a goja boolean expression evaluated against $event (see
	// EvaluateEventFilter/InboxMessageEvent.Payload); empty matches every
	// inbound message.
	EventFilter string
	// Task is the instruction the agent runs when this workflow fires.
	Task      string
	AgentSlug string
	// MaxRuns caps how many times this workflow may fire before it goes
	// inactive; 0 = unlimited.
	MaxRuns int
}

// CreateWorkflow validates and persists a new TriggerTypeEvent workflow
// owned by principal, active immediately. The filter is compiled once up
// front (against an empty event) so a malformed condition fails at creation
// time rather than silently never firing on every future message.
func (s *Service) CreateWorkflow(ctx context.Context, principal *backendauth.Principal, params CreateWorkflowParams) (*automation.Job, error) {
	if s == nil || s.workflows == nil {
		return nil, fmt.Errorf("inbox workflows are not enabled")
	}
	name := strings.TrimSpace(params.Name)
	task := strings.TrimSpace(params.Task)
	if name == "" || task == "" {
		return nil, fmt.Errorf("name and task are required")
	}
	filter := strings.TrimSpace(params.EventFilter)
	if _, err := EvaluateEventFilter(filter, InboxMessageEvent{}.Payload()); err != nil {
		return nil, fmt.Errorf("invalid event_filter: %w", err)
	}

	now := time.Now()
	job := &automation.Job{
		OwnerID:     principal.User.ID,
		Name:        name,
		Description: strings.TrimSpace(params.Description),
		Trigger: automation.Trigger{
			Type:        automation.TriggerTypeEvent,
			EventType:   InboxMessageEventType,
			EventFilter: filter,
		},
		Agent:     automation.AgentConfig{Slug: params.AgentSlug},
		Task:      task,
		Status:    automation.JobStatusActive,
		MaxRuns:   params.MaxRuns,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.workflows.CreateJob(ctx, job); err != nil {
		return nil, fmt.Errorf("create workflow: %w", err)
	}
	return job, nil
}

// ListWorkflows returns every workflow owned by principal, most recently
// created first.
func (s *Service) ListWorkflows(ctx context.Context, principal *backendauth.Principal) ([]*automation.Job, error) {
	if s == nil || s.workflows == nil {
		return nil, fmt.Errorf("inbox workflows are not enabled")
	}
	return s.workflows.ListJobs(ctx, principal.User.ID)
}

// DeleteWorkflow removes a workflow by ID, scoped to principal's own
// workflows - an ID belonging to another user (or that doesn't exist) is
// silently a no-op rather than an error, matching InboxWorkflowStore.Delete.
func (s *Service) DeleteWorkflow(ctx context.Context, principal *backendauth.Principal, id string) error {
	if s == nil || s.workflows == nil {
		return fmt.Errorf("inbox workflows are not enabled")
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("id is required")
	}
	return s.workflows.DeleteJob(ctx, id, principal.User.ID)
}
