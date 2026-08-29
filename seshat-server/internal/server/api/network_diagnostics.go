package api

import (
	"net/http"
	"strings"
)

// handleNetworkDiagnostics — GET /api/v1/network-diagnostics?organization_id=.
// Runs a live connectivity probe against this server's own outbound
// dependencies (SMTP relay, enabled SSO providers) for the given
// organization - the server-side half of
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 6. See
// iam.Service.RunNetworkDiagnostics.
func (app *App) handleNetworkDiagnostics(w http.ResponseWriter, r *http.Request) {
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
	result, err := app.backend.IAM.RunNetworkDiagnostics(r.Context(), principal, organizationID)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}
