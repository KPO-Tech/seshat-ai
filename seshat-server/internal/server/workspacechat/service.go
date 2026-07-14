// Package workspacechat is the real, connected-to-an-LLM implementation of
// the console's personal "Workspace > Chat" screen (see
// seshat-console/src/features/workspaceChat) — a user-scoped playground for
// trying providers/models/tools before they're used elsewhere. It reuses the
// exact same LLM execution engine as automation's cloud-run executor
// (sdk.Client/sdk.Session), just invoked synchronously against a live HTTP
// request instead of the async job scheduler, with real-time tool-call
// progress and text streamed back to the caller as it happens.
package workspacechat

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"time"

	sdkproviders "github.com/EngineerProjects/seshat/pkg/providers"
	"github.com/EngineerProjects/seshat/pkg/sdk"
	sdktypes "github.com/EngineerProjects/seshat/pkg/types"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/apperr"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/automation"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/websearchsettings"
)

// sessionIdleTimeout is how long an unused chat session keeps its
// underlying sdk.Client (and the LLM-side conversation history it holds in
// memory) alive. This is a personal experimentation surface, not a durable
// conversation store — see workspaceChat/transport.ts's own note that
// "persistent conversation sessions are optional, not required".
const sessionIdleTimeout = 2 * time.Hour

// Service owns the in-memory registry of live chat sessions (one
// sdk.Client+sdk.Session per browser conversation) and resolves the
// credentials/tools each one needs from the rest of the control plane.
type Service struct {
	db         *sdb.DB
	iam        *iam.Service
	automation *automation.Service
	webSearch  *websearchsettings.Service
	knowledge  *knowledge.Service
	doclingURL string

	mu       sync.Mutex
	sessions map[string]*chatSession
}

type chatSession struct {
	client     *sdk.Client
	sdkSession *sdk.Session
	provider   string
	model      string
	lastUsed   time.Time
}

func New(database *sdb.DB, iamService *iam.Service, automationService *automation.Service, webSearchService *websearchsettings.Service, knowledgeService *knowledge.Service, doclingURL string) *Service {
	return &Service{
		db: database, iam: iamService, automation: automationService,
		webSearch: webSearchService, knowledge: knowledgeService, doclingURL: doclingURL,
		sessions: make(map[string]*chatSession),
	}
}

// StreamChatParams is one message submitted to a (possibly already running)
// chat session.
type StreamChatParams struct {
	SessionID      string
	OrganizationID string
	Provider       string
	Model          string
	CorpusID       string
	Message        string
}

type EventType string

const (
	EventTextDelta     EventType = "text_delta"
	EventThinkingDelta EventType = "thinking_delta"
	EventToolProgress  EventType = "tool_progress"
	EventDone          EventType = "done"
	EventError         EventType = "error"
)

// Event is one line of the streamed response - the API layer marshals these
// to JSON, one per line, over a plain chunked HTTP response (not strict SSE,
// so a normal fetch()+ReadableStream reader on the console side is enough).
type Event struct {
	Type    EventType          `json:"type"`
	Delta   string             `json:"delta,omitempty"`
	Tool    *ToolProgressEvent `json:"tool,omitempty"`
	Message string             `json:"message,omitempty"`
}

type ToolProgressEvent struct {
	Name      string          `json:"name"`
	ToolUseID string          `json:"tool_use_id"`
	Stage     string          `json:"stage"` // pending | running | completed | failed
	Summary   string          `json:"summary,omitempty"`
	Query     string          `json:"query,omitempty"`
	WebSearch *WebSearchTrace `json:"web_search,omitempty"`
}

type WebSearchTrace struct {
	Query   string         `json:"query"`
	Results []WebSearchHit `json:"results,omitempty"`
	Count   int            `json:"count"`
}

type WebSearchHit struct {
	Title       string `json:"title"`
	URL         string `json:"url"`
	Description string `json:"description,omitempty"`
	Source      string `json:"source,omitempty"`
}

// StreamChat resolves this organization's provider/web-search/RAG
// credentials, gets (or starts) the sdk.Session for sessionID, submits the
// message, and calls emit for every text/thinking delta and tool-progress
// event as they happen, finishing with EventDone or EventError. emit is
// called synchronously from the same goroutine as StreamChat - the caller
// (the HTTP handler) is expected to write+flush each event immediately.
func (s *Service) StreamChat(ctx context.Context, principal *iam.Principal, params StreamChatParams, emit func(Event)) error {
	if principal == nil {
		return apperr.Unauthorized("authentication required")
	}
	params.SessionID = strings.TrimSpace(params.SessionID)
	params.OrganizationID = strings.TrimSpace(params.OrganizationID)
	params.Provider = strings.ToLower(strings.TrimSpace(params.Provider))
	params.Model = strings.TrimSpace(params.Model)
	params.Message = strings.TrimSpace(params.Message)
	if params.SessionID == "" || params.OrganizationID == "" || params.Provider == "" || params.Model == "" || params.Message == "" {
		return apperr.InvalidInput("session_id, organization_id, provider, model and message are required")
	}

	allowed, err := s.iam.CanAccessOrganization(s.db.Gorm().WithContext(ctx), principal, params.OrganizationID)
	if err != nil {
		return err
	}
	if !allowed {
		return apperr.Forbidden("not a member of this organization")
	}

	sess, err := s.getOrCreateSession(ctx, principal, params)
	if err != nil {
		return err
	}

	sess.SetResponseChunkFn(func(chunk sdk.ResponseChunk) {
		if chunk.Delta == "" {
			return
		}
		if chunk.DeltaType == "thinking_delta" {
			emit(Event{Type: EventThinkingDelta, Delta: chunk.Delta})
			return
		}
		emit(Event{Type: EventTextDelta, Delta: chunk.Delta})
	})
	sess.SetProgressFn(func(progress sdk.ToolProgress) {
		emit(Event{Type: EventToolProgress, Tool: toToolProgressEvent(progress)})
	})

	resp, err := sess.SubmitMessage(ctx, params.Message)
	if err != nil {
		emit(Event{Type: EventError, Message: err.Error()})
		return nil
	}

	for _, entry := range buildWebSearchEnrichments(resp) {
		emit(Event{Type: EventToolProgress, Tool: entry})
	}

	emit(Event{Type: EventDone})
	return nil
}

func (s *Service) getOrCreateSession(ctx context.Context, principal *iam.Principal, params StreamChatParams) (*sdk.Session, error) {
	s.mu.Lock()
	if existing, ok := s.sessions[params.SessionID]; ok && existing.provider == params.Provider && existing.model == params.Model {
		existing.lastUsed = time.Now()
		s.mu.Unlock()
		return existing.sdkSession, nil
	}
	s.mu.Unlock()

	resolved, err := s.automation.ResolveProviderSetting(ctx, principal, params.OrganizationID, params.Provider)
	if err != nil {
		return nil, err
	}
	webSearchKeys, err := s.webSearch.ResolveAllProviderKeys(ctx, principal, params.OrganizationID)
	if err != nil {
		return nil, err
	}
	// Best-effort, same as automation.cloud_execution.go: an org with no
	// embedder configured (org or platform default) just runs without
	// rag_search/rag_ingest available, not a reason to fail the whole chat.
	ragService, _, _ := s.knowledge.RAGServiceForOrganization(ctx, params.OrganizationID)

	providerConfig := &sdkproviders.Config{Provider: sdktypes.APIProvider(resolved.Provider), APIKey: resolved.APIKey}
	if resolved.BaseURL != "" {
		providerConfig.BaseURL = resolved.BaseURL
	}

	client, err := sdk.NewClient(&sdk.ClientConfig{
		APIKey:                 resolved.APIKey,
		Model:                  sdk.ModelIdentifier{Provider: sdktypes.APIProvider(params.Provider), Model: params.Model},
		PermissionMode:         sdk.PermissionModeBypass,
		MaxTokens:              4096,
		AutoCompact:            true,
		PersistSessions:        false,
		DisableTitleGeneration: true,
		EnableMemory:           false,
		EnableHooks:            false,
		EnableMonitoring:       false,
		ProviderConfig:         providerConfig,
		WebSearchKeys:          webSearchKeys,
		RAGService:             ragService,
		DoclingURL:             s.doclingURL,
	})
	if err != nil {
		return nil, err
	}
	sdkSession, err := client.CreateSession(ctx)
	if err != nil {
		client.Close()
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if old, ok := s.sessions[params.SessionID]; ok {
		old.client.Close()
	}
	s.sessions[params.SessionID] = &chatSession{
		client: client, sdkSession: sdkSession,
		provider: params.Provider, model: params.Model, lastUsed: time.Now(),
	}
	s.evictStaleLocked()
	return sdkSession, nil
}

// evictStaleLocked closes and drops any session untouched for longer than
// sessionIdleTimeout. Called with s.mu already held, piggybacking on the
// next session creation rather than running a background goroutine.
func (s *Service) evictStaleLocked() {
	cutoff := time.Now().Add(-sessionIdleTimeout)
	for id, sess := range s.sessions {
		if sess.lastUsed.Before(cutoff) {
			sess.client.Close()
			delete(s.sessions, id)
		}
	}
}

func toToolProgressEvent(progress sdk.ToolProgress) *ToolProgressEvent {
	event := &ToolProgressEvent{
		Name:      progress.ToolName,
		ToolUseID: progress.ToolUseID,
		Stage:     string(progress.Stage),
		Summary:   progress.Message,
	}
	if progress.Metadata == nil {
		return event
	}
	if query, ok := progress.Metadata["tool_input"].(map[string]any); ok {
		if q, ok := query["query"].(string); ok {
			event.Query = q
		}
	}
	if content, ok := progress.Metadata["content"].(string); ok && content != "" {
		event.Summary = truncate(content, 400)
	}
	return event
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

// buildWebSearchEnrichments re-derives a completed tool_progress event for
// every web_search call in resp with its fully structured results (title/
// url/description), using SessionResponse.ToolUses/ToolResults - populated
// together, index-aligned, once the whole turn finishes (see
// seshat/internal/engine/loop.go). The console upserts trace entries by
// tool_use_id, so this simply replaces the plain-text summary emitted live
// by toToolProgressEvent with the richer structured card.
func buildWebSearchEnrichments(resp *sdk.SessionResponse) []*ToolProgressEvent {
	if resp == nil {
		return nil
	}
	var entries []*ToolProgressEvent
	for i, use := range resp.ToolUses {
		if use.Name != "web_search" || i >= len(resp.ToolResults) {
			continue
		}
		result := resp.ToolResults[i]
		if result.Error != nil {
			continue
		}
		trace, ok := parseWebSearchData(result.Data)
		if !ok {
			continue
		}
		entries = append(entries, &ToolProgressEvent{
			Name: use.Name, ToolUseID: use.ID, Stage: "completed",
			Query: trace.Query, WebSearch: trace,
		})
	}
	return entries
}

// parseWebSearchData reads result.Data for a web_search CallResult. Data
// arrives here as the concrete internal/web.SearchResponse Go struct (this
// is an in-process call, not a JSON API boundary) - internal/web is an
// unexported package seshat-server can't statically import, but every field
// is exported with no json tags, so a marshal/unmarshal round-trip through
// a locally-defined struct with matching field names works.
func parseWebSearchData(data any) (*WebSearchTrace, bool) {
	if data == nil {
		return nil, false
	}
	raw, err := json.Marshal(data)
	if err != nil {
		return nil, false
	}
	var payload struct {
		Query   string
		Results []struct {
			Title       string
			URL         string
			Description string
			Source      string
		}
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, false
	}
	trace := &WebSearchTrace{Query: payload.Query}
	for _, r := range payload.Results {
		trace.Results = append(trace.Results, WebSearchHit{Title: r.Title, URL: r.URL, Description: r.Description, Source: r.Source})
	}
	trace.Count = len(trace.Results)
	return trace, trace.Query != "" || trace.Count > 0
}
