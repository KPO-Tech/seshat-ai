package iam

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func TestInvitationManagementRequiresPermission(t *testing.T) {
	service, adminPrincipal, viewerPrincipal, orgID := bootstrapWithMember(t, "viewer")

	if _, err := service.CreateInvitation(context.Background(), viewerPrincipal, CreateInvitationParams{
		OrganizationID: orgID,
		Email:          "someone@example.com",
		Role:           "member",
	}); err == nil {
		t.Fatal("expected a viewer to be denied creating an invitation")
	}

	invitation, err := service.CreateInvitation(context.Background(), adminPrincipal, CreateInvitationParams{
		OrganizationID: orgID,
		Email:          "someone-else@example.com",
		Role:           "member",
	})
	if err != nil {
		t.Fatalf("create invitation as admin: %v", err)
	}

	if _, err := service.GetInvitation(context.Background(), viewerPrincipal, invitation.ID); err == nil {
		t.Fatal("expected a viewer to be denied viewing another user's invitation")
	}
	if _, err := service.RevokeInvitation(context.Background(), viewerPrincipal, invitation.ID); err == nil {
		t.Fatal("expected a viewer to be denied revoking an invitation")
	}

	invitations, _, err := service.ListInvitations(context.Background(), viewerPrincipal, orgID, "", sdb.ListParams{Sort: "created_at", Order: "desc", Limit: 50})
	if err != nil {
		t.Fatalf("list invitations as viewer: %v", err)
	}
	if len(invitations) != 0 {
		t.Fatalf("expected viewer to see no invitations without invitations.read, got %d", len(invitations))
	}
}
