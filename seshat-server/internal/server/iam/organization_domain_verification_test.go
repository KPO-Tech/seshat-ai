package iam

import (
	"context"
	"errors"
	"testing"
)

func TestCreateOrganizationWithDomainGeneratesAnUnverifiedToken(t *testing.T) {
	service, adminPrincipal, _, _ := bootstrapWithMember(t, "member")

	org, err := service.CreateOrganization(context.Background(), adminPrincipal, CreateOrganizationParams{
		Name: "Acme", Slug: "acme", Domain: "acmecorp.com",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if org.DomainVerificationToken == nil || *org.DomainVerificationToken == "" {
		t.Fatal("expected a domain verification token to be generated")
	}
	if org.DomainVerifiedAt != nil {
		t.Fatal("expected a freshly claimed domain to be unverified")
	}
}

func TestCreateOrganizationWithoutDomainHasNoVerificationState(t *testing.T) {
	service, adminPrincipal, _, _ := bootstrapWithMember(t, "member")

	org, err := service.CreateOrganization(context.Background(), adminPrincipal, CreateOrganizationParams{
		Name: "Acme", Slug: "acme",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if org.DomainVerificationToken != nil || org.DomainVerifiedAt != nil {
		t.Fatalf("expected no verification state without a domain, got %+v", org)
	}
}

func TestVerifyOrganizationDomainSucceedsOnMatchingTXTRecord(t *testing.T) {
	service, adminPrincipal, _, orgID := bootstrapWithMember(t, "member")
	if _, err := service.UpdateOrganization(context.Background(), adminPrincipal, orgID, UpdateOrganizationParams{
		Name: "Seshat", Slug: "seshat", Domain: "acmecorp.com",
	}); err != nil {
		t.Fatalf("set domain: %v", err)
	}

	org, err := service.GetOrganization(context.Background(), adminPrincipal, orgID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	token := *org.DomainVerificationToken

	service.SetDomainLookupTXT(func(_ context.Context, host string) ([]string, error) {
		if host != "_seshat-challenge.acmecorp.com" {
			t.Fatalf("unexpected TXT host queried: %q", host)
		}
		return []string{"seshat-verification=" + token}, nil
	})

	verified, err := service.VerifyOrganizationDomain(context.Background(), adminPrincipal, orgID)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if verified.DomainVerifiedAt == nil {
		t.Fatal("expected domain_verified_at to be set after a matching TXT record")
	}
}

func TestVerifyOrganizationDomainFailsOnMismatch(t *testing.T) {
	service, adminPrincipal, _, orgID := bootstrapWithMember(t, "member")
	if _, err := service.UpdateOrganization(context.Background(), adminPrincipal, orgID, UpdateOrganizationParams{
		Name: "Seshat", Slug: "seshat", Domain: "acmecorp.com",
	}); err != nil {
		t.Fatalf("set domain: %v", err)
	}
	service.SetDomainLookupTXT(func(_ context.Context, _ string) ([]string, error) {
		return []string{"seshat-verification=not-the-right-token"}, nil
	})

	if _, err := service.VerifyOrganizationDomain(context.Background(), adminPrincipal, orgID); err == nil {
		t.Fatal("expected verification to fail on a mismatched TXT value")
	}

	org, err := service.GetOrganization(context.Background(), adminPrincipal, orgID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if org.DomainVerifiedAt != nil {
		t.Fatal("expected a failed verification attempt to leave the domain unverified")
	}
}

func TestVerifyOrganizationDomainFailsWhenLookupErrors(t *testing.T) {
	service, adminPrincipal, _, orgID := bootstrapWithMember(t, "member")
	if _, err := service.UpdateOrganization(context.Background(), adminPrincipal, orgID, UpdateOrganizationParams{
		Name: "Seshat", Slug: "seshat", Domain: "acmecorp.com",
	}); err != nil {
		t.Fatalf("set domain: %v", err)
	}
	service.SetDomainLookupTXT(func(_ context.Context, _ string) ([]string, error) {
		return nil, errors.New("no such host")
	})

	if _, err := service.VerifyOrganizationDomain(context.Background(), adminPrincipal, orgID); err == nil {
		t.Fatal("expected verification to fail when the DNS lookup itself errors (e.g. NXDOMAIN)")
	}
}

func TestVerifyOrganizationDomainRejectsWhenNoDomainClaimed(t *testing.T) {
	service, adminPrincipal, _, orgID := bootstrapWithMember(t, "member")

	if _, err := service.VerifyOrganizationDomain(context.Background(), adminPrincipal, orgID); err == nil {
		t.Fatal("expected verification to be rejected when the organization has no domain at all")
	}
}

func TestVerifyOrganizationDomainPermissionBoundary(t *testing.T) {
	service, adminPrincipal, memberPrincipal, orgID := bootstrapWithMember(t, "member")
	if _, err := service.UpdateOrganization(context.Background(), adminPrincipal, orgID, UpdateOrganizationParams{
		Name: "Seshat", Slug: "seshat", Domain: "acmecorp.com",
	}); err != nil {
		t.Fatalf("set domain: %v", err)
	}

	if _, err := service.VerifyOrganizationDomain(context.Background(), memberPrincipal, orgID); err == nil {
		t.Fatal("expected a member without organization.manage to be denied triggering domain verification")
	}
}

func TestChangingDomainResetsVerificationAndToken(t *testing.T) {
	service, adminPrincipal, _, orgID := bootstrapWithMember(t, "member")
	if _, err := service.UpdateOrganization(context.Background(), adminPrincipal, orgID, UpdateOrganizationParams{
		Name: "Seshat", Slug: "seshat", Domain: "acmecorp.com",
	}); err != nil {
		t.Fatalf("set domain: %v", err)
	}
	verifyDomainForTest(t, service, adminPrincipal, orgID, "acmecorp.com")

	before, err := service.GetOrganization(context.Background(), adminPrincipal, orgID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if before.DomainVerifiedAt == nil {
		t.Fatal("setup failure: expected the domain to be verified before the change")
	}
	firstToken := *before.DomainVerificationToken

	if _, err := service.UpdateOrganization(context.Background(), adminPrincipal, orgID, UpdateOrganizationParams{
		Name: "Seshat", Slug: "seshat", Domain: "othercorp.com",
	}); err != nil {
		t.Fatalf("change domain: %v", err)
	}

	after, err := service.GetOrganization(context.Background(), adminPrincipal, orgID)
	if err != nil {
		t.Fatalf("get after change: %v", err)
	}
	if after.DomainVerifiedAt != nil {
		t.Fatal("expected changing the domain to reset verification")
	}
	if after.DomainVerificationToken == nil || *after.DomainVerificationToken == firstToken {
		t.Fatal("expected a fresh verification token for the new domain, not the old one reused")
	}
}

func TestReSavingTheSameDomainDoesNotResetVerification(t *testing.T) {
	service, adminPrincipal, _, orgID := bootstrapWithMember(t, "member")
	if _, err := service.UpdateOrganization(context.Background(), adminPrincipal, orgID, UpdateOrganizationParams{
		Name: "Seshat", Slug: "seshat", Domain: "acmecorp.com",
	}); err != nil {
		t.Fatalf("set domain: %v", err)
	}
	verifyDomainForTest(t, service, adminPrincipal, orgID, "acmecorp.com")

	// Editing an unrelated field (name) while leaving Domain unchanged must
	// not force a re-verification the admin already completed.
	if _, err := service.UpdateOrganization(context.Background(), adminPrincipal, orgID, UpdateOrganizationParams{
		Name: "Seshat Renamed", Slug: "seshat", Domain: "acmecorp.com",
	}); err != nil {
		t.Fatalf("update unrelated field: %v", err)
	}

	org, err := service.GetOrganization(context.Background(), adminPrincipal, orgID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if org.DomainVerifiedAt == nil {
		t.Fatal("expected verification to survive an update that doesn't change the domain")
	}
}

func TestClearingDomainClearsVerificationState(t *testing.T) {
	service, adminPrincipal, _, orgID := bootstrapWithMember(t, "member")
	if _, err := service.UpdateOrganization(context.Background(), adminPrincipal, orgID, UpdateOrganizationParams{
		Name: "Seshat", Slug: "seshat", Domain: "acmecorp.com",
	}); err != nil {
		t.Fatalf("set domain: %v", err)
	}
	verifyDomainForTest(t, service, adminPrincipal, orgID, "acmecorp.com")

	if _, err := service.UpdateOrganization(context.Background(), adminPrincipal, orgID, UpdateOrganizationParams{
		Name: "Seshat", Slug: "seshat",
	}); err != nil {
		t.Fatalf("clear domain: %v", err)
	}

	org, err := service.GetOrganization(context.Background(), adminPrincipal, orgID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if org.Domain != nil || org.DomainVerificationToken != nil || org.DomainVerifiedAt != nil {
		t.Fatalf("expected clearing the domain to clear all verification state too, got %+v", org)
	}
}

func TestUnverifiedDomainNeverAutoJoinsSelfRegisteringUsers(t *testing.T) {
	service, adminPrincipal, _, orgID := bootstrapWithMember(t, "member")
	if _, err := service.UpdateOrganization(context.Background(), adminPrincipal, orgID, UpdateOrganizationParams{
		Name: "Seshat", Slug: "seshat", Domain: "acmecorp.com",
	}); err != nil {
		t.Fatalf("set domain: %v", err)
	}
	// Deliberately not verified.

	result, err := service.Register(context.Background(), RegisterParams{
		Email: "someone@acmecorp.com", Password: "password123", DisplayName: "Someone",
	})
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	if len(result.Memberships) != 0 {
		t.Fatalf("expected an unverified domain claim to grant no auto-join, got: %+v", result.Memberships)
	}
}
