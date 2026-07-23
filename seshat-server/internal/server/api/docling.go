package api

import "net/http"

// handleDoclingStatus — GET /api/v1/platform/docling-status. Platform admin
// only, read-only: docling-serve is a shared server-wide setting (see
// automation.Service.DoclingStatus), not something any organization
// configures for itself.
func (app *App) handleDoclingStatus(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	configured, url, err := app.backend.Automation.DoclingStatus(principal)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"configured": configured, "url": url})
}
