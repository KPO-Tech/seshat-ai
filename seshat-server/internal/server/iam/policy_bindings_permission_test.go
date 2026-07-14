package iam

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func TestPolicyBindingManagementRequiresPermission(t *testing.T) {
	service, adminPrincipal, viewerPrincipal, orgID := bootstrapWithMember(t, "viewer")

	if _, err := service.CreatePolicyBinding(context.Background(), viewerPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgID,
		Name:            "Support Access",
		SubjectType:     "role",
		SubjectID:       "member",
		PermissionCodes: []string{"invitations.manage"},
	}); err == nil {
		t.Fatal("expected a viewer to be denied creating a policy binding")
	}

	binding, err := service.CreatePolicyBinding(context.Background(), adminPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgID,
		Name:            "Support Access",
		SubjectType:     "role",
		SubjectID:       "member",
		PermissionCodes: []string{"invitations.manage"},
	})
	if err != nil {
		t.Fatalf("create policy binding as admin: %v", err)
	}

	if _, err := service.GetPolicyBinding(context.Background(), viewerPrincipal, binding.ID); err == nil {
		t.Fatal("expected a viewer to be denied viewing a policy binding without policies.read")
	}
	if _, err := service.UpdatePolicyBinding(context.Background(), viewerPrincipal, binding.ID, UpdatePolicyBindingParams{
		Name:            "Renamed",
		SubjectType:     "role",
		SubjectID:       "member",
		PermissionCodes: []string{"invitations.manage"},
	}); err == nil {
		t.Fatal("expected a viewer to be denied updating a policy binding")
	}
	if err := service.DeletePolicyBinding(context.Background(), viewerPrincipal, binding.ID); err == nil {
		t.Fatal("expected a viewer to be denied deleting a policy binding")
	}

	bindings, _, err := service.ListPolicyBindings(context.Background(), viewerPrincipal, orgID, sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list policy bindings as viewer: %v", err)
	}
	if len(bindings) != 0 {
		t.Fatalf("expected viewer to see no policy bindings without policies.read, got %d", len(bindings))
	}
}
