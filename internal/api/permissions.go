package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/nexus-engine/pkg/types"
	backendquery "github.com/EngineerProjects/nexus_ai/internal/query"
)

func (app *App) handlePermissionDecision(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok || principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	toolUseID := strings.TrimPrefix(r.URL.Path, "/permissions/")
	if toolUseID == "" {
		writeJSONError(w, http.StatusBadRequest, "tool_use_id is required")
		return
	}
	var body struct {
		Approved  bool   `json:"approved"`
		SessionID string `json:"session_id"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	if app.permBroker == nil {
		writeJSONError(w, http.StatusNotFound, "no pending permission for this tool_use_id")
		return
	}
	sessionID := strings.TrimSpace(body.SessionID)
	if sessionID == "" {
		writeJSONError(w, http.StatusBadRequest, "session_id is required")
		return
	}
	switch app.permBroker.Resolve(toolUseID, principal.User.ID, sessionID, body.Approved) {
	case backendquery.BrokerResolveResolved:
		w.WriteHeader(http.StatusNoContent)
	case backendquery.BrokerResolveForbidden:
		writeJSONError(w, http.StatusForbidden, "pending permission belongs to another user or session")
	default:
		writeJSONError(w, http.StatusNotFound, "no pending permission for this tool_use_id")
	}
}

func (app *App) handlePromptResponse(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok || principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	promptID := strings.TrimPrefix(r.URL.Path, "/prompts/")
	if promptID == "" {
		writeJSONError(w, http.StatusBadRequest, "prompt_id is required")
		return
	}
	var body struct {
		Value     any            `json:"value"`
		Cancelled bool           `json:"cancelled"`
		Metadata  map[string]any `json:"metadata"`
		SessionID string         `json:"session_id"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	if app.promptBroker == nil {
		writeJSONError(w, http.StatusNotFound, "no pending prompt for this prompt_id")
		return
	}
	sessionID := strings.TrimSpace(body.SessionID)
	if sessionID == "" {
		writeJSONError(w, http.StatusBadRequest, "session_id is required")
		return
	}
	switch app.promptBroker.Resolve(promptID, principal.User.ID, sessionID, types.PromptResponse{
		Value:     body.Value,
		Cancelled: body.Cancelled,
		Metadata:  body.Metadata,
	}) {
	case backendquery.BrokerResolveResolved:
		w.WriteHeader(http.StatusNoContent)
	case backendquery.BrokerResolveForbidden:
		writeJSONError(w, http.StatusForbidden, "pending prompt belongs to another user or session")
	default:
		writeJSONError(w, http.StatusNotFound, "no pending prompt for this prompt_id")
	}
}
