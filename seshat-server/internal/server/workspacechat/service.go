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
	"errors"
	"log"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"

	sdkproviders "github.com/KPO-Tech/seshat/pkg/providers"
	"github.com/KPO-Tech/seshat/pkg/sdk"
	sdktypes "github.com/KPO-Tech/seshat/pkg/types"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/apperr"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/automation"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mcpregistry"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/websearchsettings"
)

// sessionIdleTimeout is how long an unused chat session keeps its
// underlying sdk.Client (and the LLM-side conversation history it holds in
// memory) alive. Deliberately much shorter than sessionRetention — by the
// time a persisted conversation is old enough to be purged, its in-memory
// SDK client has always already been evicted here, so the two mechanisms
// never need to coordinate.
const sessionIdleTimeout = 2 * time.Hour

// sessionRetention is how long a persisted conversation (see persistTurn,
// GetSession, and Cleanup) is kept before it's treated as gone. This is a
// personal experimentation surface, not a durable conversation store — see
// workspaceChat/transport.ts's own note that "persistent conversation
// sessions are optional, not required": bluntly deleting everything past a
// fixed window is deliberately simpler than any per-conversation retention
// policy.
const sessionRetention = 48 * time.Hour

// Service owns the in-memory registry of live chat sessions (one
// sdk.Client+sdk.Session per browser conversation) and resolves the
// credentials/tools each one needs from the rest of the control plane.
type Service struct {
	db          *sdb.DB
	iam         *iam.Service
	automation  *automation.Service
	webSearch   *websearchsettings.Service
	knowledge   *knowledge.Service
	mcpRegistry *mcpregistry.Service
	doclingURL  string
	sdkSessions *sdkSessionBackend

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

func New(database *sdb.DB, iamService *iam.Service, automationService *automation.Service, webSearchService *websearchsettings.Service, knowledgeService *knowledge.Service, mcpRegistryService *mcpregistry.Service, doclingURL string) *Service {
	return &Service{
		db: database, iam: iamService, automation: automationService,
		webSearch: webSearchService, knowledge: knowledgeService, mcpRegistry: mcpRegistryService, doclingURL: doclingURL,
		sdkSessions: newSDKSessionBackend(database),
		sessions:    make(map[string]*chatSession),
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
	Name       string          `json:"name"`
	ToolUseID  string          `json:"tool_use_id"`
	Stage      string          `json:"stage"` // pending | running | completed | failed
	Summary    string          `json:"summary,omitempty"`
	Query      string          `json:"query,omitempty"`
	Input      map[string]any  `json:"input,omitempty"`
	Result     string          `json:"result,omitempty"`
	DurationMs int64           `json:"duration_ms,omitempty"`
	WebSearch  *WebSearchTrace `json:"web_search,omitempty"`
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

	// Recorded verbatim (Done excluded, it carries no replayable state) so
	// this turn can be persisted and later replayed through the console's
	// own event reducer on reload - see persistTurn.
	var recordedEvents []Event
	var answerText strings.Builder
	record := func(e Event) {
		recordedEvents = append(recordedEvents, e)
		if e.Type == EventTextDelta {
			answerText.WriteString(e.Delta)
		}
		emit(e)
	}

	sess.SetResponseChunkFn(func(chunk sdk.ResponseChunk) {
		if chunk.Delta == "" {
			return
		}
		if chunk.DeltaType == "thinking_delta" {
			record(Event{Type: EventThinkingDelta, Delta: chunk.Delta})
			return
		}
		record(Event{Type: EventTextDelta, Delta: chunk.Delta})
	})
	sess.SetProgressFn(func(progress sdk.ToolProgress) {
		record(Event{Type: EventToolProgress, Tool: toToolProgressEvent(progress)})
	})

	resp, err := sess.SubmitMessage(ctx, params.Message)
	if err != nil {
		record(Event{Type: EventError, Message: err.Error()})
		s.persistTurn(ctx, principal, params, answerText.String(), recordedEvents)
		return nil
	}

	for _, entry := range buildWebSearchEnrichments(resp) {
		record(Event{Type: EventToolProgress, Tool: entry})
	}

	emit(Event{Type: EventDone})
	s.persistTurn(ctx, principal, params, answerText.String(), recordedEvents)
	return nil
}

// persistTurn saves the user's message and the assistant's recorded events
// for this turn, creating the session row on its first message. Best-effort
// like the RAG/web-search credential lookups above - a persistence failure
// doesn't fail (or even surface an error on) an otherwise-successful chat
// turn the caller already received.
func (s *Service) persistTurn(ctx context.Context, principal *iam.Principal, params StreamChatParams, answerText string, events []Event) {
	err := s.db.Gorm().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		now := time.Now().UTC()
		var session sdb.WorkspaceChatSession
		err := tx.Where("id = ?", params.SessionID).First(&session).Error
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			session = sdb.WorkspaceChatSession{
				ID: params.SessionID, UserID: principal.User.ID, OrganizationID: params.OrganizationID,
				Title: truncate(params.Message, 72), CreatedAt: now, UpdatedAt: now,
			}
			if err := tx.Create(&session).Error; err != nil {
				return err
			}
		case err != nil:
			return err
		default:
			if err := tx.Model(&session).Update("updated_at", now).Error; err != nil {
				return err
			}
		}

		userMsgID, err := sdb.NewID("wchatmsg")
		if err != nil {
			return err
		}
		if err := tx.Create(&sdb.WorkspaceChatMessageRecord{
			ID: userMsgID, SessionID: session.ID, Role: "user", Content: params.Message, CreatedAt: now,
		}).Error; err != nil {
			return err
		}

		eventsJSON, err := json.Marshal(events)
		if err != nil {
			return err
		}
		assistantMsgID, err := sdb.NewID("wchatmsg")
		if err != nil {
			return err
		}
		return tx.Create(&sdb.WorkspaceChatMessageRecord{
			ID: assistantMsgID, SessionID: session.ID, Role: "assistant",
			Content: answerText, EventsJSON: string(eventsJSON), CreatedAt: now,
		}).Error
	})
	if err != nil {
		log.Printf("[workspacechat] persist turn failed: %v", err)
	}
}

// SessionSummary is one row of an organization's workspace chat sessions,
// for the admin-visibility list (see ListSessions) - metadata only, not the
// owning member's own full message replay (that's SessionHistory/GetSession,
// owner-scoped for the personal Workspace > Chat screen itself).
type SessionSummary struct {
	ID              string    `json:"id"`
	UserID          string    `json:"user_id"`
	UserEmail       string    `json:"user_email"`
	UserDisplayName string    `json:"user_display_name"`
	Title           string    `json:"title"`
	MessageCount    int       `json:"message_count"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

var sessionSortFields = map[string]sdb.SortField{
	"created_at": {Column: "workspace_chat_sessions.created_at", Tiebreak: "workspace_chat_sessions.id"},
	"updated_at": {Column: "workspace_chat_sessions.updated_at", Tiebreak: "workspace_chat_sessions.id"},
	"title":      {Column: "workspace_chat_sessions.title", Tiebreak: "workspace_chat_sessions.id"},
}

var sessionSearchColumns = []string{"workspace_chat_sessions.title", "users.email", "users.display_name"}

// ListSessions returns a page of organizationID's workspace chat sessions
// across every member, newest-activity first by default - an admin-
// visibility surface, unlike GetSession's owner-scoped single-session
// lookup. Requires organization.manage, not the plain org-membership check
// GetSession uses, since this exposes other people's session metadata (not
// message content - see handleListWorkspaceChatSessions's own doc comment
// on why message bodies stay out of this endpoint). Sessions past
// sessionRetention are excluded, matching GetSession/purgeExpiredSessions'
// own "gone once past the window" convention - the row may not even be
// purged from the DB yet, but it's already meaningless to list.
func (s *Service) ListSessions(ctx context.Context, principal *iam.Principal, organizationID string, listParams sdb.ListParams) ([]SessionSummary, int64, error) {
	if principal == nil {
		return nil, 0, apperr.Unauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, 0, apperr.InvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "organization.manage"); err != nil {
			return nil, 0, err
		}
	}

	tx := s.db.Gorm().WithContext(ctx)
	cutoff := time.Now().UTC().Add(-sessionRetention)
	query := tx.Table("workspace_chat_sessions").
		Select("workspace_chat_sessions.id AS id, workspace_chat_sessions.user_id AS user_id, "+
			"users.email AS user_email, users.display_name AS user_display_name, "+
			"workspace_chat_sessions.title AS title, workspace_chat_sessions.created_at AS created_at, "+
			"workspace_chat_sessions.updated_at AS updated_at, "+
			"(SELECT COUNT(*) FROM workspace_chat_message_records WHERE workspace_chat_message_records.session_id = workspace_chat_sessions.id) AS message_count").
		Joins("JOIN users ON users.id = workspace_chat_sessions.user_id").
		Where("workspace_chat_sessions.organization_id = ? AND workspace_chat_sessions.updated_at > ?", organizationID, cutoff)

	sortField, err := sdb.ResolveSortField(sessionSortFields, listParams.Sort)
	if err != nil {
		return nil, 0, apperr.InvalidInput(err.Error())
	}
	query = sdb.ApplySearch(query, listParams.Search, sessionSearchColumns...)
	query = sdb.ApplySort(query, sortField, listParams.Order)

	return sdb.Page[SessionSummary](query, listParams.Limit, listParams.Offset)
}

// SessionHistory is a previously persisted conversation, ready to replay
// client-side.
type SessionHistory struct {
	ID       string           `json:"id"`
	Title    string           `json:"title"`
	Messages []HistoryMessage `json:"messages"`
}

type HistoryMessage struct {
	Role      string  `json:"role"`
	Content   string  `json:"content"`
	CreatedAt string  `json:"created_at"`
	Events    []Event `json:"events,omitempty"`
}

// GetSession loads a persisted conversation, scoped to its owner - a 404
// covers both "never existed" and "past the 48h retention window" (the
// query filters on updated_at itself, not a separate purge having already
// run), so the console can't tell the two apart and just starts fresh
// either way.
func (s *Service) GetSession(ctx context.Context, principal *iam.Principal, sessionID string) (*SessionHistory, error) {
	if principal == nil {
		return nil, apperr.Unauthorized("authentication required")
	}
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return nil, apperr.InvalidInput("session_id is required")
	}

	tx := s.db.Gorm().WithContext(ctx)
	var session sdb.WorkspaceChatSession
	cutoff := time.Now().UTC().Add(-sessionRetention)
	err := tx.Where("id = ? AND user_id = ? AND updated_at > ?", sessionID, principal.User.ID, cutoff).First(&session).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperr.NotFound("session not found")
		}
		return nil, err
	}

	var records []sdb.WorkspaceChatMessageRecord
	if err := tx.Where("session_id = ?", session.ID).Order("created_at asc").Find(&records).Error; err != nil {
		return nil, err
	}

	messages := make([]HistoryMessage, 0, len(records))
	for _, record := range records {
		msg := HistoryMessage{Role: record.Role, Content: record.Content, CreatedAt: record.CreatedAt.Format(time.RFC3339)}
		if record.EventsJSON != "" {
			var events []Event
			if err := json.Unmarshal([]byte(record.EventsJSON), &events); err == nil {
				msg.Events = events
			}
		}
		messages = append(messages, msg)
	}

	return &SessionHistory{ID: session.ID, Title: session.Title, Messages: messages}, nil
}

// purgeExpiredSessions deletes every session (and its messages) untouched
// for longer than sessionRetention. Called periodically by Cleanup. Also
// deletes the same IDs' rows from sdkSessions (the SDK's own conversation
// memory, see sdksessionstore.go) - without this, that data would outlive
// the WorkspaceChatSession/WorkspaceChatMessageRecord rows it exists to
// keep in sync with, accumulating forever for conversations the UI (and
// GetSession's own retention-window check) already treat as gone.
func (s *Service) purgeExpiredSessions(ctx context.Context) {
	var expiredIDs []string
	err := s.db.Gorm().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		cutoff := time.Now().UTC().Add(-sessionRetention)
		var expired []sdb.WorkspaceChatSession
		if err := tx.Where("updated_at < ?", cutoff).Find(&expired).Error; err != nil {
			return err
		}
		if len(expired) == 0 {
			return nil
		}
		expiredIDs = make([]string, len(expired))
		for i, session := range expired {
			expiredIDs[i] = session.ID
		}
		if err := tx.Where("session_id IN ?", expiredIDs).Delete(&sdb.WorkspaceChatMessageRecord{}).Error; err != nil {
			return err
		}
		return tx.Where("id IN ?", expiredIDs).Delete(&sdb.WorkspaceChatSession{}).Error
	})
	if err != nil {
		log.Printf("[workspacechat] purge expired sessions failed: %v", err)
		return
	}
	if err := s.sdkSessions.deleteSessions(expiredIDs); err != nil {
		log.Printf("[workspacechat] purge expired SDK session state failed: %v", err)
	}
}

// resolveMCPServers converts organizationID's MCP server catalog
// (mcpregistry.ResolveServerConfigs, already personalized for principal -
// see its own doc comment on Bearer-token bridging) into the SDK's own
// config shape. Best-effort like ragService just below in
// getOrCreateSession: an org with no MCP servers, or a resolve error, just
// means the chat runs with none available, not a reason to fail it.
func (s *Service) resolveMCPServers(ctx context.Context, principal *iam.Principal, organizationID string) []sdk.MCPServerConfig {
	if s.mcpRegistry == nil {
		return nil
	}
	resolved, err := s.mcpRegistry.ResolveServerConfigs(ctx, principal, organizationID)
	if err != nil {
		log.Printf("workspacechat: resolve mcp servers for org %s: %v", organizationID, err)
		return nil
	}
	return mcpregistry.ToSDKServerConfigs(resolved)
}

func (s *Service) getOrCreateSession(ctx context.Context, principal *iam.Principal, params StreamChatParams) (*sdk.Session, error) {
	// Resolved before the cache-hit check, and unconditionally on every
	// call, so a long-lived cached session's Bearer tokens (see
	// resolveMCPServers) never go stale mid-conversation - Google/Microsoft
	// access tokens expire well within sessionIdleTimeout's 2h window.
	mcpServers := s.resolveMCPServers(ctx, principal, params.OrganizationID)

	s.mu.Lock()
	if existing, ok := s.sessions[params.SessionID]; ok && existing.provider == params.Provider && existing.model == params.Model {
		existing.lastUsed = time.Now()
		s.mu.Unlock()
		if err := existing.client.ReloadMCPServers(ctx, mcpServers); err != nil {
			log.Printf("workspacechat: reload mcp servers for session %s: %v", params.SessionID, err)
		}
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
		SessionBackend:         s.sdkSessions,
		DisableTitleGeneration: true,
		EnableMemory:           false,
		EnableHooks:            false,
		EnableMonitoring:       false,
		ProviderConfig:         providerConfig,
		WebSearchKeys:          webSearchKeys,
		RAGService:             ragService,
		DoclingURL:             s.doclingURL,
		MCPServers:             mcpServers,
		// This is a multi-tenant server: the bash tool is registered on every
		// sdk.Client with no way to exclude it, and PermissionModeBypass means
		// no human approves each call. Without this, an LLM-invoked shell
		// command would run unconfined on this shared host (Landlock is
		// Linux-only and not guaranteed inside this service's container, and
		// SandboxKindDocker isn't wired up here - no docker.sock is mounted
		// into the seshat-server container in deploy/docker-compose.yml).
		// RequireSandbox makes the tool refuse instead of silently degrading;
		// the LLM sees a normal tool-call error and can tell the user shell
		// access isn't available here.
		RequireSandbox: true,
	})
	if err != nil {
		return nil, err
	}
	sdkSession, err := s.resumeOrCreateSDKSession(ctx, client, params.SessionID)
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

// resumeOrCreateSDKSession restores sessionID's prior conversation via
// sdkSessions (client.LoadSession) before ever starting an empty one - this
// is what makes multi-turn context survive a server restart, an idle
// eviction, or a provider/model switch instead of silently starting over
// each time (see sdksessionstore.go's own doc comment). It never calls
// client.CreateSession (which cannot be told to use a caller-supplied ID -
// see that same doc comment) - ensureSessionExists seeds a fresh, empty
// metadata row on a genuine first turn so LoadSession always has something
// to find, whether that's real prior history or an empty session it just
// created a moment ago.
func (s *Service) resumeOrCreateSDKSession(ctx context.Context, client *sdk.Client, sessionID string) (*sdk.Session, error) {
	sdkSessionID := sdk.SessionID(sessionID)
	if err := s.sdkSessions.ensureSessionExists(sdkSessionID); err != nil {
		return nil, err
	}
	return client.LoadSession(ctx, sdkSessionID)
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

// resultTruncateLimit caps how much of a tool's raw output rides on the
// wire/gets persisted per event - generous enough to show a real bash/RAG/
// MCP result in full most of the time, without letting one pathological
// tool call (e.g. a huge file read) blow up an SSE frame or a
// WorkspaceChatMessageRecord row. Summary keeps its own, much shorter
// truncate(400) for the always-visible collapsed line.
const resultTruncateLimit = 8000

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
	if input, ok := progress.Metadata["tool_input"].(map[string]any); ok {
		event.Input = input
		if q, ok := input["query"].(string); ok {
			event.Query = q
		}
	}
	if content, ok := progress.Metadata["content"].(string); ok && content != "" {
		event.Summary = truncate(content, 400)
		event.Result = truncate(content, resultTruncateLimit)
	}
	if duration, ok := progress.Metadata["execution_duration_ms"].(int64); ok {
		event.DurationMs = duration
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
