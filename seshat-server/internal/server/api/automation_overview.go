package api

import (
	"net/http"
	"strings"
)

func (app *App) handleAutomationOverview(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
	overview, err := app.backend.Automation.GetOverview(r.Context(), principal, organizationID)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, overview)
}
