package api

import (
	"net/http"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

type testRunRequest struct {
	OrganizationID string               `json:"organization_id"`
	Graph          *dataflow.Definition `json:"graph"`
	Seed           []map[string]any     `json:"seed"`
}

// handleDataflowTestRun — POST /api/v1/dataflow/test-run. Runs a caller-
// supplied graph (or ancestor-closure sub-graph of it - see the graph
// editor's own "test this node") immediately and returns the full result,
// without creating any JobRun/NodeTrace row - see
// automation.Service.TestRunGraph's doc comment. A per-node failure inside
// the returned Result (result.success: false, that node's own error) is
// still a 200 - the test genuinely ran and reported what happened. Only a
// request-level problem (bad org, permission denied, malformed graph
// structure, no registry configured) is a 4xx.
func (app *App) handleDataflowTestRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	var req testRunRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if req.Graph == nil {
		writeJSONError(w, http.StatusBadRequest, "graph is required")
		return
	}
	result, err := app.backend.Automation.TestRunGraph(r.Context(), principal, req.OrganizationID, *req.Graph, req.Seed)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}
