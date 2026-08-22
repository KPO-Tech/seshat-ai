package iam

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// TestIsOrganizationMember covers the bare-userID membership check
// automation.MCPResolver relies on for cloud-job execution, where no live
// Principal exists to hand canAccessOrganization instead.
func TestIsOrganizationMember(t *testing.T) {
	service, adminPrincipal, memberPrincipal, orgID := bootstrapWithMember(t, "member")
	tx := service.db.Gorm()

	isMember, err := service.IsOrganizationMember(tx, memberPrincipal.User.ID, orgID)
	if err != nil {
		t.Fatalf("is organization member: %v", err)
	}
	if !isMember {
		t.Fatal("expected an active member to report as a member")
	}

	otherOrg, err := service.CreateOrganization(context.Background(), adminPrincipal, CreateOrganizationParams{
		Name: "Other Org", Slug: "other-org",
	})
	if err != nil {
		t.Fatalf("create other org: %v", err)
	}
	isMemberOfOther, err := service.IsOrganizationMember(tx, memberPrincipal.User.ID, otherOrg.ID)
	if err != nil {
		t.Fatalf("is organization member (other org): %v", err)
	}
	if isMemberOfOther {
		t.Fatal("expected a member of one org to not report as a member of an unrelated org")
	}

	// A blocked membership must not count, same as canAccessOrganization's
	// own "excluded from every authorization check" convention.
	if err := tx.Model(&sdb.Membership{}).
		Where("user_id = ? AND organization_id = ?", memberPrincipal.User.ID, orgID).
		Update("status", "blocked").Error; err != nil {
		t.Fatalf("block membership: %v", err)
	}
	isMemberBlocked, err := service.IsOrganizationMember(tx, memberPrincipal.User.ID, orgID)
	if err != nil {
		t.Fatalf("is organization member (blocked): %v", err)
	}
	if isMemberBlocked {
		t.Fatal("expected a blocked membership to not count as membership")
	}
}
