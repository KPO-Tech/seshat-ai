package iam

import (
	"context"
	"strings"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mailer/mailertest"
)

// newTestServiceWithMailer is newTestService plus a fake mailer wired up via
// SetMailer, for tests asserting an email actually got sent - a real SMTP
// round-trip isn't needed to test iam.Service's own logic (see
// mailer.Sender's doc comment).
func newTestServiceWithMailer(t *testing.T) (*Service, *mailertest.FakeSender) {
	t.Helper()
	service := newTestService(t)
	fake := mailertest.New()
	service.SetMailer(fake, "http://localhost:3000")
	return service, fake
}

func TestCreateInvitationSendsEmailWhenMailerConfigured(t *testing.T) {
	service, fake := newTestServiceWithMailer(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Acme Corp", OrganizationSlug: "acme",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	adminPrincipal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}

	invitation, err := service.CreateInvitation(context.Background(), adminPrincipal, CreateInvitationParams{
		OrganizationID: boot.Organizations[0].ID, Email: "invitee@example.com", Role: "member",
	})
	if err != nil {
		t.Fatalf("create invitation: %v", err)
	}

	messages := fake.Messages()
	if len(messages) != 1 {
		t.Fatalf("expected exactly 1 email sent, got %d", len(messages))
	}
	msg := messages[0]
	if msg.To != "invitee@example.com" {
		t.Fatalf("expected email to invitee@example.com, got %q", msg.To)
	}
	if !strings.Contains(msg.Subject, "Acme Corp") {
		t.Fatalf("expected subject to mention the org name, got %q", msg.Subject)
	}
	wantLink := "http://localhost:3000/accept-invitation?token=" + invitation.Token
	if !strings.Contains(msg.TextBody, wantLink) {
		t.Fatalf("expected body to contain the accept link %q, got %q", wantLink, msg.TextBody)
	}
}

func TestCreateInvitationSucceedsWithoutMailerConfigured(t *testing.T) {
	// No SetMailer call at all - this must remain the fully-supported
	// default (see Service.mailer's doc comment): the invitation is created
	// and the token still works, just nothing gets emailed.
	service := newTestService(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	adminPrincipal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}

	invitation, err := service.CreateInvitation(context.Background(), adminPrincipal, CreateInvitationParams{
		OrganizationID: boot.Organizations[0].ID, Email: "invitee@example.com", Role: "member",
	})
	if err != nil {
		t.Fatalf("create invitation without a mailer configured should still succeed: %v", err)
	}
	if invitation.Token == "" {
		t.Fatal("expected the token to still be returned as the manual fallback")
	}
}

func TestLookupInvitationByTokenIsUnauthenticatedAndSafe(t *testing.T) {
	service, _ := newTestServiceWithMailer(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Acme Corp", OrganizationSlug: "acme",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	adminPrincipal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	invitation, err := service.CreateInvitation(context.Background(), adminPrincipal, CreateInvitationParams{
		OrganizationID: boot.Organizations[0].ID, Email: "invitee@example.com", Role: "member",
	})
	if err != nil {
		t.Fatalf("create invitation: %v", err)
	}

	preview, err := service.LookupInvitationByToken(context.Background(), invitation.Token)
	if err != nil {
		t.Fatalf("lookup by token: %v", err)
	}
	if !preview.Valid || preview.OrganizationName != "Acme Corp" || preview.Role != "member" {
		t.Fatalf("unexpected preview: %+v", preview)
	}

	unknown, err := service.LookupInvitationByToken(context.Background(), "invite_doesnotexist")
	if err != nil {
		t.Fatalf("lookup unknown token: %v", err)
	}
	if unknown.Valid {
		t.Fatal("expected an unknown token to report valid=false, not an error")
	}
}
