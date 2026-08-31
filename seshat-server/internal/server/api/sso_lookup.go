package api

import "net/http"

type ssoLookupRequest struct {
	Email string `json:"email"`
}

// handleSSOLookup — POST /api/v1/auth/sso-lookup (public, rate-limited like
// /auth/login). Pre-authentication discovery step for
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 9bis - lets
// seshat-console's login page offer "Continue with {IdP}" before the
// visitor sees a password field. Returns {} (never an error) when nothing
// matches, so a missing match looks identical to any other unmatched email
// - see iam.Service.LookupSSOProviderForEmail's own doc comment.
func (app *App) handleSSOLookup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req ssoLookupRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	match, err := app.backend.IAM.LookupSSOProviderForEmail(r.Context(), req.Email)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	if match == nil {
		writeJSON(w, http.StatusOK, map[string]any{})
		return
	}
	writeJSON(w, http.StatusOK, match)
}
