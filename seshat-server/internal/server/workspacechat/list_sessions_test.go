package workspacechat

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/apperr"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// addPlainMember creates a second user inside env.orgID with the built-in
// "member" role (organization.manage-less), for asserting ListSessions
// rejects an ordinary org member the way it accepts an owner/admin/platform
// admin - unlike addOutsider (a different org entirely), this one is a real
// member of the org whose sessions are being listed, just without the
// permission this endpoint requires.
func (env testEnv) addPlainMember(t *testing.T) *iam.Principal {
	t.Helper()
	user, err := env.iam.CreateUser(context.Background(), env.adminPrincipal, iam.CreateUserParams{
		Email: "member@example.com", Password: "password123", DisplayName: "Plain Member",
		OrganizationID: env.orgID, Role: "member",
	})
	if err != nil {
		t.Fatalf("create plain member: %v", err)
	}
	login, err := env.iam.Login(context.Background(), user.Email, "password123")
	if err != nil {
		t.Fatalf("login plain member: %v", err)
	}
	principal, err := env.iam.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve plain member principal: %v", err)
	}
	return principal
}

func TestListSessionsRequiresOrganizationManage(t *testing.T) {
	env := newTestEnv(t)
	env.chat.persistTurn(context.Background(), env.adminPrincipal, StreamChatParams{SessionID: "sess-1", OrganizationID: env.orgID, Message: "hi"}, "hello", nil)

	member := env.addPlainMember(t)
	if _, _, err := env.chat.ListSessions(context.Background(), member, env.orgID, sdb.ListParams{Sort: "updated_at", Order: "desc", Limit: 20}); err == nil {
		t.Fatal("expected a plain member (no organization.manage) to be rejected")
	}

	outsider := env.addOutsider(t)
	if _, _, err := env.chat.ListSessions(context.Background(), outsider, env.orgID, sdb.ListParams{Sort: "updated_at", Order: "desc", Limit: 20}); err == nil {
		t.Fatal("expected a non-member of a different org to be rejected")
	}

	// The platform admin (env.adminPrincipal) is also this org's owner from
	// Bootstrap, so this alone doesn't distinguish "platform admin" from
	// "org owner" - both are accepted, which is exactly the point: either
	// grants organization.manage's effect here.
	sessions, total, err := env.chat.ListSessions(context.Background(), env.adminPrincipal, env.orgID, sdb.ListParams{Sort: "updated_at", Order: "desc", Limit: 20})
	if err != nil {
		t.Fatalf("expected the org owner to list sessions: %v", err)
	}
	if total != 1 || len(sessions) != 1 {
		t.Fatalf("expected 1 session, got total=%d len=%d", total, len(sessions))
	}
}

func TestListSessionsReturnsSummariesAcrossMembers(t *testing.T) {
	env := newTestEnv(t)
	member := env.addPlainMember(t)

	env.chat.persistTurn(context.Background(), env.adminPrincipal, StreamChatParams{SessionID: "sess-admin", OrganizationID: env.orgID, Message: "Admin question"}, "Admin answer", nil)
	env.chat.persistTurn(context.Background(), member, StreamChatParams{SessionID: "sess-member", OrganizationID: env.orgID, Message: "Member question"}, "Member answer", nil)
	// A real time gap, not just relying on insertion order - sqlite's
	// second-level timestamp precision otherwise makes ordering flaky.
	time.Sleep(1100 * time.Millisecond)
	env.chat.persistTurn(context.Background(), env.adminPrincipal, StreamChatParams{SessionID: "sess-admin", OrganizationID: env.orgID, Message: "Follow-up"}, "Follow-up answer", nil)

	sessions, total, err := env.chat.ListSessions(context.Background(), env.adminPrincipal, env.orgID, sdb.ListParams{Sort: "updated_at", Order: "desc", Limit: 20})
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if total != 2 {
		t.Fatalf("expected 2 sessions across both members, got %d", total)
	}
	// sess-admin was touched last (the follow-up), so it sorts first under
	// the default updated_at desc order.
	if sessions[0].ID != "sess-admin" {
		t.Fatalf("expected sess-admin first (most recently updated), got %+v", sessions)
	}
	if sessions[0].MessageCount != 4 {
		t.Fatalf("expected sess-admin to have 4 messages (2 turns x user+assistant), got %d", sessions[0].MessageCount)
	}
	if sessions[0].UserEmail != "admin@example.com" {
		t.Fatalf("expected sess-admin's owner email to be resolved, got %+v", sessions[0])
	}
	if sessions[1].ID != "sess-member" || sessions[1].UserEmail != "member@example.com" {
		t.Fatalf("expected sess-member second with the plain member's own email, got %+v", sessions[1])
	}
}

func TestListSessionsExcludesExpiredSessions(t *testing.T) {
	env := newTestEnv(t)
	env.chat.persistTurn(context.Background(), env.adminPrincipal, StreamChatParams{SessionID: "sess-stale", OrganizationID: env.orgID, Message: "hi"}, "hello", nil)

	stale := time.Now().UTC().Add(-sessionRetention - time.Hour)
	if err := env.db.Gorm().Model(&sdb.WorkspaceChatSession{}).Where("id = ?", "sess-stale").Update("created_at", stale).Error; err != nil {
		t.Fatalf("backdate session: %v", err)
	}

	_, total, err := env.chat.ListSessions(context.Background(), env.adminPrincipal, env.orgID, sdb.ListParams{Sort: "updated_at", Order: "desc", Limit: 20})
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if total != 0 {
		t.Fatalf("expected a session past the retention window to be excluded, got total=%d", total)
	}
}

func TestListSessionsRequiresOrganizationID(t *testing.T) {
	env := newTestEnv(t)
	if _, _, err := env.chat.ListSessions(context.Background(), env.adminPrincipal, "", sdb.ListParams{Sort: "updated_at", Order: "desc", Limit: 20}); !errors.Is(err, apperr.InvalidInput("")) {
		t.Fatalf("expected invalid-input for an empty organization id, got %v", err)
	}
	if _, _, err := env.chat.ListSessions(context.Background(), nil, env.orgID, sdb.ListParams{Sort: "updated_at", Order: "desc", Limit: 20}); !errors.Is(err, apperr.Unauthorized("")) {
		t.Fatalf("expected unauthorized for a nil principal, got %v", err)
	}
}
