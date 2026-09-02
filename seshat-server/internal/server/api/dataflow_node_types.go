package api

import "net/http"

// handleDataflowNodeTypes — GET /api/v1/dataflow/node-types. Lists the node
// types a Job.Graph on this deployment can reference (see
// automation.Service.NodeTypes), so a graph-building UI can populate its
// node palette from what's actually registered instead of a hand-maintained
// list that can drift out of sync. Any authenticated principal can read
// this - it's static catalog metadata (type/name/description/category), not
// per-organization or sensitive, unlike the jobs/secrets it's used to
// configure.
func (app *App) handleDataflowNodeTypes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if _, ok := authPrincipalFromContext(r.Context()); !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	nodeTypes := app.backend.Automation.NodeTypes()
	writeJSON(w, http.StatusOK, map[string]any{"node_types": nodeTypes, "count": len(nodeTypes)})
}
