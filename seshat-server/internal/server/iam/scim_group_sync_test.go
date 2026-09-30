package iam

import (
	"context"
	"testing"
)

func bootstrapForScimGroupTests(t *testing.T) (service *Service, orgID string) {
	t.Helper()
	service = newTestService(t)
	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "admin@example.com", Password: "password123", DisplayName: "Admin",
		OrganizationName: "Seshat", OrganizationSlug: "seshat",
	})
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	return service, boot.Organizations[0].ID
}

func TestSyncScimGroupCreateWithExistingMembers(t *testing.T) {
	service, orgID := bootstrapForScimGroupTests(t)
	member, err := service.ProvisionScimMember(context.Background(), ProvisionScimMemberParams{
		OrganizationID: orgID, Email: "alice@example.com", DisplayName: "Alice", Active: true,
	})
	if err != nil {
		t.Fatalf("provision member: %v", err)
	}

	group, err := service.SyncScimGroupCreate(context.Background(), SyncScimGroupCreateParams{
		OrganizationID: orgID, DisplayName: "Engineering", ExternalID: "idp-grp-1",
		MemberUserIDs: []string{member.UserID},
	})
	if err != nil {
		t.Fatalf("sync create: %v", err)
	}
	if group.Name != "Engineering" || len(group.MemberUserIDs) != 1 || group.MemberUserIDs[0] != member.UserID {
		t.Fatalf("unexpected group: %+v", group)
	}
	if group.ScimExternalID == nil || *group.ScimExternalID != "idp-grp-1" {
		t.Fatalf("expected external id to round-trip, got %+v", group.ScimExternalID)
	}
}

func TestSyncScimGroupCreateRejectsUnknownMemberWithoutPanicking(t *testing.T) {
	service, orgID := bootstrapForScimGroupTests(t)

	if _, err := service.SyncScimGroupCreate(context.Background(), SyncScimGroupCreateParams{
		OrganizationID: orgID, DisplayName: "Engineering", MemberUserIDs: []string{"usr_does_not_exist"},
	}); err == nil {
		t.Fatal("expected a group referencing an unprovisioned user to be rejected with a clear error")
	}
}

func TestSyncScimGroupCreateRejectsDuplicateName(t *testing.T) {
	service, orgID := bootstrapForScimGroupTests(t)
	if _, err := service.SyncScimGroupCreate(context.Background(), SyncScimGroupCreateParams{
		OrganizationID: orgID, DisplayName: "Engineering",
	}); err != nil {
		t.Fatalf("first create: %v", err)
	}
	if _, err := service.SyncScimGroupCreate(context.Background(), SyncScimGroupCreateParams{
		OrganizationID: orgID, DisplayName: "Engineering",
	}); err == nil {
		t.Fatal("expected a duplicate group name to be rejected")
	}
}

func TestUpdateScimGroupReplacesMembership(t *testing.T) {
	service, orgID := bootstrapForScimGroupTests(t)
	alice, err := service.ProvisionScimMember(context.Background(), ProvisionScimMemberParams{
		OrganizationID: orgID, Email: "alice@example.com", DisplayName: "Alice", Active: true,
	})
	if err != nil {
		t.Fatalf("provision alice: %v", err)
	}
	bob, err := service.ProvisionScimMember(context.Background(), ProvisionScimMemberParams{
		OrganizationID: orgID, Email: "bob@example.com", DisplayName: "Bob", Active: true,
	})
	if err != nil {
		t.Fatalf("provision bob: %v", err)
	}
	group, err := service.SyncScimGroupCreate(context.Background(), SyncScimGroupCreateParams{
		OrganizationID: orgID, DisplayName: "Engineering", MemberUserIDs: []string{alice.UserID},
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	updated, err := service.UpdateScimGroup(context.Background(), orgID, group.ID, UpdateScimGroupParams{
		DisplayName: "Engineering", MemberUserIDs: []string{bob.UserID},
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if len(updated.MemberUserIDs) != 1 || updated.MemberUserIDs[0] != bob.UserID {
		t.Fatalf("expected membership to be fully replaced (alice out, bob in), got %+v", updated.MemberUserIDs)
	}
}

func TestDeleteScimGroupReallyDeletesTheRow(t *testing.T) {
	service, orgID := bootstrapForScimGroupTests(t)
	group, err := service.SyncScimGroupCreate(context.Background(), SyncScimGroupCreateParams{
		OrganizationID: orgID, DisplayName: "Engineering",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := service.DeleteScimGroup(context.Background(), orgID, group.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := service.GetScimGroupByID(context.Background(), orgID, group.ID); err == nil {
		t.Fatal("expected the group to be genuinely gone after delete, unlike a deactivated membership")
	}
}

func TestGetScimGroupByIDRejectsCrossOrganizationAccess(t *testing.T) {
	serviceA, orgA := bootstrapForScimGroupTests(t)
	principalA, err := serviceA.ResolvePrincipal(context.Background(), mustLoginAdmin(t, serviceA))
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	orgB, err := serviceA.CreateOrganization(context.Background(), principalA, CreateOrganizationParams{Name: "Org B", Slug: "org-b"})
	if err != nil {
		t.Fatalf("create org b: %v", err)
	}

	group, err := serviceA.SyncScimGroupCreate(context.Background(), SyncScimGroupCreateParams{
		OrganizationID: orgA, DisplayName: "Engineering",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := serviceA.GetScimGroupByID(context.Background(), orgB.ID, group.ID); err == nil {
		t.Fatal("expected a group to be inaccessible from a different organization")
	}
}

func mustLoginAdmin(t *testing.T, service *Service) string {
	t.Helper()
	login, err := service.Login(context.Background(), "admin@example.com", "password123")
	if err != nil {
		t.Fatalf("login admin: %v", err)
	}
	return login.Token
}

func TestListScimGroupsPaginates(t *testing.T) {
	service, orgID := bootstrapForScimGroupTests(t)
	for _, name := range []string{"Engineering", "Sales", "Support"} {
		if _, err := service.SyncScimGroupCreate(context.Background(), SyncScimGroupCreateParams{
			OrganizationID: orgID, DisplayName: name,
		}); err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
	}
	page1, total, err := service.ListScimGroups(context.Background(), orgID, 0, 2)
	if err != nil {
		t.Fatalf("list page 1: %v", err)
	}
	if total != 3 || len(page1) != 2 {
		t.Fatalf("expected total=3 page size 2, got total=%d len=%d", total, len(page1))
	}
}
