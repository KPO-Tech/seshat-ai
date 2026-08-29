package iam

import (
	"context"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// verifyDomainForTest fakes a matching DNS TXT answer and calls
// VerifyOrganizationDomain, for tests that need Register()'s domain
// auto-join to actually trigger - which, since 2026-08-29, requires a
// verified domain, not just a claimed one (see Organization.Domain's doc
// comment in models.go). Real tests exercising the DNS-lookup plumbing
// itself (match/mismatch/error) live in organization_domain_verification_test.go;
// this helper exists purely so every OTHER test that needs a verified
// domain as a precondition doesn't have to repeat the fake-lookup wiring.
func verifyDomainForTest(t *testing.T, service *Service, principal *Principal, organizationID, domain string) {
	t.Helper()
	org, err := service.GetOrganization(context.Background(), principal, organizationID)
	if err != nil {
		t.Fatalf("load organization for domain verification: %v", err)
	}
	if org.DomainVerificationToken == nil {
		t.Fatalf("expected a pending domain verification token for organization %s", organizationID)
	}
	expectedHost := domainVerificationTXTHost(domain)
	expectedValue := domainVerificationTXTValue(*org.DomainVerificationToken)
	service.SetDomainLookupTXT(func(_ context.Context, host string) ([]string, error) {
		if host != expectedHost {
			return nil, nil
		}
		return []string{expectedValue}, nil
	})
	if _, err := service.VerifyOrganizationDomain(context.Background(), principal, organizationID); err != nil {
		t.Fatalf("verify domain: %v", err)
	}
}

func TestRegisterJoinsMatchingDomainAsPending(t *testing.T) {
	service, adminPrincipal, _, orgID := bootstrapWithMember(t, "member")

	if _, err := service.UpdateOrganization(context.Background(), adminPrincipal, orgID, UpdateOrganizationParams{
		Name: "Seshat", Slug: "seshat", Domain: "acmecorp.com",
	}); err != nil {
		t.Fatalf("set organization domain: %v", err)
	}
	verifyDomainForTest(t, service, adminPrincipal, orgID, "acmecorp.com")

	result, err := service.Register(context.Background(), RegisterParams{
		Email: "new.hire@AcmeCorp.com", Password: "password123", DisplayName: "New Hire",
	})
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	if result.Token == "" {
		t.Fatal("expected a session token from register")
	}
	if len(result.Memberships) != 1 || result.Memberships[0].OrganizationID != orgID {
		t.Fatalf("expected auto-join to the domain-matched org, got: %+v", result.Memberships)
	}
	if result.Memberships[0].Status != "pending" {
		t.Fatalf("expected pending status, got: %q", result.Memberships[0].Status)
	}
	if result.Memberships[0].PendingSince == nil {
		t.Fatal("expected pending_since to be set")
	}

	// A pending membership has full access already, same as active.
	principal, err := service.ResolvePrincipal(context.Background(), result.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	allowed, err := service.CanAccessOrganization(service.db.Gorm(), principal, orgID)
	if err != nil {
		t.Fatalf("can access: %v", err)
	}
	if !allowed {
		t.Fatal("expected a pending member to already have access")
	}
}

func TestRegisterWithNoMatchingDomainCreatesAccountOnly(t *testing.T) {
	service := newTestService(t)

	result, err := service.Register(context.Background(), RegisterParams{
		Email: "founder@brandnewco.com", Password: "password123", DisplayName: "Founder",
	})
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	if len(result.Memberships) != 0 || len(result.Organizations) != 0 {
		t.Fatalf("expected no memberships when no organization claims the domain, got: %+v", result)
	}

	// The new account can still found its own organization, self-serve.
	principal, err := service.ResolvePrincipal(context.Background(), result.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	if _, err := service.CreateOrganization(context.Background(), principal, CreateOrganizationParams{
		Name: "Brand New Co", Slug: "brand-new-co",
	}); err != nil {
		t.Fatalf("expected self-serve org creation to still work: %v", err)
	}
}

func TestRegisterRejectsDuplicateEmail(t *testing.T) {
	service := newTestService(t)

	if _, err := service.Register(context.Background(), RegisterParams{
		Email: "person@example.com", Password: "password123", DisplayName: "Person",
	}); err != nil {
		t.Fatalf("first register: %v", err)
	}
	if _, err := service.Register(context.Background(), RegisterParams{
		Email: "person@example.com", Password: "password456", DisplayName: "Person Again",
	}); err == nil {
		t.Fatal("expected a second registration with the same email to be rejected")
	}
}

func TestBlockedMembershipLosesAccessPendingKeepsIt(t *testing.T) {
	service, adminPrincipal, memberPrincipal, orgID := bootstrapWithMember(t, "member")

	allowed, err := service.CanAccessOrganization(service.db.Gorm(), memberPrincipal, orgID)
	if err != nil || !allowed {
		t.Fatalf("expected the active member to have access: allowed=%v err=%v", allowed, err)
	}

	if err := service.db.Gorm().Model(&sdb.Membership{}).
		Where("user_id = ? AND organization_id = ?", memberPrincipal.User.ID, orgID).
		Update("status", "blocked").Error; err != nil {
		t.Fatalf("block membership: %v", err)
	}

	// A blocked membership must vanish from a fresh session's view (login),
	// not just future authorization checks.
	login, err := service.Login(context.Background(), memberPrincipal.User.Email, "password123")
	if err != nil {
		t.Fatalf("login after block: %v", err)
	}
	if len(login.Memberships) != 0 {
		t.Fatalf("expected a blocked membership to be invisible after login, got: %+v", login.Memberships)
	}

	blockedPrincipal, err := service.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	allowed, err = service.CanAccessOrganization(service.db.Gorm(), blockedPrincipal, orgID)
	if err != nil {
		t.Fatalf("can access: %v", err)
	}
	if allowed {
		t.Fatal("expected a blocked membership to lose access entirely")
	}
	_ = adminPrincipal
}

func TestConfirmMembership(t *testing.T) {
	service, adminPrincipal, _, orgID := bootstrapWithMember(t, "member")
	if _, err := service.UpdateOrganization(context.Background(), adminPrincipal, orgID, UpdateOrganizationParams{
		Name: "Seshat", Slug: "seshat", Domain: "acmecorp.com",
	}); err != nil {
		t.Fatalf("set organization domain: %v", err)
	}
	verifyDomainForTest(t, service, adminPrincipal, orgID, "acmecorp.com")
	result, err := service.Register(context.Background(), RegisterParams{
		Email: "pending.person@acmecorp.com", Password: "password123", DisplayName: "Pending Person",
	})
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	membershipID := result.Memberships[0].ID

	confirmed, err := service.ConfirmMembership(context.Background(), adminPrincipal, membershipID)
	if err != nil {
		t.Fatalf("confirm: %v", err)
	}
	if confirmed.Status != "active" || confirmed.PendingSince != nil {
		t.Fatalf("expected active status and cleared pending_since, got: %+v", confirmed)
	}

	// Confirming an already-active membership is a harmless no-op.
	if _, err := service.ConfirmMembership(context.Background(), adminPrincipal, membershipID); err != nil {
		t.Fatalf("confirm again: %v", err)
	}
}

func TestBlockExpiredPendingMemberships(t *testing.T) {
	service, adminPrincipal, _, orgID := bootstrapWithMember(t, "member")
	if _, err := service.UpdateOrganization(context.Background(), adminPrincipal, orgID, UpdateOrganizationParams{
		Name: "Seshat", Slug: "seshat", Domain: "acmecorp.com",
	}); err != nil {
		t.Fatalf("set organization domain: %v", err)
	}
	verifyDomainForTest(t, service, adminPrincipal, orgID, "acmecorp.com")
	result, err := service.Register(context.Background(), RegisterParams{
		Email: "aging.person@acmecorp.com", Password: "password123", DisplayName: "Aging Person",
	})
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	membershipID := result.Memberships[0].ID

	// Age the membership past a short confirmation window.
	agedSince := time.Now().UTC().Add(-2 * time.Hour)
	if err := service.db.Gorm().Model(&sdb.Membership{}).
		Where("id = ?", membershipID).Update("pending_since", agedSince).Error; err != nil {
		t.Fatalf("age membership: %v", err)
	}

	if err := service.BlockExpiredPendingMemberships(context.Background(), time.Hour); err != nil {
		t.Fatalf("sweep: %v", err)
	}

	membership, err := service.GetMembership(context.Background(), adminPrincipal, membershipID)
	if err != nil {
		t.Fatalf("get membership: %v", err)
	}
	if membership.Status != "blocked" {
		t.Fatalf("expected the aged pending membership to be blocked, got: %q", membership.Status)
	}
}
