package api

import (
	"net/http"
	"strings"
)

// handleOIDCLoginStart — GET /api/v1/auth/oidc/{providerID}/start?redirect_uri=...
// (public, rate-limited like /auth/login). Redirects the browser to the
// identity provider's own authorization endpoint. See
// iam.Service.BeginOIDCLogin for the redirect_uri (loopback-only) and
// provider validation this performs.
func (app *App) handleOIDCLoginStart(w http.ResponseWriter, r *http.Request) {
	providerID := strings.TrimSpace(r.PathValue("providerID"))
	redirectURI := strings.TrimSpace(r.URL.Query().Get("redirect_uri"))
	authorizeURL, err := app.backend.IAM.BeginOIDCLogin(r.Context(), providerID, redirectURI)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	http.Redirect(w, r, authorizeURL, http.StatusFound)
}

// handleOIDCLoginCallback — GET /api/v1/auth/oidc/{providerID}/callback?code=...&state=...
// (public, rate-limited like /auth/login). Errors here render as a plain
// JSON response rather than a redirect: the caller's redirect_uri can't be
// recovered once CompleteOIDCLogin fails (the state row, the only place it
// was stored, is single-use and already consumed by then) — a bare error
// response is simpler and no worse for the caller than a browser tab that
// never lands anywhere, which is already a failure mode it has to handle.
func (app *App) handleOIDCLoginCallback(w http.ResponseWriter, r *http.Request) {
	providerID := strings.TrimSpace(r.PathValue("providerID"))
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	redirectURL, err := app.backend.IAM.CompleteOIDCLogin(r.Context(), providerID, code, state)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	http.Redirect(w, r, redirectURL, http.StatusFound)
}
