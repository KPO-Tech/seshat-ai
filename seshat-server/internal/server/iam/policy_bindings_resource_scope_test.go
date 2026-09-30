package iam

import (
	"context"
	"strings"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// These tests cover the resource-scope extension to PolicyBinding: a binding
// can now be narrowed to one resource (currently only "corpus") instead of
// always applying organization-wide. Companion coverage that exercises this
// through a real Corpus (not just the permission engine directly) lives in
// internal/server/knowledge, since iam itself never verifies a resource ID
// actually refers to anything.

func TestPolicyBindingRoundTripsResourceScope(t *testing.T) {
	service, adminPrincipal, orgID := bootstrapWithOrgAdmin(t)

	created, err := service.CreatePolicyBinding(context.Background(), adminPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgID,
		Name:            "Finance Corpus Access",
		SubjectType:     "user",
		SubjectID:       adminPrincipal.User.ID,
		PermissionCodes: []string{"knowledge.manage"},
		ResourceType:    "corpus",
		ResourceID:      "corpus-123",
	})
	if err != nil {
		t.Fatalf("create resource-scoped binding: %v", err)
	}
	if created.ResourceType != "corpus" || created.ResourceID != "corpus-123" {
		t.Fatalf("expected resource scope to round-trip on create, got %+v", created)
	}

	fetched, err := service.GetPolicyBinding(context.Background(), adminPrincipal, created.ID)
	if err != nil {
		t.Fatalf("get policy binding: %v", err)
	}
	if fetched.ResourceType != "corpus" || fetched.ResourceID != "corpus-123" {
		t.Fatalf("expected resource scope to round-trip on get, got %+v", fetched)
	}

	bindings, _, err := service.ListPolicyBindings(context.Background(), adminPrincipal, orgID, sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list policy bindings: %v", err)
	}
	found := false
	for _, binding := range bindings {
		if binding.ID == created.ID {
			found = true
			if binding.ResourceType != "corpus" || binding.ResourceID != "corpus-123" {
				t.Fatalf("expected resource scope to round-trip on list, got %+v", binding)
			}
		}
	}
	if !found {
		t.Fatal("expected the created binding to appear in the list")
	}
}

func TestCreatePolicyBindingRejectsInvalidResourceScope(t *testing.T) {
	service, adminPrincipal, orgID := bootstrapWithOrgAdmin(t)

	if _, err := service.CreatePolicyBinding(context.Background(), adminPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgID,
		Name:            "Bad resource type",
		SubjectType:     "user",
		SubjectID:       adminPrincipal.User.ID,
		PermissionCodes: []string{"knowledge.read"},
		ResourceType:    "spaceship",
		ResourceID:      "anything",
	}); err == nil {
		t.Fatal("expected an unknown resource_type to be rejected")
	}

	if _, err := service.CreatePolicyBinding(context.Background(), adminPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgID,
		Name:            "Missing resource id",
		SubjectType:     "user",
		SubjectID:       adminPrincipal.User.ID,
		PermissionCodes: []string{"knowledge.read"},
		ResourceType:    "corpus",
	}); err == nil {
		t.Fatal("expected resource_type set without resource_id to be rejected")
	}
}

// TestResourceScopedBindingDoesNotGrantOrganizationWideAccess proves the
// core semantics of bindingMatchesPrincipal's resource check: a binding
// scoped to one corpus grants the permission on that corpus and nowhere
// else — not on a sibling corpus, not organization-wide.
func TestResourceScopedBindingDoesNotGrantOrganizationWideAccess(t *testing.T) {
	service, adminPrincipal, memberPrincipal, orgID := bootstrapWithMember(t, "viewer")

	if _, err := service.CreatePolicyBinding(context.Background(), adminPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgID,
		Name:            "Corpus A access",
		SubjectType:     "user",
		SubjectID:       memberPrincipal.User.ID,
		PermissionCodes: []string{"knowledge.manage"},
		ResourceType:    "corpus",
		ResourceID:      "corpus-a",
	}); err != nil {
		t.Fatalf("create resource-scoped binding: %v", err)
	}

	tx := service.db.Gorm()

	if err := service.CheckResourcePermission(tx, memberPrincipal, orgID, "corpus", "corpus-a", "knowledge.manage"); err != nil {
		t.Fatalf("expected member to hold knowledge.manage on corpus-a: %v", err)
	}
	if err := service.CheckResourcePermission(tx, memberPrincipal, orgID, "corpus", "corpus-b", "knowledge.manage"); err == nil {
		t.Fatal("expected member to be denied knowledge.manage on a different corpus")
	}
	if err := service.CheckOrganizationPermission(tx, memberPrincipal, orgID, "knowledge.manage"); err == nil {
		t.Fatal("expected a corpus-scoped grant to not leak into an organization-wide check")
	}
}

// TestResourceScopedGrantCannotEscalateToOrganizationWideBinding extends the
// 2026-08-06 privilege-escalation protection (requirePermissionsWithinCallerScope)
// to the new resource dimension: holding a permission scoped to one resource
// must not be enough to grant that same permission organization-wide, only
// to grant it scoped to that same resource.
func TestResourceScopedGrantCannotEscalateToOrganizationWideBinding(t *testing.T) {
	service, adminPrincipal, memberPrincipal, orgID := bootstrapWithMember(t, "viewer")

	// Organization-wide policies.manage (so the member can create policy
	// bindings of any scope at all — the entry gate for CreatePolicyBinding)
	// plus knowledge.manage scoped to corpus-a only (the permission whose
	// delegation is under test). Two separate bindings, since ResourceType/
	// ResourceID apply to a whole binding, not per permission code.
	if _, err := service.CreatePolicyBinding(context.Background(), adminPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgID,
		Name:            "Policy administration",
		SubjectType:     "user",
		SubjectID:       memberPrincipal.User.ID,
		PermissionCodes: []string{"policies.manage"},
	}); err != nil {
		t.Fatalf("grant organization-wide policies.manage: %v", err)
	}
	if _, err := service.CreatePolicyBinding(context.Background(), adminPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgID,
		Name:            "Corpus A management",
		SubjectType:     "user",
		SubjectID:       memberPrincipal.User.ID,
		PermissionCodes: []string{"knowledge.manage"},
		ResourceType:    "corpus",
		ResourceID:      "corpus-a",
	}); err != nil {
		t.Fatalf("grant corpus-scoped knowledge.manage: %v", err)
	}

	// Cannot use their corpus-a-scoped knowledge.manage to grant it
	// organization-wide to someone else.
	if _, err := service.CreatePolicyBinding(context.Background(), memberPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgID,
		Name:            "attempted org-wide escalation",
		SubjectType:     "user",
		SubjectID:       memberPrincipal.User.ID,
		PermissionCodes: []string{"knowledge.manage"},
	}); err == nil {
		t.Fatal("expected a corpus-scoped holder to be denied granting knowledge.manage organization-wide")
	} else if !strings.Contains(err.Error(), "cannot grant a permission you do not hold") {
		t.Fatalf("expected a permission-cap error, got: %v", err)
	}

	// But delegating that same permission, scoped to that same corpus, to
	// someone else must still work — this is a legitimate within-scope grant.
	if _, err := service.CreatePolicyBinding(context.Background(), memberPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgID,
		Name:            "delegated corpus-a access",
		SubjectType:     "user",
		SubjectID:       memberPrincipal.User.ID,
		PermissionCodes: []string{"knowledge.manage"},
		ResourceType:    "corpus",
		ResourceID:      "corpus-a",
	}); err != nil {
		t.Fatalf("expected a corpus-scoped holder to grant that same scope: %v", err)
	}

	// And escalating to a *different* corpus must still be denied — holding
	// the permission on corpus-a says nothing about corpus-b.
	if _, err := service.CreatePolicyBinding(context.Background(), memberPrincipal, CreatePolicyBindingParams{
		OrganizationID:  orgID,
		Name:            "attempted lateral escalation",
		SubjectType:     "user",
		SubjectID:       memberPrincipal.User.ID,
		PermissionCodes: []string{"knowledge.manage"},
		ResourceType:    "corpus",
		ResourceID:      "corpus-b",
	}); err == nil {
		t.Fatal("expected a corpus-a-scoped holder to be denied granting access to corpus-b")
	} else if !strings.Contains(err.Error(), "cannot grant a permission you do not hold") {
		t.Fatalf("expected a permission-cap error, got: %v", err)
	}
}
