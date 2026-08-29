package api

import (
	"net/http"
	"strings"
)

// handleSAMLLoginStart — GET /api/v1/auth/saml/{providerID}/start?redirect_uri=...
// (public, rate-limited like /auth/login). Redirects the browser to the
// identity provider's own SSO endpoint. See iam.Service.BeginSAMLLogin for
// the redirect_uri (loopback-only) and provider validation this performs.
func (app *App) handleSAMLLoginStart(w http.ResponseWriter, r *http.Request) {
	providerID := strings.TrimSpace(r.PathValue("providerID"))
	redirectURI := strings.TrimSpace(r.URL.Query().Get("redirect_uri"))
	ssoURL, err := app.backend.IAM.BeginSAMLLogin(r.Context(), providerID, redirectURI)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	http.Redirect(w, r, ssoURL, http.StatusFound)
}

// handleSAMLMetadata — GET /api/v1/auth/saml/{providerID}/metadata (public,
// no auth: contains no secret, just this server's SP entity id and ACS URL
// for the given provider — see iam.Service.SAMLServiceProviderMetadata).
// Most IdPs import this document directly instead of an admin retyping the
// ACS URL by hand.
func (app *App) handleSAMLMetadata(w http.ResponseWriter, r *http.Request) {
	providerID := strings.TrimSpace(r.PathValue("providerID"))
	xmlBytes, err := app.backend.IAM.SAMLServiceProviderMetadata(r.Context(), providerID)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/samlmetadata+xml")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(xmlBytes)
}
