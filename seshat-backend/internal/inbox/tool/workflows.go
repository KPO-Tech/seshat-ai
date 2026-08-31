package tool

import (
	"context"
	"fmt"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/agents"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inbox"
	"github.com/KPO-Tech/seshat/pkg/tools"
)

// eventFilterDescription documents the $event shape every event_filter
// expression is evaluated against - shared between the create tool's own
// Description and its event_filter parameter so an authoring agent sees it
// in both places.
const eventFilterDescription = `A JavaScript boolean expression evaluated against the triggering message, exposed as $event. Available fields: $event.channel ("gmail" or "whatsapp"), $event.sender, $event.subject (empty for chat-style channels), $event.body, $event.threadStatus, $event.receivedAt (RFC3339). Example: $event.subject.toLowerCase().includes("invoice"). Leave empty to fire on every inbound message.`

// ─── inbox_create_workflow ──────────────────────────────────────────────────

const CreateWorkflowToolName = "inbox_create_workflow"

type CreateWorkflowTool struct {
	backend *inbox.Service
}

func NewCreateWorkflowTool(backend *inbox.Service) *CreateWorkflowTool {
	return &CreateWorkflowTool{backend: backend}
}

func (t *CreateWorkflowTool) Definition() tools.Definition {
	return tools.Definition{
		Name:        CreateWorkflowToolName,
		DisplayName: "Create Inbox Workflow",
		Description: "Create a standing automation rule: whenever a new inbox message matches a condition, run a task automatically - no further confirmation from the user at trigger time. Use this instead of handling a recurring pattern manually every time it comes up (e.g. \"whenever an invoice email arrives, draft a reply asking for the PO number\"). The task runs as this same Inbox Agent with the same tools and the same policy (prefer drafting over sending) each time it fires, so write task as a self-contained instruction, since it won't have this conversation's context. " + eventFilterDescription,
		Category:    "inbox",
		InputSchema: tools.FromMap(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"name": map[string]any{
					"type":        "string",
					"description": "Short, human-readable name for the rule (e.g. \"Draft replies to invoice emails\").",
				},
				"description": map[string]any{
					"type":        "string",
					"description": "Optional longer explanation of what this rule does and why.",
				},
				"event_filter": map[string]any{
					"type":        "string",
					"description": eventFilterDescription,
				},
				"task": map[string]any{
					"type":        "string",
					"description": "The self-contained instruction to run each time this rule fires (e.g. \"Draft a reply asking for the PO number and expected payment date.\").",
				},
				"max_runs": map[string]any{
					"type":        "integer",
					"description": "Optional cap on how many times this rule may fire before it deactivates itself. Omit or 0 for unlimited.",
				},
			},
			"required": []string{"name", "task"},
		}),
		IsReadOnly:         false,
		IsConcurrencySafe:  true,
		RequiresPermission: false,
	}
}

func (t *CreateWorkflowTool) Call(ctx context.Context, input tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	principal, err := principalFromContext(ctx)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	name := stringInput(input.Parsed, "name")
	task := stringInput(input.Parsed, "task")
	if name == "" || task == "" {
		return tools.NewErrorResult(fmt.Errorf("name and task are required")), nil
	}
	job, err := t.backend.CreateWorkflow(ctx, principal, inbox.CreateWorkflowParams{
		Name:        name,
		Description: stringInput(input.Parsed, "description"),
		EventFilter: stringInput(input.Parsed, "event_filter"),
		Task:        task,
		AgentSlug:   agents.InboxAgentSlug,
		MaxRuns:     intInput(input.Parsed, "max_runs"),
	})
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	result := tools.NewJSONResult(job)
	result.Content = fmt.Sprintf("Created workflow %q (id=%s). It's active now and will fire on the next matching inbound message.", job.Name, job.ID)
	return result, nil
}

func (t *CreateWorkflowTool) Description(_ context.Context) (string, error) {
	return t.Definition().Description, nil
}
func (t *CreateWorkflowTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}
func (t *CreateWorkflowTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t *CreateWorkflowTool) IsConcurrencySafe(_ map[string]any) bool { return true }
func (t *CreateWorkflowTool) IsReadOnly(_ map[string]any) bool        { return false }
func (t *CreateWorkflowTool) IsEnabled() bool                         { return t.backend != nil }
func (t *CreateWorkflowTool) FormatResult(data any) string {
	if s, ok := data.(string); ok {
		return s
	}
	return ""
}
func (t *CreateWorkflowTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

// ─── inbox_list_workflows ───────────────────────────────────────────────────

const ListWorkflowsToolName = "inbox_list_workflows"

type ListWorkflowsTool struct {
	backend *inbox.Service
}

func NewListWorkflowsTool(backend *inbox.Service) *ListWorkflowsTool {
	return &ListWorkflowsTool{backend: backend}
}

func (t *ListWorkflowsTool) Definition() tools.Definition {
	return tools.Definition{
		Name:        ListWorkflowsToolName,
		DisplayName: "List Inbox Workflows",
		Description: "List the standing automation rules already created for this user's inbox, including whether each is still active and how many times it has fired. Check this before creating a new rule, to avoid creating a duplicate of one that already exists.",
		Category:    "inbox",
		InputSchema: tools.FromMap(map[string]any{
			"type":       "object",
			"properties": map[string]any{},
		}),
		IsReadOnly:         true,
		IsConcurrencySafe:  true,
		RequiresPermission: false,
	}
}

func (t *ListWorkflowsTool) Call(ctx context.Context, _ tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	principal, err := principalFromContext(ctx)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	jobs, err := t.backend.ListWorkflows(ctx, principal)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	result := tools.NewJSONResult(jobs)
	result.Content = fmt.Sprintf("%d workflow(s).", len(jobs))
	return result, nil
}

func (t *ListWorkflowsTool) Description(_ context.Context) (string, error) {
	return t.Definition().Description, nil
}
func (t *ListWorkflowsTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}
func (t *ListWorkflowsTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t *ListWorkflowsTool) IsConcurrencySafe(_ map[string]any) bool { return true }
func (t *ListWorkflowsTool) IsReadOnly(_ map[string]any) bool        { return true }
func (t *ListWorkflowsTool) IsEnabled() bool                         { return t.backend != nil }
func (t *ListWorkflowsTool) FormatResult(data any) string {
	if s, ok := data.(string); ok {
		return s
	}
	return ""
}
func (t *ListWorkflowsTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

// ─── inbox_delete_workflow ──────────────────────────────────────────────────

const DeleteWorkflowToolName = "inbox_delete_workflow"

type DeleteWorkflowTool struct {
	backend *inbox.Service
}

func NewDeleteWorkflowTool(backend *inbox.Service) *DeleteWorkflowTool {
	return &DeleteWorkflowTool{backend: backend}
}

func (t *DeleteWorkflowTool) Definition() tools.Definition {
	return tools.Definition{
		Name:        DeleteWorkflowToolName,
		DisplayName: "Delete Inbox Workflow",
		Description: "Permanently delete a standing inbox automation rule by ID (from inbox_list_workflows). There's no separate edit tool - to change a rule, delete it and create a new one with inbox_create_workflow.",
		Category:    "inbox",
		InputSchema: tools.FromMap(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"workflow_id": map[string]any{
					"type":        "string",
					"description": "The workflow ID, as returned by inbox_list_workflows or inbox_create_workflow.",
				},
			},
			"required": []string{"workflow_id"},
		}),
		IsReadOnly:         false,
		IsConcurrencySafe:  true,
		RequiresPermission: false,
	}
}

func (t *DeleteWorkflowTool) Call(ctx context.Context, input tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	principal, err := principalFromContext(ctx)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	workflowID := stringInput(input.Parsed, "workflow_id")
	if workflowID == "" {
		return tools.NewErrorResult(fmt.Errorf("workflow_id is required")), nil
	}
	if err := t.backend.DeleteWorkflow(ctx, principal, workflowID); err != nil {
		return tools.NewErrorResult(err), nil
	}
	result := tools.NewJSONResult(map[string]any{"deleted": workflowID})
	result.Content = fmt.Sprintf("Deleted workflow %s.", workflowID)
	return result, nil
}

func (t *DeleteWorkflowTool) Description(_ context.Context) (string, error) {
	return t.Definition().Description, nil
}
func (t *DeleteWorkflowTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}
func (t *DeleteWorkflowTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t *DeleteWorkflowTool) IsConcurrencySafe(_ map[string]any) bool { return true }
func (t *DeleteWorkflowTool) IsReadOnly(_ map[string]any) bool        { return false }
func (t *DeleteWorkflowTool) IsEnabled() bool                         { return t.backend != nil }
func (t *DeleteWorkflowTool) FormatResult(data any) string {
	if s, ok := data.(string); ok {
		return s
	}
	return ""
}
func (t *DeleteWorkflowTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

var (
	_ tools.Tool = (*CreateWorkflowTool)(nil)
	_ tools.Tool = (*ListWorkflowsTool)(nil)
	_ tools.Tool = (*DeleteWorkflowTool)(nil)
)
