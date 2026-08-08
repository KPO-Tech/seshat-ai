package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inbox"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inboxgmail"
	"golang.org/x/oauth2"
	oauth2api "google.golang.org/api/oauth2/v2"
	"google.golang.org/api/option"
)

const gmailOAuthStateTTL = 10 * time.Minute

type gmailOAuthState struct {
	userID    string
	createdAt time.Time
}

type channelAccountResponse struct {
	ID                string `json:"id"`
	Channel           string `json:"channel"`
	DisplayName       string `json:"display_name"`
	ExternalAccountID string `json:"external_account_id"`
	Status            string `json:"status"`
	LastSyncedAt      int64  `json:"last_synced_at,omitempty"`
	LastError         string `json:"last_error,omitempty"`
	CreatedAt         int64  `json:"created_at"`
}

func channelAccountToResponse(a inbox.ChannelAccount) channelAccountResponse {
	resp := channelAccountResponse{
		ID:                a.ID,
		Channel:           a.Channel,
		DisplayName:       a.DisplayName,
		ExternalAccountID: a.ExternalAccountID,
		Status:            a.Status,
		LastError:         a.LastError,
		CreatedAt:         a.CreatedAt.Unix(),
	}
	if !a.LastSyncedAt.IsZero() {
		resp.LastSyncedAt = a.LastSyncedAt.Unix()
	}
	return resp
}

// handleInboxAccounts handles GET /inbox/accounts
func (a *App) handleInboxAccounts(w http.ResponseWriter, r *http.Request) {
	if a.backend.Inbox == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "inbox is not configured")
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	accounts, err := a.backend.Inbox.ListAccounts(r.Context(), principal)
	if err != nil {
		writeBackendError(w, err)
		return
	}
	items := make([]channelAccountResponse, 0, len(accounts))
	for _, acc := range accounts {
		items = append(items, channelAccountToResponse(acc))
	}
	writeJSON(w, http.StatusOK, map[string]any{"accounts": items, "count": len(items)})
}

// handleInboxAccountByID handles /inbox/accounts/{id} and sub-paths:
//
//	DELETE /inbox/accounts/{id}         → disconnect
//	POST   /inbox/accounts/{id}/sync    → sync now
func (a *App) handleInboxAccountByID(w http.ResponseWriter, r *http.Request) {
	if a.backend.Inbox == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "inbox is not configured")
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	rest := strings.TrimPrefix(r.URL.Path, "/inbox/accounts/")
	rest = strings.Trim(rest, "/")
	if rest == "" {
		writeJSONError(w, http.StatusBadRequest, "account id is required")
		return
	}
	parts := strings.Split(rest, "/")
	accountID := parts[0]

	if len(parts) == 1 {
		if r.Method != http.MethodDelete {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if err := a.backend.Inbox.DisconnectAccount(r.Context(), principal, accountID); err != nil {
			writeBackendError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if len(parts) == 2 && parts[1] == "sync" {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		n, err := a.backend.Inbox.SyncAccount(r.Context(), principal, accountID)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"new_messages": n})
		return
	}

	writeJSONError(w, http.StatusNotFound, "unknown account sub-resource")
}

// handleInboxGmailOAuthStart handles POST /inbox/accounts/gmail/oauth/start.
// Returns an authorization_url the client (Electron main process) opens in
// the system browser - Google's OAuth consent screen for Gmail's restricted
// scopes must run in a real, trusted browser context, not an embedded
// webview.
func (a *App) handleInboxGmailOAuthStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	cfg, err := inboxgmail.BaseOAuthConfig()
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	state, err := randomState()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to generate oauth state")
		return
	}
	a.storeGmailOAuthState(state, principal.User.ID)

	cfgCopy := *cfg
	cfgCopy.RedirectURL = gmailCallbackURL(r)
	authURL := cfgCopy.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.SetAuthURLParam("prompt", "consent"))
	writeJSON(w, http.StatusOK, map[string]any{"authorization_url": authURL})
}

// handleInboxGmailOAuthCallback handles GET /inbox/accounts/gmail/oauth/callback
// - Google redirects the user's browser here after consent. This request
// carries no Authorization header (it's the browser, not the Electron app,
// making it), so the principal comes from the signed state issued in
// handleInboxGmailOAuthStart instead of the usual auth middleware.
func (a *App) handleInboxGmailOAuthCallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	query := r.URL.Query()
	if errMsg := query.Get("error"); errMsg != "" {
		writeGmailOAuthResultPage(w, false, "Google reported an error: "+errMsg)
		return
	}
	code := query.Get("code")
	state := query.Get("state")
	if code == "" || state == "" {
		writeGmailOAuthResultPage(w, false, "Missing authorization code or state.")
		return
	}
	userID, ok := a.takeGmailOAuthState(state)
	if !ok {
		writeGmailOAuthResultPage(w, false, "This authorization link has expired or was already used - please try connecting again.")
		return
	}
	if a.backend.Inbox == nil {
		writeGmailOAuthResultPage(w, false, "Inbox is not configured on this server.")
		return
	}

	cfg, err := inboxgmail.BaseOAuthConfig()
	if err != nil {
		writeGmailOAuthResultPage(w, false, err.Error())
		return
	}
	cfg.RedirectURL = gmailCallbackURL(r)

	token, err := cfg.Exchange(r.Context(), code)
	if err != nil {
		writeGmailOAuthResultPage(w, false, "Failed to exchange authorization code: "+err.Error())
		return
	}
	email, err := fetchGmailAccountEmail(r.Context(), cfg, token)
	if err != nil {
		writeGmailOAuthResultPage(w, false, "Connected to Google, but could not read the account email: "+err.Error())
		return
	}

	principal := &backendauth.Principal{User: backendauth.User{ID: userID}}
	_, err = a.backend.Inbox.ConnectAccount(r.Context(), principal, inbox.ConnectAccountParams{
		Channel:           inbox.ChannelGmail,
		DisplayName:       email,
		ExternalAccountID: email,
		AccessToken:       token.AccessToken,
		RefreshToken:      token.RefreshToken,
		Scope:             strings.Join(inboxgmail.Scopes, " "),
		ExpiresAt:         token.Expiry,
	})
	if err != nil {
		writeGmailOAuthResultPage(w, false, "Failed to save the connected account: "+err.Error())
		return
	}
	writeGmailOAuthResultPage(w, true, fmt.Sprintf("Connected %s. You can close this tab and return to Seshat.", email))
}

func fetchGmailAccountEmail(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
	svc, err := oauth2api.NewService(ctx, option.WithTokenSource(cfg.TokenSource(ctx, token)))
	if err != nil {
		return "", err
	}
	info, err := svc.Userinfo.Get().Context(ctx).Do()
	if err != nil {
		return "", err
	}
	if info.Email == "" {
		return "", fmt.Errorf("no email in userinfo response")
	}
	return info.Email, nil
}

func (a *App) storeGmailOAuthState(state, userID string) {
	a.gmailOAuthMu.Lock()
	defer a.gmailOAuthMu.Unlock()
	a.gmailOAuthStates[state] = gmailOAuthState{userID: userID, createdAt: time.Now()}
	// Opportunistic sweep of expired entries - this map only ever holds as
	// many concurrent entries as there are in-flight OAuth attempts, so a
	// full scan on every new one is cheap.
	for s, st := range a.gmailOAuthStates {
		if time.Since(st.createdAt) > gmailOAuthStateTTL {
			delete(a.gmailOAuthStates, s)
		}
	}
}

func (a *App) takeGmailOAuthState(state string) (string, bool) {
	a.gmailOAuthMu.Lock()
	defer a.gmailOAuthMu.Unlock()
	st, ok := a.gmailOAuthStates[state]
	if !ok {
		return "", false
	}
	delete(a.gmailOAuthStates, state) // single use
	if time.Since(st.createdAt) > gmailOAuthStateTTL {
		return "", false
	}
	return st.userID, true
}

func randomState() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// gmailCallbackURL derives the redirect URI from the incoming request's own
// host:port rather than a fixed config value, since this server's port can
// change if the preferred one was taken (see cmd/api/config.go). Relies on
// the Google Cloud OAuth client being registered as a "Desktop app" type,
// which Google accepts any loopback port for.
func gmailCallbackURL(r *http.Request) string {
	scheme := "http"
	return fmt.Sprintf("%s://%s/api/v1/inbox/accounts/gmail/oauth/callback", scheme, r.Host)
}

func writeGmailOAuthResultPage(w http.ResponseWriter, ok bool, message string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
	}
	title := "Connected"
	if !ok {
		title = "Connection failed"
	}
	fmt.Fprintf(w, `<!doctype html><html><head><meta charset="utf-8"><title>%s</title></head>`+
		`<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:#eee">`+
		`<div style="text-align:center;max-width:420px"><h2>%s</h2><p>%s</p></div></body></html>`,
		title, title, message)
}

// handleInboxWhatsAppPair handles POST /inbox/accounts/whatsapp/pair - an
// SSE stream, unlike Gmail's redirect-based flow, because WhatsApp pairing
// is inherently live: the QR code must be shown to the user and rotates
// periodically until they scan it (see inboxwhatsapp.Manager.PairNewDevice).
// The stream emits "qr" events with each code to render, then a single
// "done" or "error" event before closing.
func (a *App) handleInboxWhatsAppPair(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if a.whatsappManager == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "whatsapp is not configured")
		return
	}
	if a.backend.Inbox == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "inbox is not configured")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSONError(w, http.StatusInternalServerError, "streaming not supported by transport")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	writeSSE := func(event string, payload any) {
		data, err := json.Marshal(payload)
		if err != nil {
			return
		}
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data)
		flusher.Flush()
	}

	client, paired, err := a.whatsappManager.PairNewDevice(r.Context(), func(code string) {
		writeSSE("qr", map[string]string{"code": code})
	})
	if err != nil {
		writeSSE("error", map[string]string{"error": err.Error()})
		return
	}

	account, err := a.backend.Inbox.ConnectAccount(r.Context(), principal, inbox.ConnectAccountParams{
		Channel:           inbox.ChannelWhatsApp,
		DisplayName:       paired.PushName,
		ExternalAccountID: paired.JID,
	})
	if err != nil {
		client.Disconnect()
		writeSSE("error", map[string]string{"error": "paired with WhatsApp but failed to save the account: " + err.Error()})
		return
	}
	a.whatsappManager.Adopt(account.ID, client)

	writeSSE("done", map[string]string{"account_id": account.ID, "display_name": account.DisplayName})
}
