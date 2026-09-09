package api

import "net/http"

type testConnectionRequest struct {
	OrganizationID string         `json:"organization_id"`
	NodeType       string         `json:"node_type"`
	Parameters     map[string]any `json:"parameters"`
}

// handleDataflowTestConnection — POST /api/v1/dataflow/test-connection.
// Verifies a node's own secretRef-based connection (Tier 3.5) without
// requiring the rest of its parameters to be filled in - see
// automation.Service.TestNodeConnection's doc comment. A failed connection
// attempt is still a 200 (ConnectionTestResult{OK:false, Message:...}) - the
// test genuinely ran and reported what happened, same convention
// handleDataflowTestRun already uses. Only a request-level problem (bad org,
// permission denied, unknown node type, a node type with no connection to
// test) is a 4xx.
func (app *App) handleDataflowTestConnection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	var req testConnectionRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if req.NodeType == "" {
		writeJSONError(w, http.StatusBadRequest, "node_type is required")
		return
	}
	result, err := app.backend.Automation.TestNodeConnection(r.Context(), principal, req.OrganizationID, req.NodeType, req.Parameters)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}
