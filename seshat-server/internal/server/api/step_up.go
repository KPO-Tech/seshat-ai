package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

type stepUpPasswordRequest struct {
	CurrentPassword string `json:"current_password"`
}

// handleStepUpPassword — POST /api/v1/auth/step-up/password. Re-proves the
// caller's identity for their own already-existing session without
// rotating any credential or issuing a new session - see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 9. A caller
// whose account has no password they know (OIDC/SAML/SCIM-provisioned,
// never used "forgot password") gets ErrUnauthorized here just like a wrong
// password would, and needs the OIDC/SAML step-up path instead.
func (app *App) handleStepUpPassword(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req stepUpPasswordRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if err := app.backend.IAM.StepUpWithPassword(r.Context(), principal, iam.StepUpParams{
		CurrentPassword: req.CurrentPassword,
	}); err != nil {
		writeIAMError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleOIDCStepUpStart — GET /api/v1/auth/step-up/oidc/{providerID}/start?redirect_uri=...
// (authenticated, unlike handleOIDCLoginStart - a step-up elevates an
// EXISTING session, so there must already be one). Reuses the existing
// /auth/oidc/{providerID}/callback route for its completion - see
// iam.Service.BeginOIDCStepUp's doc comment on why no new callback route is
// needed.
func (app *App) handleOIDCStepUpStart(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	providerID := strings.TrimSpace(r.PathValue("providerID"))
	redirectURI := strings.TrimSpace(r.URL.Query().Get("redirect_uri"))
	authorizeURL, err := app.backend.IAM.BeginOIDCStepUp(r.Context(), principal, providerID, redirectURI)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"authorization_url": authorizeURL})
}

// handleSAMLStepUpStart — GET /api/v1/auth/step-up/saml/{providerID}/start?redirect_uri=...
// (authenticated). Reuses the existing /auth/saml/{providerID}/acs route
// for its completion - see iam.Service.BeginSAMLStepUp's doc comment.
func (app *App) handleSAMLStepUpStart(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	providerID := strings.TrimSpace(r.PathValue("providerID"))
	redirectURI := strings.TrimSpace(r.URL.Query().Get("redirect_uri"))
	ssoURL, err := app.backend.IAM.BeginSAMLStepUp(r.Context(), principal, providerID, redirectURI)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"authorization_url": ssoURL})
}
