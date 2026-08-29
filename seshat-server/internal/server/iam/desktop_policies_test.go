package iam

import (
	"context"
	"testing"
)

// desktopPolicyTestEnv bootstraps a service + org + owner + one "member"-
// role user, ready for ResolveDesktopPolicies/SetDesktopPolicyBinding tests.
type desktopPolicyTestEnv struct {
	service         *Service
	ownerPrincipal  *Principal
	orgID           string
	memberPrincipal *Principal
}

func newDesktopPolicyTestEnv(t *testing.T) desktopPolicyTestEnv {
	t.Helper()
	service := newTestService(t)

	boot, err := service.Bootstrap(context.Background(), BootstrapParams{
		Email: "owner@example.com", Password: "password123", DisplayName: "Owner",
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

	member, err := service.CreateUser(context.Background(), ownerPrincipal, CreateUserParams{
		Email: "member@example.com", Password: "password123", DisplayName: "Member",
		OrganizationID: orgID, Role: "member",
	})
	if err != nil {
		t.Fatalf("create member user: %v", err)
	}
	login, err := service.Login(context.Background(), member.Email, "password123")
	if err != nil {
		t.Fatalf("login member: %v", err)
	}
	memberPrincipal, err := service.ResolvePrincipal(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve member principal: %v", err)
	}

	return desktopPolicyTestEnv{service: service, ownerPrincipal: ownerPrincipal, orgID: orgID, memberPrincipal: memberPrincipal}
}

func (env desktopPolicyTestEnv) resolve(t *testing.T, userID string) map[string]bool {
	t.Helper()
	result, err := env.service.ResolveDesktopPolicies(env.service.db.Gorm(), env.orgID, userID)
	if err != nil {
		t.Fatalf("ResolveDesktopPolicies: %v", err)
	}
	return result
}

func TestListDesktopPolicyCatalogReturnsFixedCatalog(t *testing.T) {
	env := newDesktopPolicyTestEnv(t)
	catalog, err := env.service.ListDesktopPolicyCatalog(context.Background(), env.memberPrincipal)
	if err != nil {
		t.Fatalf("ListDesktopPolicyCatalog: %v", err)
	}
	if len(catalog) != 4 {
		t.Fatalf("expected 4 catalog entries, got %d", len(catalog))
	}
	for _, policy := range catalog {
		if !policy.DefaultValue {
			t.Fatalf("expected every catalog policy to default to true (unrestricted), got %+v", policy)
		}
		if policy.AdminDescription == "" || policy.UserBlockedMessage == "" {
			t.Fatalf("expected a non-empty admin description and user-facing message, got %+v", policy)
		}
	}
}

func TestListDesktopPolicyCatalogRequiresAuthentication(t *testing.T) {
	env := newDesktopPolicyTestEnv(t)
	if _, err := env.service.ListDesktopPolicyCatalog(context.Background(), nil); err == nil {
		t.Fatal("expected an unauthenticated call to be rejected")
	}
}

func TestResolveDesktopPoliciesDefaultsWhenNoBindings(t *testing.T) {
	env := newDesktopPolicyTestEnv(t)
	result := env.resolve(t, env.memberPrincipal.User.ID)
	for _, policy := range desktopPolicyCatalog() {
		if !result[policy.Code] {
			t.Fatalf("expected %s to default to true with no bindings, got %+v", policy.Code, result)
		}
	}
}

func TestResolveDesktopPoliciesOrgWideBindingRestricts(t *testing.T) {
	env := newDesktopPolicyTestEnv(t)
	if _, err := env.service.SetDesktopPolicyBinding(context.Background(), env.ownerPrincipal, SetDesktopPolicyBindingParams{
		OrganizationID: env.orgID, PolicyCode: DesktopPolicyAllowCustomProviders, SubjectType: desktopPolicySubjectOrg, Value: false,
	}); err != nil {
		t.Fatalf("SetDesktopPolicyBinding: %v", err)
	}

	result := env.resolve(t, env.memberPrincipal.User.ID)
	if result[DesktopPolicyAllowCustomProviders] {
		t.Fatal("expected the org-wide binding to restrict allow_custom_providers")
	}
	if !result[DesktopPolicyAllowLocalModels] {
		t.Fatal("expected an unrelated policy to remain at its default")
	}

	// The org-wide restriction applies to every member, not just the one
	// tested above.
	ownerResult := env.resolve(t, env.ownerPrincipal.User.ID)
	if ownerResult[DesktopPolicyAllowCustomProviders] {
		t.Fatal("expected the org-wide binding to restrict the owner too")
	}
}

func TestResolveDesktopPoliciesRoleBindingRestricts(t *testing.T) {
	env := newDesktopPolicyTestEnv(t)
	if _, err := env.service.SetDesktopPolicyBinding(context.Background(), env.ownerPrincipal, SetDesktopPolicyBindingParams{
		OrganizationID: env.orgID, PolicyCode: DesktopPolicyAllowLocalModels, SubjectType: policySubjectRole, SubjectID: "member", Value: false,
	}); err != nil {
		t.Fatalf("SetDesktopPolicyBinding: %v", err)
	}

	memberResult := env.resolve(t, env.memberPrincipal.User.ID)
	if memberResult[DesktopPolicyAllowLocalModels] {
		t.Fatal("expected the role-scoped binding to restrict a member")
	}
	ownerResult := env.resolve(t, env.ownerPrincipal.User.ID)
	if !ownerResult[DesktopPolicyAllowLocalModels] {
		t.Fatal("expected the role-scoped binding on \"member\" to leave the owner (a different role) unaffected")
	}
}

func TestResolveDesktopPoliciesUserBindingRestricts(t *testing.T) {
	env := newDesktopPolicyTestEnv(t)
	if _, err := env.service.SetDesktopPolicyBinding(context.Background(), env.ownerPrincipal, SetDesktopPolicyBindingParams{
		OrganizationID: env.orgID, PolicyCode: DesktopPolicyAllowMultipleWorkspaces, SubjectType: policySubjectUser, SubjectID: env.memberPrincipal.User.ID, Value: false,
	}); err != nil {
		t.Fatalf("SetDesktopPolicyBinding: %v", err)
	}

	memberResult := env.resolve(t, env.memberPrincipal.User.ID)
	if memberResult[DesktopPolicyAllowMultipleWorkspaces] {
		t.Fatal("expected the user-scoped binding to restrict this specific member")
	}
	ownerResult := env.resolve(t, env.ownerPrincipal.User.ID)
	if !ownerResult[DesktopPolicyAllowMultipleWorkspaces] {
		t.Fatal("expected a different user to remain unaffected")
	}
}

func TestResolveDesktopPoliciesGroupBindingRestricts(t *testing.T) {
	env := newDesktopPolicyTestEnv(t)
	group, err := env.service.CreateGroup(context.Background(), env.ownerPrincipal, CreateGroupParams{
		OrganizationID: env.orgID, Name: "Contractors", Slug: "contractors", MemberUserIDs: []string{env.memberPrincipal.User.ID},
	})
	if err != nil {
		t.Fatalf("create group: %v", err)
	}
	if _, err := env.service.SetDesktopPolicyBinding(context.Background(), env.ownerPrincipal, SetDesktopPolicyBindingParams{
		OrganizationID: env.orgID, PolicyCode: DesktopPolicyAllowSettingsModification, SubjectType: policySubjectGroup, SubjectID: group.ID, Value: false,
	}); err != nil {
		t.Fatalf("SetDesktopPolicyBinding: %v", err)
	}

	memberResult := env.resolve(t, env.memberPrincipal.User.ID)
	if memberResult[DesktopPolicyAllowSettingsModification] {
		t.Fatal("expected the group-scoped binding to restrict a member of that group")
	}
	ownerResult := env.resolve(t, env.ownerPrincipal.User.ID)
	if !ownerResult[DesktopPolicyAllowSettingsModification] {
		t.Fatal("expected a user outside the group to remain unaffected")
	}
}

// TestResolveDesktopPoliciesANDsAcrossApplicableSources is the core proof of
// the chosen "most restrictive wins" semantics: a role-level restriction is
// not overridable by a more specific, more permissive user-level binding —
// there is no exception mechanism, by design (see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 5).
func TestResolveDesktopPoliciesANDsAcrossApplicableSources(t *testing.T) {
	env := newDesktopPolicyTestEnv(t)
	if _, err := env.service.SetDesktopPolicyBinding(context.Background(), env.ownerPrincipal, SetDesktopPolicyBindingParams{
		OrganizationID: env.orgID, PolicyCode: DesktopPolicyAllowCustomProviders, SubjectType: policySubjectRole, SubjectID: "member", Value: false,
	}); err != nil {
		t.Fatalf("SetDesktopPolicyBinding (role): %v", err)
	}
	// An explicit, more specific "true" for this exact member must NOT undo
	// the role-level restriction.
	if _, err := env.service.SetDesktopPolicyBinding(context.Background(), env.ownerPrincipal, SetDesktopPolicyBindingParams{
		OrganizationID: env.orgID, PolicyCode: DesktopPolicyAllowCustomProviders, SubjectType: policySubjectUser, SubjectID: env.memberPrincipal.User.ID, Value: true,
	}); err != nil {
		t.Fatalf("SetDesktopPolicyBinding (user): %v", err)
	}

	result := env.resolve(t, env.memberPrincipal.User.ID)
	if result[DesktopPolicyAllowCustomProviders] {
		t.Fatal("expected the role-level restriction to win over a more specific but more permissive user-level binding (AND semantics, no exceptions)")
	}
}

func TestSetDesktopPolicyBindingUpsertsInPlace(t *testing.T) {
	env := newDesktopPolicyTestEnv(t)
	first, err := env.service.SetDesktopPolicyBinding(context.Background(), env.ownerPrincipal, SetDesktopPolicyBindingParams{
		OrganizationID: env.orgID, PolicyCode: DesktopPolicyAllowCustomProviders, SubjectType: desktopPolicySubjectOrg, Value: false,
	})
	if err != nil {
		t.Fatalf("first SetDesktopPolicyBinding: %v", err)
	}
	second, err := env.service.SetDesktopPolicyBinding(context.Background(), env.ownerPrincipal, SetDesktopPolicyBindingParams{
		OrganizationID: env.orgID, PolicyCode: DesktopPolicyAllowCustomProviders, SubjectType: desktopPolicySubjectOrg, Value: true,
	})
	if err != nil {
		t.Fatalf("second SetDesktopPolicyBinding: %v", err)
	}
	if first.ID != second.ID {
		t.Fatalf("expected the same binding row to be updated in place, got %q then %q", first.ID, second.ID)
	}

	bindings, err := env.service.ListDesktopPolicyBindings(context.Background(), env.ownerPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("ListDesktopPolicyBindings: %v", err)
	}
	if len(bindings) != 1 {
		t.Fatalf("expected exactly one binding after upserting twice, got %d: %+v", len(bindings), bindings)
	}
	if !bindings[0].Value {
		t.Fatalf("expected the binding's value to reflect the second call, got %+v", bindings[0])
	}
}

func TestSetDesktopPolicyBindingRejectsUnknownPolicyCode(t *testing.T) {
	env := newDesktopPolicyTestEnv(t)
	if _, err := env.service.SetDesktopPolicyBinding(context.Background(), env.ownerPrincipal, SetDesktopPolicyBindingParams{
		OrganizationID: env.orgID, PolicyCode: "not_a_real_policy", SubjectType: desktopPolicySubjectOrg, Value: false,
	}); err == nil {
		t.Fatal("expected an unknown policy_code to be rejected")
	}
}

func TestSetDesktopPolicyBindingRejectsOrgSubjectWithID(t *testing.T) {
	env := newDesktopPolicyTestEnv(t)
	if _, err := env.service.SetDesktopPolicyBinding(context.Background(), env.ownerPrincipal, SetDesktopPolicyBindingParams{
		OrganizationID: env.orgID, PolicyCode: DesktopPolicyAllowCustomProviders, SubjectType: desktopPolicySubjectOrg, SubjectID: "should-be-empty", Value: false,
	}); err == nil {
		t.Fatal("expected a non-empty subject_id on an org-wide binding to be rejected")
	}
}

func TestSetDesktopPolicyBindingRejectsUserOutsideOrganization(t *testing.T) {
	env := newDesktopPolicyTestEnv(t)
	if _, err := env.service.SetDesktopPolicyBinding(context.Background(), env.ownerPrincipal, SetDesktopPolicyBindingParams{
		OrganizationID: env.orgID, PolicyCode: DesktopPolicyAllowCustomProviders, SubjectType: policySubjectUser, SubjectID: "usr_does_not_exist", Value: false,
	}); err == nil {
		t.Fatal("expected an unknown/non-member user subject to be rejected")
	}
}

func TestSetDesktopPolicyBindingRequiresPermission(t *testing.T) {
	env := newDesktopPolicyTestEnv(t)
	if _, err := env.service.SetDesktopPolicyBinding(context.Background(), env.memberPrincipal, SetDesktopPolicyBindingParams{
		OrganizationID: env.orgID, PolicyCode: DesktopPolicyAllowCustomProviders, SubjectType: desktopPolicySubjectOrg, Value: false,
	}); err == nil {
		t.Fatal("expected a plain member without desktop_policies.manage to be denied")
	}
}

func TestListDesktopPolicyBindingsRequiresPermission(t *testing.T) {
	env := newDesktopPolicyTestEnv(t)
	if _, err := env.service.ListDesktopPolicyBindings(context.Background(), env.memberPrincipal, env.orgID); err == nil {
		t.Fatal("expected a plain member without desktop_policies.read to be denied")
	}
}

func TestDeleteDesktopPolicyBindingRevertsToDefault(t *testing.T) {
	env := newDesktopPolicyTestEnv(t)
	binding, err := env.service.SetDesktopPolicyBinding(context.Background(), env.ownerPrincipal, SetDesktopPolicyBindingParams{
		OrganizationID: env.orgID, PolicyCode: DesktopPolicyAllowCustomProviders, SubjectType: desktopPolicySubjectOrg, Value: false,
	})
	if err != nil {
		t.Fatalf("SetDesktopPolicyBinding: %v", err)
	}
	if result := env.resolve(t, env.memberPrincipal.User.ID); result[DesktopPolicyAllowCustomProviders] {
		t.Fatal("expected the binding to restrict before deletion")
	}

	if err := env.service.DeleteDesktopPolicyBinding(context.Background(), env.ownerPrincipal, binding.ID); err != nil {
		t.Fatalf("DeleteDesktopPolicyBinding: %v", err)
	}

	if result := env.resolve(t, env.memberPrincipal.User.ID); !result[DesktopPolicyAllowCustomProviders] {
		t.Fatal("expected the policy to revert to its catalog default after the binding is deleted")
	}
}

func TestDeleteDesktopPolicyBindingRequiresPermission(t *testing.T) {
	env := newDesktopPolicyTestEnv(t)
	binding, err := env.service.SetDesktopPolicyBinding(context.Background(), env.ownerPrincipal, SetDesktopPolicyBindingParams{
		OrganizationID: env.orgID, PolicyCode: DesktopPolicyAllowCustomProviders, SubjectType: desktopPolicySubjectOrg, Value: false,
	})
	if err != nil {
		t.Fatalf("SetDesktopPolicyBinding: %v", err)
	}
	if err := env.service.DeleteDesktopPolicyBinding(context.Background(), env.memberPrincipal, binding.ID); err == nil {
		t.Fatal("expected a plain member without desktop_policies.manage to be denied deletion")
	}
}
