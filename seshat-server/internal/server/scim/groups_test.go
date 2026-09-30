package scim

import (
	"context"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func connectionWithMode(t *testing.T, env testEnv, syncGroups, autoCreateTeams bool) *Connection {
	t.Helper()
	created, err := env.scim.CreateConnection(context.Background(), env.adminPrincipal, CreateConnectionParams{
		OrganizationID: env.orgID, Name: "Okta", SyncGroups: syncGroups, AutoCreateTeams: autoCreateTeams,
	})
	if err != nil {
		t.Fatalf("create connection: %v", err)
	}
	return &created.Connection
}

func TestCreateScimGroupRejectedWhenSyncGroupsDisabled(t *testing.T) {
	env := newTestEnv(t)
	connection := connectionWithMode(t, env, false, false)

	if _, err := env.scim.CreateScimGroup(context.Background(), connection, CreateGroupRequest{DisplayName: "Engineering"}); err != ErrGroupSyncDisabled {
		t.Fatalf("expected ErrGroupSyncDisabled, got: %v", err)
	}
}

func TestCreateScimGroupMetadataOnlyModeNeverPersistsAGroup(t *testing.T) {
	env := newTestEnv(t)
	connection := connectionWithMode(t, env, true, false)

	resource, err := env.scim.CreateScimGroup(context.Background(), connection, CreateGroupRequest{
		DisplayName: "Engineering", ExternalID: "idp-grp-1",
	})
	if err != nil {
		t.Fatalf("create (metadata-only mode should still return 2xx-shaped success): %v", err)
	}
	if resource.DisplayName != "Engineering" {
		t.Fatalf("unexpected resource: %+v", resource)
	}

	// The whole point of "metadata only": nothing was actually persisted, so
	// a follow-up GET by the id just returned must 404.
	if _, err := env.scim.GetScimGroup(context.Background(), connection, resource.ID); err == nil {
		t.Fatal("expected a metadata-only group to not be independently addressable afterward")
	}

	// But the push itself was recorded for admin visibility.
	var count int64
	if err := env.db.Gorm().Table("scim_sync_events").
		Where("scim_connection_id = ? AND operation = ?", connection.ID, "group.create.metadata_only").
		Count(&count).Error; err != nil {
		t.Fatalf("query sync events: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected the metadata-only push to be logged, got count=%d", count)
	}
}

func TestCreateScimGroupAutoCreateTeamsModePersistsARealGroup(t *testing.T) {
	env := newTestEnv(t)
	connection := connectionWithMode(t, env, true, true)

	member, err := env.iam.ProvisionScimMember(context.Background(), iam.ProvisionScimMemberParams{
		OrganizationID: env.orgID, Email: "alice@example.com", DisplayName: "Alice", Active: true,
	})
	if err != nil {
		t.Fatalf("provision member: %v", err)
	}

	resource, err := env.scim.CreateScimGroup(context.Background(), connection, CreateGroupRequest{
		DisplayName: "Engineering", Members: []ScimGroupMember{{Value: member.UserID}},
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if len(resource.Members) != 1 || resource.Members[0].Value != member.UserID {
		t.Fatalf("unexpected members: %+v", resource.Members)
	}

	fetched, err := env.scim.GetScimGroup(context.Background(), connection, resource.ID)
	if err != nil {
		t.Fatalf("expected an auto-created group to be independently addressable: %v", err)
	}
	if fetched.DisplayName != "Engineering" {
		t.Fatalf("unexpected fetched group: %+v", fetched)
	}
}

func TestPatchScimGroupAddAndRemoveMembers(t *testing.T) {
	env := newTestEnv(t)
	connection := connectionWithMode(t, env, true, true)

	alice, err := env.iam.ProvisionScimMember(context.Background(), iam.ProvisionScimMemberParams{
		OrganizationID: env.orgID, Email: "alice@example.com", DisplayName: "Alice", Active: true,
	})
	if err != nil {
		t.Fatalf("provision alice: %v", err)
	}
	bob, err := env.iam.ProvisionScimMember(context.Background(), iam.ProvisionScimMemberParams{
		OrganizationID: env.orgID, Email: "bob@example.com", DisplayName: "Bob", Active: true,
	})
	if err != nil {
		t.Fatalf("provision bob: %v", err)
	}

	created, err := env.scim.CreateScimGroup(context.Background(), connection, CreateGroupRequest{
		DisplayName: "Engineering", Members: []ScimGroupMember{{Value: alice.UserID}},
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	added, err := env.scim.PatchScimGroup(context.Background(), connection, created.ID, []PatchOperation{
		{Op: "add", Path: "members", Value: []any{map[string]any{"value": bob.UserID}}},
	})
	if err != nil {
		t.Fatalf("patch add: %v", err)
	}
	if len(added.Members) != 2 {
		t.Fatalf("expected 2 members after add, got %+v", added.Members)
	}

	removed, err := env.scim.PatchScimGroup(context.Background(), connection, created.ID, []PatchOperation{
		{Op: "remove", Path: `members[value eq "` + alice.UserID + `"]`},
	})
	if err != nil {
		t.Fatalf("patch remove: %v", err)
	}
	if len(removed.Members) != 1 || removed.Members[0].Value != bob.UserID {
		t.Fatalf("expected only bob to remain, got %+v", removed.Members)
	}
}

func TestPatchScimGroupRejectedInMetadataOnlyMode(t *testing.T) {
	env := newTestEnv(t)
	connection := connectionWithMode(t, env, true, false)

	if _, err := env.scim.PatchScimGroup(context.Background(), connection, "grp_whatever", []PatchOperation{
		{Op: "replace", Path: "displayName", Value: "New Name"},
	}); err == nil {
		t.Fatal("expected PATCH to be rejected (404) in metadata-only mode, since nothing was ever persisted")
	}
}

func TestDeleteScimGroupInAutoCreateTeamsMode(t *testing.T) {
	env := newTestEnv(t)
	connection := connectionWithMode(t, env, true, true)

	created, err := env.scim.CreateScimGroup(context.Background(), connection, CreateGroupRequest{DisplayName: "Engineering"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := env.scim.DeleteScimGroup(context.Background(), connection, created.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := env.scim.GetScimGroup(context.Background(), connection, created.ID); err == nil {
		t.Fatal("expected the group to be gone after delete")
	}
}

func TestTogglingConnectionModeNeverPurgesSyncEventHistory(t *testing.T) {
	env := newTestEnv(t)
	connection := connectionWithMode(t, env, true, false)

	if _, err := env.scim.CreateScimGroup(context.Background(), connection, CreateGroupRequest{DisplayName: "Engineering"}); err != nil {
		t.Fatalf("create in metadata-only mode: %v", err)
	}
	var countBefore int64
	if err := env.db.Gorm().Table("scim_sync_events").Where("scim_connection_id = ?", connection.ID).Count(&countBefore).Error; err != nil {
		t.Fatalf("count before: %v", err)
	}
	if countBefore != 1 {
		t.Fatalf("expected 1 event recorded before the toggle, got %d", countBefore)
	}

	// Flip the connection into auto-create-teams mode.
	if _, err := env.scim.UpdateConnection(context.Background(), env.adminPrincipal, env.orgID, UpdateConnectionParams{
		Name: "Okta", Enabled: true, SyncGroups: true, AutoCreateTeams: true,
	}); err != nil {
		t.Fatalf("update connection mode: %v", err)
	}

	var countAfter int64
	if err := env.db.Gorm().Table("scim_sync_events").Where("scim_connection_id = ?", connection.ID).Count(&countAfter).Error; err != nil {
		t.Fatalf("count after: %v", err)
	}
	if countAfter != countBefore {
		t.Fatalf("expected the pre-toggle sync event history to survive a mode change, before=%d after=%d", countBefore, countAfter)
	}
}

func TestListScimGroupsOnlyReturnsAutoCreatedGroups(t *testing.T) {
	env := newTestEnv(t)
	connection := connectionWithMode(t, env, true, true)

	if _, err := env.scim.CreateScimGroup(context.Background(), connection, CreateGroupRequest{DisplayName: "Engineering"}); err != nil {
		t.Fatalf("create: %v", err)
	}
	resources, total, err := env.scim.ListScimGroups(context.Background(), connection, 1, 100)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 1 || len(resources) != 1 {
		t.Fatalf("expected exactly the one auto-created group, got total=%d resources=%+v", total, resources)
	}
}
