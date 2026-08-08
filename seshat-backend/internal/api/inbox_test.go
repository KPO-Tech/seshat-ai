package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	seshat "github.com/EngineerProjects/seshat-ai/seshat-backend/internal"
	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inbox"
)

// fakeInboxConnector lets these HTTP-layer tests seed a thread/message
// without a real Gmail or WhatsApp connection - the underlying inbox.Service
// logic itself is already covered by internal/inbox and internal/inboxtool's
// own test suites; these tests only need to prove the routing/serialization
// layer works.
type fakeInboxConnector struct {
	channel      string
	syncMessages []inbox.NormalizedMessage
}

func (f *fakeInboxConnector) Channel() string { return f.channel }
func (f *fakeInboxConnector) Sync(_ context.Context, _ *inbox.ChannelAccount, _ inbox.ConnectorSecret) ([]inbox.NormalizedMessage, string, error) {
	return f.syncMessages, "cursor-1", nil
}
func (f *fakeInboxConnector) Send(_ context.Context, _ *inbox.ChannelAccount, _ inbox.ConnectorSecret, _, _, _ string) (string, error) {
	return "sent-1", nil
}

func newInboxTestApp(t *testing.T) (*App, *db.IdentityStore, *inbox.Service) {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "inbox-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	identity, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	if _, err := identity.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@inbox.test",
		AdminPassword:        "adminpass",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Core",
		DefaultWorkspaceSlug: "core",
	}); err != nil {
		t.Fatalf("EnsureBootstrap: %v", err)
	}

	accountStore, err := db.NewChannelAccountStore(database)
	if err != nil {
		t.Fatalf("NewChannelAccountStore: %v", err)
	}
	contactStore, err := db.NewInboxContactStore(database)
	if err != nil {
		t.Fatalf("NewInboxContactStore: %v", err)
	}
	threadStore, err := db.NewInboxThreadStore(database)
	if err != nil {
		t.Fatalf("NewInboxThreadStore: %v", err)
	}
	messageStore, err := db.NewInboxMessageStore(database)
	if err != nil {
		t.Fatalf("NewInboxMessageStore: %v", err)
	}
	inboxService := inbox.NewService(accountStore, contactStore, threadStore, messageStore)

	app := &App{
		backend: seshat.NewApp(seshat.Dependencies{
			Identity: identity,
			Inbox:    inboxService,
		}),
	}
	return app, identity, inboxService
}

// seedInboxThread connects a WhatsApp account and syncs one inbound message
// through it under the given principal, returning the thread ID.
func seedInboxThread(t *testing.T, svc *inbox.Service, userID string) string {
	t.Helper()
	ctx := context.Background()
	principal := &backendauth.Principal{User: backendauth.User{ID: userID}}
	account, err := svc.ConnectAccount(ctx, principal, inbox.ConnectAccountParams{
		Channel:           inbox.ChannelWhatsApp,
		DisplayName:       "Restaurant WhatsApp",
		ExternalAccountID: "15559998888@s.whatsapp.net",
	})
	if err != nil {
		t.Fatalf("ConnectAccount: %v", err)
	}
	connector := &fakeInboxConnector{
		channel: inbox.ChannelWhatsApp,
		syncMessages: []inbox.NormalizedMessage{{
			ExternalThreadID:   "15551234567@s.whatsapp.net",
			ExternalMessageID:  "wa-msg-1",
			Direction:          inbox.MessageDirectionInbound,
			ContactExternalID:  "15551234567@s.whatsapp.net",
			ContactDisplayName: "Restaurant Regular",
			BodyText:           "Table for 4 tonight?",
			SentAt:             time.Now(),
		}},
	}
	svc.RegisterConnector(connector)
	if _, err := svc.SyncAccount(ctx, principal, account.ID); err != nil {
		t.Fatalf("SyncAccount: %v", err)
	}
	threads, err := svc.ListThreads(ctx, principal, inbox.ListThreadsParams{})
	if err != nil {
		t.Fatalf("ListThreads: %v", err)
	}
	if len(threads) != 1 {
		t.Fatalf("expected 1 seeded thread, got %d", len(threads))
	}
	return threads[0].ID
}

func TestInboxThreadsEndToEnd(t *testing.T) {
	app, _, svc := newInboxTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@inbox.test", "adminpass")

	// Resolve the admin's own user ID via the seeded principal used by
	// svc.ConnectAccount below - loginAs already created/authenticated the
	// admin user, and ownership checks are enforced per userID, so the
	// thread must be seeded under that same admin user.
	adminID := adminUserIDFromToken(t, router, token)
	threadID := seedInboxThread(t, svc, adminID)

	// GET /inbox/threads
	req := httptest.NewRequest(http.MethodGet, "/api/v1/inbox/threads", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list threads: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var listResp struct {
		Threads []map[string]any `json:"threads"`
		Count   int              `json:"count"`
	}
	json.NewDecoder(rec.Body).Decode(&listResp)
	if listResp.Count != 1 {
		t.Fatalf("expected 1 thread, got %d", listResp.Count)
	}

	// GET /inbox/threads/{id}
	req = httptest.NewRequest(http.MethodGet, "/api/v1/inbox/threads/"+threadID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get thread: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var detailResp struct {
		Messages []map[string]any `json:"messages"`
	}
	json.NewDecoder(rec.Body).Decode(&detailResp)
	if len(detailResp.Messages) != 1 {
		t.Fatalf("expected 1 message, got %d", len(detailResp.Messages))
	}

	// POST /inbox/threads/{id}/reply (draft)
	draftBody, _ := json.Marshal(map[string]any{"body": "Yes, see you at 8pm!", "send": false})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/inbox/threads/"+threadID+"/reply", bytes.NewReader(draftBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("draft reply: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var draftResp struct {
		IsDraft bool `json:"is_draft"`
	}
	json.NewDecoder(rec.Body).Decode(&draftResp)
	if !draftResp.IsDraft {
		t.Fatal("expected draft reply to be marked is_draft")
	}

	// POST /inbox/threads/{id}/reply (send)
	sendBody, _ := json.Marshal(map[string]any{"body": "Yes, see you at 8pm!", "send": true})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/inbox/threads/"+threadID+"/reply", bytes.NewReader(sendBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("send reply: got %d, body=%s", rec.Code, rec.Body.String())
	}

	// PATCH /inbox/threads/{id} (status)
	patchBody, _ := json.Marshal(map[string]string{"status": inbox.ThreadStatusSnoozed})
	req = httptest.NewRequest(http.MethodPatch, "/api/v1/inbox/threads/"+threadID, bytes.NewReader(patchBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("update status: got %d, body=%s", rec.Code, rec.Body.String())
	}

	// GET /inbox/accounts
	req = httptest.NewRequest(http.MethodGet, "/api/v1/inbox/accounts", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list accounts: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var accountsResp struct {
		Count int `json:"count"`
	}
	json.NewDecoder(rec.Body).Decode(&accountsResp)
	if accountsResp.Count != 1 {
		t.Fatalf("expected 1 account, got %d", accountsResp.Count)
	}
}

func TestInboxThreadsRequiresAuth(t *testing.T) {
	app, _, _ := newInboxTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/inbox/threads", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
	}
}

// adminUserIDFromToken resolves the authenticated user's own ID via the
// /auth/me-equivalent principal lookup already exercised elsewhere in this
// package's tests.
func adminUserIDFromToken(t *testing.T, router http.Handler, token string) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/users/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get current user: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var resp struct {
		ID string `json:"id"`
	}
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp.ID == "" {
		t.Fatal("expected a non-empty user id")
	}
	return resp.ID
}
