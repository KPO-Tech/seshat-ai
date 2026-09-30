package iam

import (
	"context"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func newLifecycleService(t *testing.T) *Service {
	return newTestService(t)
}

func TestDeleteOrganizationCascadesScopedResources(t *testing.T) {
	service := newLifecycleService(t)

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
	orgID := boot.Organizations[0].ID

	member, err := service.CreateUser(context.Background(), adminPrincipal, CreateUserParams{
		Email: "member@example.com", Password: "password123", DisplayName: "Member",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	if _, err := service.CreateMembership(context.Background(), adminPrincipal, CreateMembershipParams{
		OrganizationID: orgID, UserID: member.ID, Role: "member",
	}); err != nil {
		t.Fatalf("create membership: %v", err)
	}
	provider, err := service.CreateProvider(context.Background(), adminPrincipal, CreateProviderParams{
		OrganizationID: orgID, Name: "Google", Slug: "google", Kind: "oidc",
		ClientID: "cid", ClientSecret: "secret", IssuerURL: "https://accounts.google.com",
	})
	if err != nil {
		t.Fatalf("create provider: %v", err)
	}
	if _, err := service.CreateApplication(context.Background(), adminPrincipal, CreateApplicationParams{
		OrganizationID: orgID,
		Name:           "Desktop",
		Slug:           "desktop",
		DisplayName:    "Desktop",
		Protocol:       "oidc",
		CallbackURL:    "https://app.seshat.ai/callback",
		ProviderIDs:    []string{provider.ID},
	}); err != nil {
		t.Fatalf("create application: %v", err)
	}
	invitation, err := service.CreateInvitation(context.Background(), adminPrincipal, CreateInvitationParams{
		OrganizationID: orgID,
		Email:          "invitee@example.com",
		Role:           "viewer",
	})
	if err != nil {
		t.Fatalf("create invitation: %v", err)
	}
	group, err := service.CreateGroup(context.Background(), adminPrincipal, CreateGroupParams{
		OrganizationID: orgID, Name: "Ops", Slug: "ops", MemberUserIDs: []string{member.ID},
	})
	if err != nil {
		t.Fatalf("create group: %v", err)
	}
	if _, err := service.CreatePolicyBinding(context.Background(), adminPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgID,
		Name:            "Ops invites",
		SubjectType:     "group",
		SubjectID:       group.ID,
		PermissionCodes: []string{"invitations.read"},
	}); err != nil {
		t.Fatalf("create policy binding: %v", err)
	}

	now := time.Now().UTC()
	device := sdb.Device{
		ID:                 "dev_test",
		OrganizationID:     orgID,
		RegisteredByUserID: adminPrincipal.User.ID,
		Name:               "Worker",
		Status:             "active",
		Token:              "device-token",
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	job := sdb.ScheduledJob{
		ID:              "job_test",
		OrganizationID:  orgID,
		CreatedByUserID: adminPrincipal.User.ID,
		Name:            "Sweep",
		Status:          "active",
		TriggerType:     "interval",
		IntervalSeconds: 3600,
		ExecutionTarget: "device",
		TargetDeviceID:  device.ID,
		Prompt:          "Sweep the workspace",
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	run := sdb.JobRun{
		ID:               "run_test",
		JobID:            job.ID,
		OrganizationID:   orgID,
		ExecutionTarget:  "device",
		AssignedDeviceID: device.ID,
		Status:           "queued",
		QueuedAt:         now,
	}
	providerSetting := sdb.ProviderSetting{
		ID:              "provset_test",
		OrganizationID:  orgID,
		CreatedByUserID: adminPrincipal.User.ID,
		Provider:        "anthropic",
		DefaultModel:    "claude-sonnet-5",
		EncryptedAPIKey: "ciphertext",
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	for _, record := range []any{&device, &job, &run, &providerSetting} {
		if err := service.db.Gorm().Create(record).Error; err != nil {
			t.Fatalf("seed scoped resource %T: %v", record, err)
		}
	}

	if err := service.DeleteOrganization(context.Background(), adminPrincipal, orgID); err != nil {
		t.Fatalf("delete organization: %v", err)
	}

	if _, err := service.GetOrganization(context.Background(), adminPrincipal, orgID); err == nil {
		t.Fatal("expected organization to be gone")
	}
	if _, err := service.GetUser(context.Background(), adminPrincipal, member.ID); err != nil {
		t.Fatalf("expected member user to survive organization deletion: %v", err)
	}
	for name, model := range map[string]any{
		"memberships":       &sdb.Membership{},
		"applications":      &sdb.Application{},
		"providers":         &sdb.Provider{},
		"invitations":       &sdb.Invitation{},
		"groups":            &sdb.Group{},
		"policy_bindings":   &sdb.PolicyBinding{},
		"devices":           &sdb.Device{},
		"scheduled_jobs":    &sdb.ScheduledJob{},
		"job_runs":          &sdb.JobRun{},
		"provider_settings": &sdb.ProviderSetting{},
	} {
		var count int64
		if err := service.db.Gorm().Model(model).Where("organization_id = ?", orgID).Count(&count).Error; err != nil {
			t.Fatalf("count %s: %v", name, err)
		}
		if count != 0 {
			t.Fatalf("expected %s to be fully cascaded away, still have %d rows", name, count)
		}
	}
	var auditCount int64
	if err := service.db.Gorm().Model(&sdb.AuditEvent{}).Where("organization_id = ?", orgID).Count(&auditCount).Error; err != nil {
		t.Fatalf("count audit events: %v", err)
	}
	if auditCount == 0 {
		t.Fatal("expected audit history to be preserved after organization deletion")
	}
	if invitation.Token == "" {
		t.Fatal("expected seeded invitation token to exist")
	}
}

func TestDeleteOrganizationRequiresManagePermission(t *testing.T) {
	service := newLifecycleService(t)

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
	orgID := boot.Organizations[0].ID

	viewer, err := service.CreateUser(context.Background(), adminPrincipal, CreateUserParams{
		Email: "viewer@example.com", Password: "password123", DisplayName: "Viewer",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	if _, err := service.CreateMembership(context.Background(), adminPrincipal, CreateMembershipParams{
		OrganizationID: orgID, UserID: viewer.ID, Role: "viewer",
	}); err != nil {
		t.Fatalf("create membership: %v", err)
	}
	viewerLogin, err := service.Login(context.Background(), "viewer@example.com", "password123")
	if err != nil {
		t.Fatalf("login viewer: %v", err)
	}
	viewerPrincipal, err := service.ResolvePrincipal(context.Background(), viewerLogin.Token)
	if err != nil {
		t.Fatalf("resolve viewer principal: %v", err)
	}

	if err := service.DeleteOrganization(context.Background(), viewerPrincipal, orgID); err == nil {
		t.Fatal("expected a viewer to be denied organization deletion")
	}
}

// TestDeleteOrganizationRequiresFreshAuth proves the step-up gate itself
// (see docs/helps/audit-2026-08-29-openwork-den-comparison.md § 9) - a
// principal with full organization.delete permission is still rejected if
// their session hasn't proven identity recently enough, and the
// organization survives untouched.
func TestDeleteOrganizationRequiresFreshAuth(t *testing.T) {
	service := newLifecycleService(t)

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
	orgID := boot.Organizations[0].ID
	// RequireFreshAuth only ever reads the in-memory Session already
	// attached to Principal (no DB round trip - see its own doc comment),
	// so the stale session is simulated by backdating that in-memory field
	// directly, the same way step_up_test.go does.
	adminPrincipal.Session.ReauthenticatedAt = time.Now().UTC().Add(-stepUpFreshnessTTL - time.Minute)

	if err := service.DeleteOrganization(context.Background(), adminPrincipal, orgID); err == nil {
		t.Fatal("expected a stale session to be denied organization deletion")
	}
	if _, err := service.GetOrganization(context.Background(), adminPrincipal, orgID); err != nil {
		t.Fatalf("expected the organization to still exist after a rejected deletion, got: %v", err)
	}
}

func TestNonAdminUserCanLeaveTheirOwnOrganization(t *testing.T) {
	service := newLifecycleService(t)

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
	orgID := boot.Organizations[0].ID

	member, err := service.CreateUser(context.Background(), adminPrincipal, CreateUserParams{
		Email: "member@example.com", Password: "password123", DisplayName: "Member",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	membership, err := service.CreateMembership(context.Background(), adminPrincipal, CreateMembershipParams{
		OrganizationID: orgID, UserID: member.ID, Role: "member",
	})
	if err != nil {
		t.Fatalf("create membership: %v", err)
	}
	memberLogin, err := service.Login(context.Background(), "member@example.com", "password123")
	if err != nil {
		t.Fatalf("login member: %v", err)
	}
	memberPrincipal, err := service.ResolvePrincipal(context.Background(), memberLogin.Token)
	if err != nil {
		t.Fatalf("resolve member principal: %v", err)
	}

	if err := service.DeleteMembership(context.Background(), memberPrincipal, membership.ID); err != nil {
		t.Fatalf("expected member to leave their own organization: %v", err)
	}
	if _, err := service.GetMembership(context.Background(), adminPrincipal, membership.ID); err == nil {
		t.Fatal("expected membership to be removed")
	}
}

func TestDeletingMembershipRevokesDelegatedAccessAndCleansAuthorizationReferences(t *testing.T) {
	service := newLifecycleService(t)

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
	orgID := boot.Organizations[0].ID

	member, err := service.CreateUser(context.Background(), adminPrincipal, CreateUserParams{
		Email: "member@example.com", Password: "password123", DisplayName: "Member",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	membership, err := service.CreateMembership(context.Background(), adminPrincipal, CreateMembershipParams{
		OrganizationID: orgID, UserID: member.ID, Role: "viewer",
	})
	if err != nil {
		t.Fatalf("create membership: %v", err)
	}
	group, err := service.CreateGroup(context.Background(), adminPrincipal, CreateGroupParams{
		OrganizationID: orgID,
		Name:           "Support Operators",
		Slug:           "support-operators",
		MemberUserIDs:  []string{member.ID},
	})
	if err != nil {
		t.Fatalf("create group: %v", err)
	}
	if _, err := service.CreatePolicyBinding(context.Background(), adminPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgID,
		Name:            "Support Invitations",
		SubjectType:     "group",
		SubjectID:       group.ID,
		PermissionCodes: []string{"invitations.manage"},
	}); err != nil {
		t.Fatalf("create group policy binding: %v", err)
	}
	if _, err := service.CreatePolicyBinding(context.Background(), adminPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgID,
		Name:            "Direct Group Read",
		SubjectType:     "user",
		SubjectID:       member.ID,
		PermissionCodes: []string{"groups.read"},
	}); err != nil {
		t.Fatalf("create user policy binding: %v", err)
	}

	memberLogin, err := service.Login(context.Background(), member.Email, "password123")
	if err != nil {
		t.Fatalf("login member: %v", err)
	}
	memberPrincipal, err := service.ResolvePrincipal(context.Background(), memberLogin.Token)
	if err != nil {
		t.Fatalf("resolve member principal: %v", err)
	}

	if _, err := service.CreateInvitation(context.Background(), memberPrincipal, CreateInvitationParams{
		OrganizationID: orgID,
		Email:          "future-user@example.com",
		Role:           "viewer",
	}); err != nil {
		t.Fatalf("expected delegated invitation permission before membership deletion: %v", err)
	}
	groupsBefore, _, err := service.ListGroups(context.Background(), memberPrincipal, orgID, sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list groups before deletion: %v", err)
	}
	if len(groupsBefore) != 1 {
		t.Fatalf("expected delegated group visibility before deletion, got %d", len(groupsBefore))
	}

	if err := service.DeleteMembership(context.Background(), adminPrincipal, membership.ID); err != nil {
		t.Fatalf("delete membership: %v", err)
	}
	if _, err := service.GetMembership(context.Background(), adminPrincipal, membership.ID); err == nil {
		t.Fatal("expected membership to be removed")
	}

	if _, err := service.CreateInvitation(context.Background(), memberPrincipal, CreateInvitationParams{
		OrganizationID: orgID,
		Email:          "still-blocked@example.com",
		Role:           "viewer",
	}); err == nil {
		t.Fatal("expected delegated invitation permission to be revoked with membership deletion")
	}
	groupsAfter, _, err := service.ListGroups(context.Background(), memberPrincipal, orgID, sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list groups after deletion: %v", err)
	}
	if len(groupsAfter) != 0 {
		t.Fatalf("expected no delegated group visibility after deletion, got %d", len(groupsAfter))
	}

	loadedGroup, err := service.GetGroup(context.Background(), adminPrincipal, group.ID)
	if err != nil {
		t.Fatalf("get group as admin: %v", err)
	}
	if len(loadedGroup.MemberUserIDs) != 0 {
		t.Fatalf("expected membership deletion to strip the user from groups, got %+v", loadedGroup.MemberUserIDs)
	}
	var userBindingCount int64
	if err := service.db.Gorm().Model(&sdb.PolicyBinding{}).Where("organization_id = ? AND subject_type = ? AND subject_id = ?", orgID, policySubjectUser, member.ID).Count(&userBindingCount).Error; err != nil {
		t.Fatalf("count user policy bindings: %v", err)
	}
	if userBindingCount != 0 {
		t.Fatalf("expected membership deletion to remove direct user policy bindings, got %d", userBindingCount)
	}

	if _, err := service.CreateMembership(context.Background(), adminPrincipal, CreateMembershipParams{
		OrganizationID: orgID, UserID: member.ID, Role: "viewer",
	}); err != nil {
		t.Fatalf("recreate membership: %v", err)
	}
	if _, err := service.CreateInvitation(context.Background(), memberPrincipal, CreateInvitationParams{
		OrganizationID: orgID,
		Email:          "after-rejoin@example.com",
		Role:           "viewer",
	}); err == nil {
		t.Fatal("expected delegated permissions to stay revoked after rejoining until explicitly regranted")
	}
}

func TestLastOrganizationManagerCannotBeRemoved(t *testing.T) {
	service := newLifecycleService(t)

	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "founder@example.com", Password: "password123", DisplayName: "Founder",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	principal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	ownerMembershipID := boot.Memberships[0].ID

	if err := service.DeleteMembership(context.Background(), principal, ownerMembershipID); err == nil {
		t.Fatal("expected the last owner membership to be protected from removal")
	}
}

func TestOnlyOwnerCanDeleteOrganizationNotAdmin(t *testing.T) {
	service := newLifecycleService(t)

	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "founder@example.com", Password: "password123", DisplayName: "Founder",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	ownerPrincipal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve owner principal: %v", err)
	}
	orgID := boot.Organizations[0].ID

	adminUser, err := service.CreateUser(context.Background(), ownerPrincipal, CreateUserParams{
		Email: "admin2@example.com", Password: "password123", DisplayName: "Second Admin",
	})
	if err != nil {
		t.Fatalf("create admin user: %v", err)
	}
	if _, err := service.CreateMembership(context.Background(), ownerPrincipal, CreateMembershipParams{
		OrganizationID: orgID, UserID: adminUser.ID, Role: "admin",
	}); err != nil {
		t.Fatalf("create admin membership: %v", err)
	}
	adminLogin, err := service.Login(context.Background(), "admin2@example.com", "password123")
	if err != nil {
		t.Fatalf("login admin: %v", err)
	}
	adminPrincipal, err := service.ResolvePrincipal(context.Background(), adminLogin.Token)
	if err != nil {
		t.Fatalf("resolve admin principal: %v", err)
	}

	// An admin can still manage day-to-day settings...
	if _, err := service.UpdateOrganization(context.Background(), adminPrincipal, orgID, UpdateOrganizationParams{
		Name: "Seshat Renamed", Slug: "seshat-renamed",
	}); err != nil {
		t.Fatalf("expected admin to be able to update the organization: %v", err)
	}
	// ...but deleting the organization is an owner-only action.
	if err := service.DeleteOrganization(context.Background(), adminPrincipal, orgID); err == nil {
		t.Fatal("expected an admin (non-owner) to be denied organization deletion")
	}
	if err := service.DeleteOrganization(context.Background(), ownerPrincipal, orgID); err != nil {
		t.Fatalf("expected the owner to be able to delete the organization: %v", err)
	}
}

func TestLastOwnerCannotBeDemotedViaUpdateMembership(t *testing.T) {
	service := newLifecycleService(t)

	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "founder@example.com", Password: "password123", DisplayName: "Founder",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	principal, err := service.ResolvePrincipal(context.Background(), boot.Token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	ownerMembershipID := boot.Memberships[0].ID
	orgID := boot.Organizations[0].ID

	if _, err := service.UpdateMembership(context.Background(), principal, ownerMembershipID, UpdateMembershipParams{Role: "admin"}); err == nil {
		t.Fatal("expected demoting the last owner to be rejected")
	}

	secondOwner, err := service.CreateUser(context.Background(), principal, CreateUserParams{
		Email: "co-owner@example.com", Password: "password123", DisplayName: "Co Owner",
	})
	if err != nil {
		t.Fatalf("create second owner user: %v", err)
	}
	if _, err := service.CreateMembership(context.Background(), principal, CreateMembershipParams{
		OrganizationID: orgID, UserID: secondOwner.ID, Role: "owner",
	}); err != nil {
		t.Fatalf("create second owner membership: %v", err)
	}

	if _, err := service.UpdateMembership(context.Background(), principal, ownerMembershipID, UpdateMembershipParams{Role: "admin"}); err != nil {
		t.Fatalf("expected demotion to succeed once another owner exists: %v", err)
	}
}
