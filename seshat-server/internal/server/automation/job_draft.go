package automation

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	sdkproviders "github.com/KPO-Tech/seshat/pkg/providers"
	sdktypes "github.com/KPO-Tech/seshat/pkg/types"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// JobDraft is what DraftJob returns - the schedule/prompt shape a natural-
// language request maps to. Deliberately does NOT include ExecutionTarget,
// ModelOverride, or an agent selection - picking *who runs the job* stays a
// frontend concern (keyword-matched agent, saved provider/model
// preference), orthogonal to understanding the schedule and writing the
// instruction, which is what this one-shot call is for.
type JobDraft struct {
	Name                string     `json:"name"`
	Description         string     `json:"description,omitempty"`
	TriggerType         string     `json:"trigger_type"`
	CronExpr            string     `json:"cron_expr,omitempty"`
	IntervalSeconds     int        `json:"interval_seconds,omitempty"`
	RunAt               *time.Time `json:"run_at,omitempty"`
	WebhookMethod       string     `json:"webhook_method,omitempty"`
	WebhookResponseMode string     `json:"webhook_response_mode,omitempty"`
	Prompt              string     `json:"prompt"`
}

const draftJobTimeout = 30 * time.Second

// jobDraftSystemPrompt models docs/helps-verified precedent: seshat's own
// engine.generateTitleAsync (title generation) and seshat-backend's
// internal/memory/longterm extractor both call providers.Client.CreateMessage
// directly - one system+user prompt, no tools, no session - for exactly this
// "ask the model for one small JSON object" shape. Same style of prompt here.
const jobDraftSystemPromptTemplate = `You turn a short natural-language request into a scheduled job definition.

Today's date and time (UTC): %s

Return ONLY a JSON object — no prose, no markdown fences.

Format (strictly):
{
  "name": "short title, under 60 chars",
  "description": "one sentence describing what this job does",
  "trigger_type": "cron" | "interval" | "once" | "webhook",
  "cron_expr": "5-field cron expression, only when trigger_type is cron",
  "interval_seconds": integer, only when trigger_type is interval (minimum 60),
  "run_at": "RFC3339 UTC datetime, only when trigger_type is once",
  "webhook_method": "GET" | "POST" | "PUT" | "PATCH" | "DELETE", only when trigger_type is webhook (default POST),
  "webhook_response_mode": "immediate" | "whenFinished", only when trigger_type is webhook (default immediate),
  "prompt": "the actual instruction this job's agent will execute every time it runs, written as a clear directive"
}

Guidelines:
- Prefer "cron" for anything recurring on a schedule (daily, weekly, "every Monday at 8").
- Use "interval" only for a fixed repeating period ("every hour", "every 30 minutes") with no specific time of day.
- Use "once" only when the request is clearly a single, non-repeating run.
- Use "webhook" only when the request describes reacting to an external event/call, not a time-based schedule.
- Resolve relative dates/times ("tomorrow", "next Friday", "in the morning") against today's date above.
- "prompt" must be self-contained: a future run has no memory of this conversation, so include everything the agent needs to know to do the task.
- Include only the trigger fields relevant to the chosen trigger_type; omit the rest.
- If the request is ambiguous, make the most reasonable choice - never ask a clarifying question, always return a complete draft.`

// DraftJob turns a natural-language request into a JobDraft via one
// providers.Client.CreateMessage call - deliberately NOT sdk.NewClient/
// sdk.Session: no tools, no permission mode, no sandbox, no conversation
// history. provider is a provider type string (e.g. "anthropic"), resolved
// by the caller the same way any other org-scoped provider choice is
// (ResolveProviderSetting requires a non-empty provider - there is no
// org-default shortcut at that layer).
func (s *Service) DraftJob(ctx context.Context, principal *iam.Principal, organizationID, provider, naturalLanguage string) (*JobDraft, error) {
	naturalLanguage = strings.TrimSpace(naturalLanguage)
	if naturalLanguage == "" {
		return nil, ErrInvalidInput("request is required")
	}

	resolved, err := s.ResolveProviderSetting(ctx, principal, organizationID, provider)
	if err != nil {
		return nil, err
	}

	providerConfig := &sdkproviders.Config{Provider: sdktypes.APIProvider(resolved.Provider), APIKey: resolved.APIKey}
	if resolved.BaseURL != "" {
		providerConfig.BaseURL = resolved.BaseURL
	}
	client := sdkproviders.NewClientWithConfig(resolved.APIKey, providerConfig)

	draftCtx, cancel := context.WithTimeout(ctx, draftJobTimeout)
	defer cancel()

	req := sdktypes.APIRequest{
		Model:        sdktypes.ModelIdentifier{Provider: sdktypes.APIProvider(resolved.Provider), Model: resolved.DefaultModel},
		SystemPrompt: fmt.Sprintf(jobDraftSystemPromptTemplate, time.Now().UTC().Format(time.RFC3339)),
		Messages:     []sdktypes.Message{sdktypes.UserMessage("draft-req", naturalLanguage)},
		MaxTokens:    500,
	}
	resp, err := client.CreateMessage(draftCtx, req)
	if err != nil {
		return nil, fmt.Errorf("draft job: LLM call: %w", err)
	}
	if resp == nil {
		return nil, fmt.Errorf("draft job: nil response from LLM")
	}

	draft, err := parseJobDraftResponse(flattenTextContent(resp.Content))
	if err != nil {
		return nil, fmt.Errorf("draft job: %w", err)
	}
	return draft, nil
}

// parseJobDraftResponse and its helpers mirror
// internal/memory/longterm/extractor.go's ParseLLMResponse pattern in the
// sibling seshat SDK repo (not importable here - internal/ package in a
// different module) - tolerant of markdown fences and surrounding prose,
// but unlike that best-effort/errors-swallowed extractor, this call is
// synchronous in an HTTP request path so a parse failure must be a real
// error, not silently dropped.
func parseJobDraftResponse(raw string) (*JobDraft, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, fmt.Errorf("empty response from LLM")
	}
	raw = stripMarkdownFence(raw)

	start := strings.Index(raw, "{")
	end := strings.LastIndex(raw, "}")
	if start < 0 || end < start {
		return nil, fmt.Errorf("no JSON object found in LLM response")
	}
	raw = raw[start : end+1]

	var draft JobDraft
	if err := json.Unmarshal([]byte(raw), &draft); err != nil {
		return nil, fmt.Errorf("parse job draft JSON: %w", err)
	}
	draft.Name = strings.TrimSpace(draft.Name)
	draft.Prompt = strings.TrimSpace(draft.Prompt)
	if draft.Name == "" || draft.Prompt == "" || draft.TriggerType == "" {
		return nil, fmt.Errorf("job draft is missing required fields (name/trigger_type/prompt)")
	}
	return &draft, nil
}

func flattenTextContent(blocks []sdktypes.ContentBlock) string {
	var sb strings.Builder
	for _, b := range blocks {
		if tc, ok := b.(sdktypes.TextContent); ok {
			sb.WriteString(tc.Text)
		}
	}
	return sb.String()
}

// stripMarkdownFence removes ```json ... ``` or ``` ... ``` wrappers.
func stripMarkdownFence(s string) string {
	s = strings.TrimSpace(s)
	for _, fence := range []string{"```json", "```"} {
		if strings.HasPrefix(s, fence) {
			s = strings.TrimPrefix(s, fence)
			if idx := strings.LastIndex(s, "```"); idx >= 0 {
				s = s[:idx]
			}
			return strings.TrimSpace(s)
		}
	}
	return s
}
