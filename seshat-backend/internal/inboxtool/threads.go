// Package inboxtool implements the Inbox Agent's SDK tools (via pkg/tools),
// mirroring internal/knowledgetool's pattern: the calling principal comes
// from context (see internal/auth.FromContext, injected by
// enrichContextWithAgentPrefs), not a constructor argument, since tools are
// registered once, globally, on the shared SDK query client.
package inboxtool

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inbox"
	"github.com/KPO-Tech/seshat/pkg/tools"
)

func principalFromContext(ctx context.Context) (*backendauth.Principal, error) {
	principal, ok := backendauth.FromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no authenticated principal in context")
	}
	return principal, nil
}

func intInput(input map[string]any, key string) int {
	v, ok := input[key]
	if !ok {
		return 0
	}
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case string:
		if i, err := strconv.Atoi(n); err == nil {
			return i
		}
	}
	return 0
}

func stringInput(input map[string]any, key string) string {
	v, _ := input[key].(string)
	return strings.TrimSpace(v)
}

// ─── inbox_list_threads ─────────────────────────────────────────────────────

const ListThreadsToolName = "inbox_list_threads"

type ListThreadsTool struct {
	backend *inbox.Service
}

func NewListThreadsTool(backend *inbox.Service) *ListThreadsTool {
	return &ListThreadsTool{backend: backend}
}

func (t *ListThreadsTool) Definition() tools.Definition {
	return tools.Definition{
		Name:        ListThreadsToolName,
		DisplayName: "List Inbox Threads",
		Description: "List conversation threads across every connected inbox channel (email, WhatsApp), most recently active first. Use this to triage what needs attention. Filter by status to focus on what's actionable: 'open' for anything unhandled (the default triage view), 'escalated' for things flagged for human/another agent's attention, 'snoozed' for deferred items, 'handled' for resolved ones.",
		Category:    "inbox",
		InputSchema: tools.FromMap(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"status": map[string]any{
					"type":        "string",
					"description": "Optional status filter: open, handled, snoozed, or escalated. Omit to list every status.",
					"enum":        []string{inbox.ThreadStatusOpen, inbox.ThreadStatusHandled, inbox.ThreadStatusSnoozed, inbox.ThreadStatusEscalated},
				},
				"limit": map[string]any{
					"type":        "integer",
					"description": "Maximum number of threads to return (default 50).",
					"minimum":     1,
					"maximum":     200,
				},
			},
		}),
		IsReadOnly:         true,
		IsConcurrencySafe:  true,
		RequiresPermission: false,
	}
}

func (t *ListThreadsTool) Call(ctx context.Context, input tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	principal, err := principalFromContext(ctx)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	threads, err := t.backend.ListThreads(ctx, principal, inbox.ListThreadsParams{
		Status: stringInput(input.Parsed, "status"),
		Limit:  intInput(input.Parsed, "limit"),
	})
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	result := tools.NewJSONResult(threads)
	result.Content = formatThreadList(threads)
	result.Metadata = &tools.ResultMetadata{Additional: map[string]any{"count": len(threads)}}
	return result, nil
}

func (t *ListThreadsTool) Description(_ context.Context) (string, error) {
	return t.Definition().Description, nil
}
func (t *ListThreadsTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}
func (t *ListThreadsTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t *ListThreadsTool) IsConcurrencySafe(_ map[string]any) bool { return true }
func (t *ListThreadsTool) IsReadOnly(_ map[string]any) bool        { return true }
func (t *ListThreadsTool) IsEnabled() bool                         { return t.backend != nil }
func (t *ListThreadsTool) FormatResult(data any) string {
	if s, ok := data.(string); ok {
		return s
	}
	if threads, ok := data.([]inbox.Thread); ok {
		return formatThreadList(threads)
	}
	return ""
}
func (t *ListThreadsTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

func formatThreadList(threads []inbox.Thread) string {
	if len(threads) == 0 {
		return "No threads found."
	}
	var sb strings.Builder
	for _, th := range threads {
		contactLabel := th.Contact.DisplayName
		if contactLabel == "" {
			contactLabel = th.Contact.ExternalID
		}
		fmt.Fprintf(&sb, "[%s] %s — %s", th.Status, th.Channel, contactLabel)
		if th.Subject != "" {
			fmt.Fprintf(&sb, " — %q", th.Subject)
		}
		fmt.Fprintf(&sb, "\n  thread_id=%s  last_message_at=%s\n", th.ID, th.LastMessageAt.Format("2006-01-02 15:04"))
	}
	return strings.TrimRight(sb.String(), "\n")
}

// ─── inbox_get_thread ───────────────────────────────────────────────────────

const GetThreadToolName = "inbox_get_thread"

type GetThreadTool struct {
	backend *inbox.Service
}

func NewGetThreadTool(backend *inbox.Service) *GetThreadTool {
	return &GetThreadTool{backend: backend}
}

func (t *GetThreadTool) Definition() tools.Definition {
	return tools.Definition{
		Name:        GetThreadToolName,
		DisplayName: "Get Inbox Thread",
		Description: "Get the full message history of one conversation thread, given a thread_id from inbox_list_threads. Use this before drafting or sending a reply, so the response is grounded in the actual conversation.",
		Category:    "inbox",
		InputSchema: tools.FromMap(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"thread_id": map[string]any{
					"type":        "string",
					"description": "The thread ID, as returned by inbox_list_threads.",
				},
			},
			"required": []string{"thread_id"},
		}),
		IsReadOnly:         true,
		IsConcurrencySafe:  true,
		RequiresPermission: false,
	}
}

type threadWithMessages struct {
	Thread   inbox.Thread    `json:"thread"`
	Messages []inbox.Message `json:"messages"`
}

func (t *GetThreadTool) Call(ctx context.Context, input tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	principal, err := principalFromContext(ctx)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	threadID := stringInput(input.Parsed, "thread_id")
	if threadID == "" {
		return tools.NewErrorResult(fmt.Errorf("thread_id is required")), nil
	}
	thread, messages, err := t.backend.GetThread(ctx, principal, threadID)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	data := threadWithMessages{Thread: *thread, Messages: messages}
	result := tools.NewJSONResult(data)
	result.Content = formatThreadDetail(*thread, messages)
	return result, nil
}

func (t *GetThreadTool) Description(_ context.Context) (string, error) {
	return t.Definition().Description, nil
}
func (t *GetThreadTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}
func (t *GetThreadTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t *GetThreadTool) IsConcurrencySafe(_ map[string]any) bool { return true }
func (t *GetThreadTool) IsReadOnly(_ map[string]any) bool        { return true }
func (t *GetThreadTool) IsEnabled() bool                         { return t.backend != nil }
func (t *GetThreadTool) FormatResult(data any) string {
	if s, ok := data.(string); ok {
		return s
	}
	if d, ok := data.(threadWithMessages); ok {
		return formatThreadDetail(d.Thread, d.Messages)
	}
	return ""
}
func (t *GetThreadTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

func formatThreadDetail(th inbox.Thread, messages []inbox.Message) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Thread with %s (%s), status=%s", th.Contact.DisplayName, th.Channel, th.Status)
	if th.Subject != "" {
		fmt.Fprintf(&sb, ", subject=%q", th.Subject)
	}
	sb.WriteString("\n\n")
	for _, m := range messages {
		who := "them"
		if m.Direction == inbox.MessageDirectionOutbound {
			who = "us"
		}
		draft := ""
		if m.IsDraft {
			draft = " (draft, not sent)"
		}
		fmt.Fprintf(&sb, "[%s]%s %s: %s\n\n", m.SentAt.Format("2006-01-02 15:04"), draft, who, m.BodyText)
	}
	return strings.TrimRight(sb.String(), "\n")
}

// ─── inbox_update_thread_status ─────────────────────────────────────────────

const UpdateThreadStatusToolName = "inbox_update_thread_status"

type UpdateThreadStatusTool struct {
	backend *inbox.Service
}

func NewUpdateThreadStatusTool(backend *inbox.Service) *UpdateThreadStatusTool {
	return &UpdateThreadStatusTool{backend: backend}
}

func (t *UpdateThreadStatusTool) Definition() tools.Definition {
	return tools.Definition{
		Name:        UpdateThreadStatusToolName,
		DisplayName: "Update Inbox Thread Status",
		Description: "Change a thread's triage status. Use 'handled' once a thread needs no further action, 'snoozed' to defer it without marking it done, 'escalated' to flag it as needing a human or another agent's attention (e.g. an invoice thread that should go to the Accounting Agent - use the agent/spawn_agent tool separately to actually hand it off, this tool only flags the thread). A new inbound message automatically reopens a 'handled' thread on its own, so you don't need to reset it back to 'open' manually.",
		Category:    "inbox",
		InputSchema: tools.FromMap(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"thread_id": map[string]any{
					"type":        "string",
					"description": "The thread ID, as returned by inbox_list_threads.",
				},
				"status": map[string]any{
					"type":        "string",
					"description": "The new status.",
					"enum":        []string{inbox.ThreadStatusOpen, inbox.ThreadStatusHandled, inbox.ThreadStatusSnoozed, inbox.ThreadStatusEscalated},
				},
			},
			"required": []string{"thread_id", "status"},
		}),
		IsReadOnly:         false,
		IsConcurrencySafe:  true,
		RequiresPermission: false,
	}
}

func (t *UpdateThreadStatusTool) Call(ctx context.Context, input tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	principal, err := principalFromContext(ctx)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	threadID := stringInput(input.Parsed, "thread_id")
	status := stringInput(input.Parsed, "status")
	if threadID == "" || status == "" {
		return tools.NewErrorResult(fmt.Errorf("thread_id and status are required")), nil
	}
	if err := t.backend.UpdateThreadStatus(ctx, principal, threadID, status); err != nil {
		return tools.NewErrorResult(err), nil
	}
	return tools.NewTextResult(fmt.Sprintf("Thread %s marked as %s.", threadID, status)), nil
}

func (t *UpdateThreadStatusTool) Description(_ context.Context) (string, error) {
	return t.Definition().Description, nil
}
func (t *UpdateThreadStatusTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}
func (t *UpdateThreadStatusTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t *UpdateThreadStatusTool) IsConcurrencySafe(_ map[string]any) bool { return true }
func (t *UpdateThreadStatusTool) IsReadOnly(_ map[string]any) bool        { return false }
func (t *UpdateThreadStatusTool) IsEnabled() bool                         { return t.backend != nil }
func (t *UpdateThreadStatusTool) FormatResult(data any) string {
	if s, ok := data.(string); ok {
		return s
	}
	return ""
}
func (t *UpdateThreadStatusTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

var (
	_ tools.Tool = (*ListThreadsTool)(nil)
	_ tools.Tool = (*GetThreadTool)(nil)
	_ tools.Tool = (*UpdateThreadStatusTool)(nil)
)
