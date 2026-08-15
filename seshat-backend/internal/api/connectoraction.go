package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/connector"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

type connectManualAccountRequest struct {
	DisplayName       string `json:"display_name"`
	ExternalAccountID string `json:"external_account_id"`
	AccessToken       string `json:"access_token"`
}

// handleConnectorsDispatch handles every /connectors/{kind}/... route.
// Registered as a single prefix (mirroring handleSkillsDispatch's pattern
// in skills_manage.go, this codebase's established convention for
// path-segment routing rather than Go 1.22 {param} mux patterns) since
// {kind} sits in the middle of the path:
//   - POST /connectors/{kind}/accounts            -> handleConnectorAccounts
//   - POST /connectors/{kind}/accounts/{id}/act    -> handleConnectorAccountAct
func (a *App) handleConnectorsDispatch(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.Trim(strings.TrimPrefix(r.URL.Path, "/connectors/"), "/")
	parts := strings.Split(trimmed, "/")
	kind := parts[0]

	switch {
	case len(parts) == 2 && parts[1] == "accounts":
		a.handleConnectorAccounts(w, r, kind)
	case len(parts) == 4 && parts[1] == "accounts" && parts[3] == "act":
		a.handleConnectorAccountAct(w, r, kind, parts[2])
	default:
		writeJSONError(w, http.StatusNotFound, "not found")
	}
}

// handleConnectorAccounts handles POST /connectors/{kind}/accounts - manual
// (non-OAuth) account connection: the caller already has a static
// credential (an API key/bearer token, as most MCP servers use) rather
// than an authorization-code flow to run. Distinct from Drive/Gmail's
// OAuth start/callback pair, which this deliberately does not replicate -
// see internal/mcpaction's doc comment for why a static token fits an
// MCP-backed ActionConnector's actual auth shape.
func (a *App) handleConnectorAccounts(w http.ResponseWriter, r *http.Request, kind string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if a.backend.ConnectorAccounts == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "connector accounts are not configured")
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if kind == "" {
		writeJSONError(w, http.StatusBadRequest, "kind is required")
		return
	}
	var req connectManualAccountRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.AccessToken) == "" {
		writeJSONError(w, http.StatusBadRequest, "access_token is required")
		return
	}

	accounts := a.backend.ConnectorAccounts
	record, err := accounts.Create(r.Context(), db.CreateConnectorAccountParams{
		UserID:            principal.User.ID,
		Kind:              kind,
		DisplayName:       req.DisplayName,
		ExternalAccountID: req.ExternalAccountID,
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to create connector account: "+err.Error())
		return
	}
	if _, err := accounts.UpdateConnected(r.Context(), db.UpdateConnectorAccountConnectedParams{
		ID:                record.ID,
		DisplayName:       req.DisplayName,
		ExternalAccountID: req.ExternalAccountID,
		AccessToken:       req.AccessToken,
	}); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to save connector credentials: "+err.Error())
		return
	}
	updated, err := accounts.GetByID(r.Context(), record.ID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, connectorAccountToResponse(*updated))
}

type actRequest struct {
	Action  string         `json:"action"`
	Payload map[string]any `json:"payload"`
}

// handleConnectorAccountAct handles
// POST /connectors/{kind}/accounts/{accountID}/act - the Action-connector
// counterpart of Drive's manual sync trigger
// (handleKnowledgeGDriveAccountSync): a single deterministic call to
// connector.ActionConnector.Act, symmetric with how Sync is triggered for
// a KnowledgeConnector.
func (a *App) handleConnectorAccountAct(w http.ResponseWriter, r *http.Request, kind, accountID string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if a.backend.ConnectorAccounts == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "connector accounts are not configured")
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if kind == "" || accountID == "" {
		writeJSONError(w, http.StatusBadRequest, "kind and account id are required")
		return
	}
	actionConnector, ok := a.backend.ActionConnectors[kind]
	if !ok {
		writeJSONError(w, http.StatusNotFound, "no action connector configured for kind "+kind)
		return
	}

	var req actRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Action) == "" {
		writeJSONError(w, http.StatusBadRequest, "action is required")
		return
	}

	accounts := a.backend.ConnectorAccounts
	account, err := accounts.GetByID(r.Context(), accountID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "connector account not found")
		return
	}
	if account.UserID != principal.User.ID {
		writeJSONError(w, http.StatusForbidden, "connector account belongs to another user")
		return
	}
	secret, err := accounts.GetSecret(r.Context(), accountID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to load connector credentials")
		return
	}

	result, err := actionConnector.Act(r.Context(), connector.Account{
		ID:     account.ID,
		UserID: account.UserID,
		Status: account.Status,
	}, connector.Secret{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		ExpiresAt:    secret.ExpiresAt,
	}, req.Action, req.Payload)
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, "action failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}
