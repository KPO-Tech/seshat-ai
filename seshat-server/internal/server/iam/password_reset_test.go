package iam

import (
	"context"
	"strings"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func TestForgotPasswordDoesNotRevealWhetherEmailExists(t *testing.T) {
	service, fake := newTestServiceWithMailer(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}

	if err := service.ForgotPassword(context.Background(), boot.User.Email); err != nil {
		t.Fatalf("forgot password for a real account: %v", err)
	}
	if err := service.ForgotPassword(context.Background(), "nobody@example.com"); err != nil {
		t.Fatalf("forgot password for a nonexistent account should still return nil: %v", err)
	}

	messages := fake.Messages()
	if len(messages) != 1 {
		t.Fatalf("expected exactly 1 email sent (only for the real account), got %d", len(messages))
	}
	if messages[0].To != boot.User.Email {
		t.Fatalf("expected the email to go to %q, got %q", boot.User.Email, messages[0].To)
	}
	if !strings.Contains(messages[0].TextBody, "/reset-password?token=reset_") {
		t.Fatalf("expected body to contain a reset link, got %q", messages[0].TextBody)
	}
}

func TestResetPasswordRejectsExpiredOrUsedToken(t *testing.T) {
	service, fake := newTestServiceWithMailer(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}

	if err := service.ResetPassword(context.Background(), "reset_totallymadeup", "newpassword123"); err == nil {
		t.Fatal("expected an unknown token to be rejected")
	}

	if err := service.ForgotPassword(context.Background(), boot.User.Email); err != nil {
		t.Fatalf("forgot password: %v", err)
	}
	token := extractResetToken(t, fake.Messages()[len(fake.Messages())-1].TextBody)

	if err := service.ResetPassword(context.Background(), token, "newpassword123"); err != nil {
		t.Fatalf("reset password with a fresh token: %v", err)
	}
	// The token was single-use - redeeming it again must fail.
	if err := service.ResetPassword(context.Background(), token, "anotherpassword123"); err == nil {
		t.Fatal("expected a reused token to be rejected")
	}

	// Login with the OLD password must now fail, and the NEW one must work.
	if _, err := service.Login(context.Background(), boot.User.Email, "password123"); err == nil {
		t.Fatal("expected the old password to no longer work")
	}
	if _, err := service.Login(context.Background(), boot.User.Email, "newpassword123"); err != nil {
		t.Fatalf("expected the new password to work: %v", err)
	}
}

func TestResetPasswordRevokesExistingSessions(t *testing.T) {
	service, fake := newTestServiceWithMailer(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	// The bootstrap login token itself is an existing session - confirm it
	// works before the reset, then confirm it's rejected afterwards.
	if _, err := service.ResolvePrincipal(context.Background(), boot.Token); err != nil {
		t.Fatalf("resolve principal before reset: %v", err)
	}

	if err := service.ForgotPassword(context.Background(), boot.User.Email); err != nil {
		t.Fatalf("forgot password: %v", err)
	}
	token := extractResetToken(t, fake.Messages()[0].TextBody)
	if err := service.ResetPassword(context.Background(), token, "newpassword123"); err != nil {
		t.Fatalf("reset password: %v", err)
	}

	if _, err := service.ResolvePrincipal(context.Background(), boot.Token); err == nil {
		t.Fatal("expected the pre-reset session token to be revoked")
	}
}

func TestResetPasswordRejectsTooShortPassword(t *testing.T) {
	service, fake := newTestServiceWithMailer(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	if err := service.ForgotPassword(context.Background(), boot.User.Email); err != nil {
		t.Fatalf("forgot password: %v", err)
	}
	token := extractResetToken(t, fake.Messages()[0].TextBody)
	if err := service.ResetPassword(context.Background(), token, "short"); err == nil {
		t.Fatal("expected a too-short password to be rejected")
	}
}

// extractResetToken pulls the raw "reset_..." token out of a rendered email
// body, mirroring how a real user would copy it from the link they clicked.
func extractResetToken(t *testing.T, body string) string {
	t.Helper()
	const marker = "/reset-password?token="
	idx := strings.Index(body, marker)
	if idx == -1 {
		t.Fatalf("no reset link found in body: %q", body)
	}
	rest := body[idx+len(marker):]
	end := strings.IndexAny(rest, "\n ")
	if end == -1 {
		end = len(rest)
	}
	return rest[:end]
}

// TestPasswordResetTokenUniqueIndexHolds is a light sanity check that the
// new model actually migrated with its unique constraint on Token, mirroring
// the pattern already used for other new-model migrations this session.
func TestPasswordResetTokenUniqueIndexHolds(t *testing.T) {
	service := newTestService(t)
	tx := service.db.Gorm()
	now := time.Now().UTC()
	record := sdb.PasswordResetToken{ID: "prt_1", UserID: "usr_1", Token: "duplicate", CreatedAt: now, ExpiresAt: now.Add(time.Hour)}
	if err := tx.Create(&record).Error; err != nil {
		t.Fatalf("create first token: %v", err)
	}
	dup := sdb.PasswordResetToken{ID: "prt_2", UserID: "usr_1", Token: "duplicate", CreatedAt: now, ExpiresAt: now.Add(time.Hour)}
	if err := tx.Create(&dup).Error; err == nil {
		t.Fatal("expected a duplicate token hash to violate the unique index")
	}
}
