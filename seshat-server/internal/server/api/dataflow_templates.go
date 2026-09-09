package api

import "net/http"

// handleDataflowTemplates — GET /api/v1/dataflow/templates. Lists the
// built-in automation templates (Tier 3.3) so the Automation app's Templates
// page can populate its catalogue from what's actually available instead of
// a hand-maintained frontend list. Any authenticated principal can read this
// - it's static catalog metadata, not per-organization or sensitive, same
// posture as handleDataflowNodeTypes.
func (app *App) handleDataflowTemplates(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if _, ok := authPrincipalFromContext(r.Context()); !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	templates := app.backend.Automation.ListTemplates()
	writeJSON(w, http.StatusOK, map[string]any{"templates": templates, "count": len(templates)})
}
