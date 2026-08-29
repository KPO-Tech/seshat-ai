package iam

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func TestUpdateOrganizationSettingsAndAuditFlow(t *testing.T) {
	service := newTestService(t)

	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email:            "admin@example.com",
		Password:         "password123",
		DisplayName:      "Admin",
		OrganizationName: "Seshat",
		OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	principal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	orgID := boot.Organizations[0].ID

	updatedOrganization, err := service.UpdateOrganization(context.Background(), principal, orgID, UpdateOrganizationParams{
		Name:         "Seshat Labs",
		Slug:         "seshat-labs",
		Description:  "AI automation control plane",
		WebsiteURL:   "https://seshat.ai",
		SupportEmail: "support@seshat.ai",
	})
	if err != nil {
		t.Fatalf("update organization: %v", err)
	}
	if updatedOrganization.Name != "Seshat Labs" {
		t.Fatalf("unexpected organization name: %s", updatedOrganization.Name)
	}
	if updatedOrganization.SupportEmail != "support@seshat.ai" {
		t.Fatalf("unexpected support email: %s", updatedOrganization.SupportEmail)
	}

	loadedOrganization, err := service.GetOrganization(context.Background(), principal, orgID)
	if err != nil {
		t.Fatalf("get organization: %v", err)
	}
	if loadedOrganization.Slug != "seshat-labs" {
		t.Fatalf("unexpected organization slug: %s", loadedOrganization.Slug)
	}

	events, _, err := service.ListAuditEvents(context.Background(), principal, ListAuditEventsParams{
		OrganizationID: orgID,
		Action:         "organization.updated",
	}, sdb.ListParams{Sort: "created_at", Order: "desc", Limit: 200})
	if err != nil {
		t.Fatalf("list audit events: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected one organization.updated event, got %d", len(events))
	}
	if events[0].ResourceType != "organization" {
		t.Fatalf("unexpected audit resource type: %s", events[0].ResourceType)
	}
}

func TestUpdateOrganizationSetsAndClearsMinAppVersion(t *testing.T) {
	service := newTestService(t)

	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email:            "admin@example.com",
		Password:         "password123",
		DisplayName:      "Admin",
		OrganizationName: "Seshat",
		OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	principal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	orgID := boot.Organizations[0].ID

	updated, err := service.UpdateOrganization(context.Background(), principal, orgID, UpdateOrganizationParams{
		Name: "Seshat", Slug: "seshat", MinAppVersion: "1.2.3",
	})
	if err != nil {
		t.Fatalf("update organization: %v", err)
	}
	if updated.MinAppVersion == nil || *updated.MinAppVersion != "1.2.3" {
		t.Fatalf("expected min_app_version to be set, got %+v", updated.MinAppVersion)
	}

	if _, err := service.UpdateOrganization(context.Background(), principal, orgID, UpdateOrganizationParams{
		Name: "Seshat", Slug: "seshat", MinAppVersion: "not-a-version",
	}); err == nil {
		t.Fatal("expected a malformed min_app_version to be rejected")
	}

	cleared, err := service.UpdateOrganization(context.Background(), principal, orgID, UpdateOrganizationParams{
		Name: "Seshat", Slug: "seshat", MinAppVersion: "",
	})
	if err != nil {
		t.Fatalf("update organization to clear min_app_version: %v", err)
	}
	if cleared.MinAppVersion != nil {
		t.Fatalf("expected min_app_version to be cleared, got %+v", cleared.MinAppVersion)
	}
}

func TestAuditTrailCapturesMembershipAndInvitationEvents(t *testing.T) {
	service := newTestService(t)

	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email:            "admin@example.com",
		Password:         "password123",
		DisplayName:      "Admin",
		OrganizationName: "Seshat",
		OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	principal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	orgID := boot.Organizations[0].ID

	user, err := service.CreateUser(context.Background(), principal, CreateUserParams{
		Email:       "audited@example.com",
		Password:    "password123",
		DisplayName: "Audited User",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	_, err = service.CreateMembership(context.Background(), principal, CreateMembershipParams{
		OrganizationID: orgID,
		UserID:         user.ID,
		Role:           "member",
	})
	if err != nil {
		t.Fatalf("create membership: %v", err)
	}
	_, err = service.CreateInvitation(context.Background(), principal, CreateInvitationParams{
		OrganizationID: orgID,
		Email:          "invite-audit@example.com",
		Role:           "viewer",
		ExpiresInDays:  7,
	})
	if err != nil {
		t.Fatalf("create invitation: %v", err)
	}

	events, _, err := service.ListAuditEvents(context.Background(), principal, ListAuditEventsParams{OrganizationID: orgID}, sdb.ListParams{Sort: "created_at", Order: "desc", Limit: 200})
	if err != nil {
		t.Fatalf("list audit events: %v", err)
	}
	if len(events) < 3 {
		t.Fatalf("expected at least three audit events, got %d", len(events))
	}
}
