package api

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/connectors"
)

// createConnectorAccountRequest covers every connector kind's fields in one
// shape - only "s3" and "azureblob" are accepted here (see
// handleConnectorAccounts), gdrive/sharepoint are reserved for the OAuth
// flow (see docs/architecture.md's "Example: Knowledge connectors").
type createConnectorAccountRequest struct {
	OrganizationID      string `json:"organization_id"`
	CorpusID            string `json:"corpus_id"`
	Kind                string `json:"kind"`
	DisplayName         string `json:"display_name"`
	Bucket              string `json:"bucket"`
	Region              string `json:"region"`
	Endpoint            string `json:"endpoint"`
	Prefix              string `json:"prefix"`
	AccessKeyID         string `json:"access_key_id"`
	SecretAccessKey     string `json:"secret_access_key"`
	AccountName         string `json:"account_name"`
	Container           string `json:"container"`
	AccountKey          string `json:"account_key"`
	SyncIntervalSeconds int    `json:"sync_interval_seconds"`
}

func (app *App) handleConnectorAccounts(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		accounts, err := app.backend.Connectors.ListAccounts(r.Context(), principal, organizationID)
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"connector_accounts": accounts, "count": len(accounts)})
	case http.MethodPost:
		var req createConnectorAccountRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		kind := strings.TrimSpace(strings.ToLower(req.Kind))
		if kind == "" {
			kind = "s3"
		}
		var (
			account *connectors.ConnectorAccount
			err     error
		)
		switch kind {
		case "s3":
			account, err = app.backend.Connectors.CreateS3Account(r.Context(), principal, connectors.CreateS3AccountParams{
				OrganizationID:      req.OrganizationID,
				CorpusID:            req.CorpusID,
				DisplayName:         req.DisplayName,
				Bucket:              req.Bucket,
				Region:              req.Region,
				Endpoint:            req.Endpoint,
				Prefix:              req.Prefix,
				AccessKeyID:         req.AccessKeyID,
				SecretAccessKey:     req.SecretAccessKey,
				SyncIntervalSeconds: req.SyncIntervalSeconds,
			})
		case "azureblob":
			account, err = app.backend.Connectors.CreateAzureBlobAccount(r.Context(), principal, connectors.CreateAzureBlobAccountParams{
				OrganizationID:      req.OrganizationID,
				CorpusID:            req.CorpusID,
				DisplayName:         req.DisplayName,
				AccountName:         req.AccountName,
				Container:           req.Container,
				Prefix:              req.Prefix,
				AccountKey:          req.AccountKey,
				SyncIntervalSeconds: req.SyncIntervalSeconds,
			})
		default:
			writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("unsupported connector kind %q here - \"gdrive\"/\"sharepoint\" accounts are created via POST /api/v1/connectors/{kind}/oauth/start, not this endpoint", kind))
			return
		}
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, account)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// updateConnectorAccountRequest mirrors createConnectorAccountRequest minus
// organization_id/corpus_id/kind - the same "same shape minus the
// create-only, immutable fields" *UpdateInput convention used elsewhere in
// this app (see ROADMAP.md, 2026-07-12). Which fields apply depends on the
// existing account's own kind, not this request - unknown fields for that
// kind are simply ignored, same as connectors.Service.UpdateAccount itself.
type updateConnectorAccountRequest struct {
	DisplayName         string `json:"display_name"`
	Bucket              string `json:"bucket"`
	Region              string `json:"region"`
	Endpoint            string `json:"endpoint"`
	Prefix              string `json:"prefix"`
	AccessKeyID         string `json:"access_key_id"`
	SecretAccessKey     string `json:"secret_access_key"`
	AccountName         string `json:"account_name"`
	Container           string `json:"container"`
	AccountKey          string `json:"account_key"`
	SyncIntervalSeconds int    `json:"sync_interval_seconds"`
}

func (app *App) handleConnectorAccountByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	accountID := strings.TrimSpace(r.PathValue("accountID"))
	if accountID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing connector account id")
		return
	}

	switch r.Method {
	case http.MethodPut:
		var req updateConnectorAccountRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		account, err := app.backend.Connectors.UpdateAccount(r.Context(), principal, accountID, connectors.UpdateAccountParams{
			DisplayName:         req.DisplayName,
			Bucket:              req.Bucket,
			Region:              req.Region,
			Endpoint:            req.Endpoint,
			Prefix:              req.Prefix,
			AccessKeyID:         req.AccessKeyID,
			SecretAccessKey:     req.SecretAccessKey,
			AccountName:         req.AccountName,
			Container:           req.Container,
			AccountKey:          req.AccountKey,
			SyncIntervalSeconds: req.SyncIntervalSeconds,
		})
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, account)
	case http.MethodDelete:
		if err := app.backend.Connectors.DeleteAccount(r.Context(), principal, accountID); err != nil {
			writeKnowledgeError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleConnectorAccountSync queues an immediate sync, on top of the
// account's own periodic SyncIntervalSeconds schedule.
func (app *App) handleConnectorAccountSync(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	accountID := strings.TrimSpace(r.PathValue("accountID"))
	if accountID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing connector account id")
		return
	}
	job, err := app.backend.Connectors.TriggerSync(r.Context(), principal, accountID)
	if err != nil {
		writeKnowledgeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (app *App) handleConnectorAccountSyncJobs(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	accountID := strings.TrimSpace(r.PathValue("accountID"))
	if accountID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing connector account id")
		return
	}

	switch r.Method {
	case http.MethodGet:
		jobs, err := app.backend.Connectors.ListSyncJobs(r.Context(), principal, accountID)
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"sync_jobs": jobs, "count": len(jobs)})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleMyConnectorAccounts is the self-service counterpart to
// handleConnectorAccounts - scoped to the calling principal's own
// agent_action-purposed accounts, reachable by any org member (see
// connectors.Service.ListMyAccounts/DeleteMyAccount).
func (app *App) handleMyConnectorAccounts(w http.ResponseWriter, r *http.Request) {
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
	accounts, err := app.backend.Connectors.ListMyAccounts(r.Context(), principal, organizationID)
	if err != nil {
		writeKnowledgeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"connector_accounts": accounts, "count": len(accounts)})
}

func (app *App) handleMyConnectorAccountByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	accountID := strings.TrimSpace(r.PathValue("accountID"))
	if accountID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing connector account id")
		return
	}
	switch r.Method {
	case http.MethodDelete:
		if err := app.backend.Connectors.DeleteMyAccount(r.Context(), principal, accountID); err != nil {
			writeKnowledgeError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// ─── OAuth app registration + connect flow (gdrive/sharepoint) ───────────

type registerOAuthAppRequest struct {
	OrganizationID string `json:"organization_id"`
	ClientID       string `json:"client_id"`
	ClientSecret   string `json:"client_secret"`
}

func (app *App) handleConnectorOAuthApps(w http.ResponseWriter, r *http.Request) {
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
	apps, err := app.backend.Connectors.ListOAuthApps(r.Context(), principal, organizationID)
	if err != nil {
		writeKnowledgeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"oauth_apps": apps, "count": len(apps)})
}

func (app *App) handleConnectorOAuthAppByKind(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodPut {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	kind := strings.TrimSpace(r.PathValue("kind"))
	var req registerOAuthAppRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	oauthApp, err := app.backend.Connectors.RegisterOAuthApp(r.Context(), principal, connectors.RegisterOAuthAppParams{
		OrganizationID: req.OrganizationID,
		Kind:           kind,
		ClientID:       req.ClientID,
		ClientSecret:   req.ClientSecret,
	})
	if err != nil {
		writeKnowledgeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, oauthApp)
}

type beginConnectorOAuthRequest struct {
	OrganizationID string `json:"organization_id"`
	CorpusID       string `json:"corpus_id"`
	// Purpose selects "knowledge_sync" (default, admin-run, corpus-attached)
	// vs "agent_action" (self-service, any org member connects their own
	// account, no corpus) - see connectors.BeginConnectorOAuth's doc comment.
	Purpose             string `json:"purpose"`
	DisplayName         string `json:"display_name"`
	SyncIntervalSeconds int    `json:"sync_interval_seconds"`
}

// handleConnectorOAuthStart returns the URL the console opens in a new tab
// to start a gdrive/sharepoint "connect an account" flow - JSON response
// (not a redirect), since this is called from an authenticated SPA.
func (app *App) handleConnectorOAuthStart(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	kind := strings.TrimSpace(r.PathValue("kind"))
	var req beginConnectorOAuthRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	authorizationURL, err := app.backend.Connectors.BeginConnectorOAuth(r.Context(), principal, kind, connectors.BeginOAuthParams{
		OrganizationID:      req.OrganizationID,
		CorpusID:            req.CorpusID,
		Purpose:             req.Purpose,
		DisplayName:         req.DisplayName,
		SyncIntervalSeconds: req.SyncIntervalSeconds,
	})
	if err != nil {
		writeKnowledgeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"authorization_url": authorizationURL})
}

// handleConnectorOAuthCallback handles the identity provider's redirect
// back after the user grants (or denies) access - public, unauthenticated
// (the redirect carries no bearer token), trust comes from the single-use
// signed state instead. Responds with a small HTML page rather than JSON,
// since this loads directly in the browser tab the console opened.
func (app *App) handleConnectorOAuthCallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	kind := strings.TrimSpace(r.PathValue("kind"))
	query := r.URL.Query()
	if errMsg := query.Get("error"); errMsg != "" {
		writeConnectorOAuthResultPage(w, false, "The identity provider reported an error: "+errMsg)
		return
	}
	code := query.Get("code")
	state := query.Get("state")
	if code == "" || state == "" {
		writeConnectorOAuthResultPage(w, false, "Missing authorization code or state.")
		return
	}
	account, err := app.backend.Connectors.CompleteConnectorOAuth(r.Context(), kind, code, state)
	if err != nil {
		writeConnectorOAuthResultPage(w, false, err.Error())
		return
	}
	writeConnectorOAuthResultPage(w, true, fmt.Sprintf("Connected %s. You can close this tab and return to Seshat.", account.DisplayName))
}

// writeConnectorOAuthResultPage renders a minimal, dependency-free HTML
// page - this response loads directly in the browser tab the console
// opened for the OAuth flow, not consumed by the console's own JS.
func writeConnectorOAuthResultPage(w http.ResponseWriter, success bool, message string) {
	title := "Connection failed"
	if success {
		title = "Connected"
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>%s</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#2F2E34;color:#F5F3F0}
div{max-width:420px;text-align:center;padding:24px}</style></head>
<body><div><h2>%s</h2><p>%s</p></div></body></html>`, title, title, message)
}
