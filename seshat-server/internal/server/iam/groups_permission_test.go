package iam

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func TestGroupManagementRequiresPermission(t *testing.T) {
	service, adminPrincipal, viewerPrincipal, orgID := bootstrapWithMember(t, "viewer")

	if _, err := service.CreateGroup(context.Background(), viewerPrincipal, CreateGroupParams{
		OrganizationID: orgID,
		Name:           "Ops",
		Slug:           "ops",
	}); err == nil {
		t.Fatal("expected a viewer to be denied creating a group")
	}

	group, err := service.CreateGroup(context.Background(), adminPrincipal, CreateGroupParams{
		OrganizationID: orgID,
		Name:           "Ops",
		Slug:           "ops",
	})
	if err != nil {
		t.Fatalf("create group as admin: %v", err)
	}

	if _, err := service.GetGroup(context.Background(), viewerPrincipal, group.ID); err == nil {
		t.Fatal("expected a viewer to be denied viewing a group without groups.read")
	}
	if _, err := service.UpdateGroup(context.Background(), viewerPrincipal, group.ID, UpdateGroupParams{
		Name: "Ops Updated",
		Slug: "ops",
	}); err == nil {
		t.Fatal("expected a viewer to be denied updating a group")
	}
	if err := service.DeleteGroup(context.Background(), viewerPrincipal, group.ID); err == nil {
		t.Fatal("expected a viewer to be denied deleting a group")
	}

	groups, _, err := service.ListGroups(context.Background(), viewerPrincipal, orgID, sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list groups as viewer: %v", err)
	}
	if len(groups) != 0 {
		t.Fatalf("expected viewer to see no groups without groups.read, got %d", len(groups))
	}
}
