package api

import (
	"net/http"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

type bootstrapRequest struct {
	Email            string `json:"email"`
	Password         string `json:"password"`
	DisplayName      string `json:"display_name"`
	OrganizationName string `json:"organization_name"`
	OrganizationSlug string `json:"organization_slug"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type registerRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

type forgotPasswordRequest struct {
	Email string `json:"email"`
}

type resetPasswordRequest struct {
	Token       string `json:"token"`
	NewPassword string `json:"new_password"`
}

func (app *App) handleBootstrapStatus(w http.ResponseWriter, r *http.Request) {
	initialized, err := app.backend.IAM.BootstrapStatus(r.Context())
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"initialized": initialized})
}

func (app *App) handleBootstrap(w http.ResponseWriter, r *http.Request) {
	var req bootstrapRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	result, err := app.backend.IAM.Bootstrap(r.Context(), iam.BootstrapParams{
		Email:            req.Email,
		Password:         req.Password,
		DisplayName:      req.DisplayName,
		OrganizationName: req.OrganizationName,
		OrganizationSlug: req.OrganizationSlug,
	})
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

func (app *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	result, err := app.backend.IAM.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// handleRegister — POST /api/v1/auth/register (public, rate-limited).
// Self-service account creation; see iam.Service.Register for the
// domain-matched auto-join-as-pending behavior.
func (app *App) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	result, err := app.backend.IAM.Register(r.Context(), iam.RegisterParams{
		Email:       req.Email,
		Password:    req.Password,
		DisplayName: req.DisplayName,
	})
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

// handleForgotPassword — POST /api/v1/auth/forgot-password (public,
// rate-limited). Always returns 200 with the same generic body regardless
// of whether the email matches an account - see iam.Service.ForgotPassword.
func (app *App) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req forgotPasswordRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if err := app.backend.IAM.ForgotPassword(r.Context(), req.Email); err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "If that email is registered, a reset link has been sent."})
}

// handleResetPassword — POST /api/v1/auth/reset-password (public,
// rate-limited). No authentication required - the token itself is the
// credential.
func (app *App) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	var req resetPasswordRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if err := app.backend.IAM.ResetPassword(r.Context(), req.Token, req.NewPassword); err != nil {
		writeIAMError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (app *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if err := app.backend.IAM.Logout(r.Context(), principal); err != nil {
		writeIAMError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (app *App) handleMe(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	// /auth/me returns the caller's full account context, not a paginated
	// view — a generous limit stands in for "everything", since one user's
	// own organization count is never large enough to need real paging.
	organizations, _, err := app.backend.IAM.ListOrganizations(r.Context(), principal, sdb.ListParams{Sort: "name", Order: "asc", Limit: 1000})
	if err != nil {
		writeIAMError(w, err)
		return
	}
	session := principal.Session
	session.Token = ""
	writeJSON(w, http.StatusOK, map[string]any{
		"user":          principal.User,
		"memberships":   principal.Memberships,
		"organizations": organizations,
		"session":       session,
	})
}
