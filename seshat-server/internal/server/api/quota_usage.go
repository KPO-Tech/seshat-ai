package api

import "net/http"

func writeQuotasError(w http.ResponseWriter, err error) { writeControlPlaneError(w, err) }

type incrementUsageRequest struct {
	Metric string `json:"metric"`
	Delta  int64  `json:"delta"`
}

// handleQuotaUsage — GET /api/v1/users/me/quota-usage. Self-service only,
// see quotas.Service's doc comment.
func (app *App) handleQuotaUsage(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	summary, err := app.backend.Quotas.GetUsage(r.Context(), principal)
	if err != nil {
		writeQuotasError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

// handleQuotaUsageIncrement — POST /api/v1/users/me/quota-usage/increment.
func (app *App) handleQuotaUsageIncrement(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req incrementUsageRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if err := app.backend.Quotas.Increment(r.Context(), principal, req.Metric, req.Delta); err != nil {
		writeQuotasError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
