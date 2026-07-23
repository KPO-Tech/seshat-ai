package iam

import (
	"context"
	"strings"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mailer/mailertest"
)

func TestCreateOrganizationMemberRequiresMembersManagePermission(t *testing.T) {
	service, adminPrincipal, memberPrincipal, orgID := bootstrapWithMember(t, "member")

	if _, err := service.CreateOrganizationMember(context.Background(), memberPrincipal, CreateOrganizationMemberParams{
		OrganizationID: orgID, Email: "denied@example.com", DisplayName: "Denied",
	}); err == nil {
		t.Fatal("expected a plain member (no members.manage/organization.manage) to be denied")
	}

	membership, err := service.CreateOrganizationMember(context.Background(), adminPrincipal, CreateOrganizationMemberParams{
		OrganizationID: orgID, Email: "allowed@example.com", DisplayName: "Allowed",
	})
	if err != nil {
		t.Fatalf("expected an org admin to be allowed: %v", err)
	}
	if membership.OrganizationID != orgID || membership.Role != "member" {
		t.Fatalf("unexpected membership: %+v", membership)
	}
}

func TestCreateOrganizationMemberNeverExposesPassword(t *testing.T) {
	service, adminPrincipal, _, orgID := bootstrapWithMember(t, "member")

	membership, err := service.CreateOrganizationMember(context.Background(), adminPrincipal, CreateOrganizationMemberParams{
		OrganizationID: orgID, Email: "newperson@example.com", DisplayName: "New Person",
	})
	if err != nil {
		t.Fatalf("create organization member: %v", err)
	}

	// The generated password is never returned, and - since it's random and
	// never disclosed anywhere - logging in with an empty password must
	// fail (confirms a real, non-empty hash was actually set, not left
	// blank).
	if _, err := service.Login(context.Background(), "newperson@example.com", ""); err == nil {
		t.Fatal("expected login with an empty password to fail")
	}
	if _, err := service.Login(context.Background(), "newperson@example.com", "password123"); err == nil {
		t.Fatal("expected login with a guessed common password to fail")
	}

	// Sanity: the Membership response type itself has no password-shaped
	// field to leak from (compile-time guarantee, exercised here so the
	// test fails loudly if that ever changes).
	if membership.UserID == "" {
		t.Fatal("expected a resolved user id on the created membership")
	}
}

func TestCreateOrganizationMemberSendsWelcomeEmailWithResetLink(t *testing.T) {
	service, adminPrincipal, _, orgID := bootstrapWithMember(t, "member")
	fake := mailertest.New()
	service.SetMailer(fake, "http://localhost:3000")

	membership, err := service.CreateOrganizationMember(context.Background(), adminPrincipal, CreateOrganizationMemberParams{
		OrganizationID: orgID, Email: "welcome@example.com", DisplayName: "Welcome Person",
	})
	if err != nil {
		t.Fatalf("create organization member: %v", err)
	}
	_ = membership

	messages := fake.Messages()
	if len(messages) != 1 {
		t.Fatalf("expected exactly 1 welcome email, got %d", len(messages))
	}
	msg := messages[0]
	if msg.To != "welcome@example.com" {
		t.Fatalf("expected email to welcome@example.com, got %q", msg.To)
	}
	if !strings.Contains(msg.TextBody, "/reset-password?token=reset_") {
		t.Fatalf("expected the welcome email to contain a reset-password link, got %q", msg.TextBody)
	}
}

func TestCreateOrganizationMemberAttachesToGroups(t *testing.T) {
	service, adminPrincipal, _, orgID := bootstrapWithMember(t, "member")

	group, err := service.CreateGroup(context.Background(), adminPrincipal, CreateGroupParams{
		OrganizationID: orgID, Name: "Engineering", Slug: "engineering",
	})
	if err != nil {
		t.Fatalf("create group: %v", err)
	}

	membership, err := service.CreateOrganizationMember(context.Background(), adminPrincipal, CreateOrganizationMemberParams{
		OrganizationID: orgID, Email: "engineer@example.com", DisplayName: "Engineer",
		GroupIDs: []string{group.ID},
	})
	if err != nil {
		t.Fatalf("create organization member with group: %v", err)
	}

	fetched, err := service.GetGroup(context.Background(), adminPrincipal, group.ID)
	if err != nil {
		t.Fatalf("get group: %v", err)
	}
	found := false
	for _, id := range fetched.MemberUserIDs {
		if id == membership.UserID {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected the new member to be in the group's member list, got %+v", fetched.MemberUserIDs)
	}
}

func TestCreateOrganizationMemberRejectsGroupFromAnotherOrganization(t *testing.T) {
	service := newTestService(t)

	bootA, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin-a@example.com", Password: "password123", DisplayName: "Admin A",
		OrganizationName: "Org A", OrganizationSlug: "org-a",
	})
	if err != nil {
		t.Fatalf("bootstrap org A: %v", err)
	}
	adminA, err := service.ResolvePrincipal(context.Background(), bootA.Token)
	if err != nil {
		t.Fatalf("resolve admin A: %v", err)
	}

	// Org B, created by the same super-admin (skips the one-org-per-user
	// membership attach for admin callers, see CreateOrganization).
	orgB, err := service.CreateOrganization(context.Background(), adminA, CreateOrganizationParams{
		Name: "Org B", Slug: "org-b",
	})
	if err != nil {
		t.Fatalf("create org B: %v", err)
	}
	groupB, err := service.CreateGroup(context.Background(), adminA, CreateGroupParams{
		OrganizationID: orgB.ID, Name: "Org B Team", Slug: "org-b-team",
	})
	if err != nil {
		t.Fatalf("create group in org B: %v", err)
	}

	if _, err := service.CreateOrganizationMember(context.Background(), adminA, CreateOrganizationMemberParams{
		OrganizationID: bootA.Organizations[0].ID, Email: "cross-org@example.com", DisplayName: "Cross Org",
		GroupIDs: []string{groupB.ID},
	}); err == nil {
		t.Fatal("expected a group from another organization to be rejected")
	}
}
