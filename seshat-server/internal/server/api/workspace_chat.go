package api

import (
	"encoding/json"
	"net/http"
	"strings"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/workspacechat"
)

type workspaceChatStreamRequest struct {
	SessionID      string `json:"session_id"`
	OrganizationID string `json:"organization_id"`
	Provider       string `json:"provider"`
	Model          string `json:"model"`
	CorpusID       string `json:"corpus_id"`
	Message        string `json:"message"`
}

// handleWorkspaceChatStream — POST /api/v1/users/me/workspace/chat/stream.
// Streams newline-delimited JSON events (not strict SSE, so a plain
// fetch()+ReadableStream reader on the console side is enough - no need for
// EventSource's GET-only limitation). Every event after the first is only
// ever reached once workspacechat.Service.StreamChat has already resolved
// credentials and started the SDK session, so a non-nil returned error here
// always means nothing has been written yet and a normal JSON error
// response (with a real status code) is still safe to send.
func (app *App) handleWorkspaceChatStream(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	var req workspaceChatStreamRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}

	flusher, canFlush := w.(http.Flusher)
	encoder := json.NewEncoder(w)
	emit := func(event workspacechat.Event) {
		_ = encoder.Encode(event)
		if canFlush {
			flusher.Flush()
		}
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")

	err := app.backend.WorkspaceChat.StreamChat(r.Context(), principal, workspacechat.StreamChatParams{
		SessionID:      req.SessionID,
		OrganizationID: req.OrganizationID,
		Provider:       req.Provider,
		Model:          req.Model,
		CorpusID:       req.CorpusID,
		Message:        req.Message,
	}, emit)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
}

// handleWorkspaceChatSession — GET /api/v1/users/me/workspace/chat/sessions/{sessionID}.
// Lets the console reload a conversation after a refresh; a 404 means either
// the session never existed or has aged past workspacechat's 48h retention -
// the caller can't tell the difference and just starts a fresh session either way.
func (app *App) handleWorkspaceChatSession(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	sessionID := strings.TrimSpace(r.PathValue("sessionID"))
	if sessionID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing session id")
		return
	}

	history, err := app.backend.WorkspaceChat.GetSession(r.Context(), principal, sessionID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, history)
}

// handleWorkspaceChatSessions — GET /api/v1/workspace-chat/sessions.
// The admin-visibility counterpart to handleWorkspaceChatSession above:
// metadata (who, when, how many messages) across every member of an
// organization, not any one person's own full conversation - message
// bodies are deliberately not exposed here, only via the owner-scoped
// GET .../sessions/{sessionID} above (that endpoint has no admin-override
// path at all, by design - see workspacechat.Service.GetSession).
func (app *App) handleWorkspaceChatSessions(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
	query, err := parseListQuery(r, "updated_at", "desc")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	sessions, total, err := app.backend.WorkspaceChat.ListSessions(r.Context(), principal, organizationID, sdb.ListParams{
		Search: query.Search,
		Sort:   query.Sort,
		Order:  query.Order,
		Limit:  query.Limit,
		Offset: query.Offset,
	})
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeListResponse(w, http.StatusOK, "sessions", sessions, query, int(total))
}
