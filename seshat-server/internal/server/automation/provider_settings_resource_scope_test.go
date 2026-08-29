package automation

import (
	"context"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// TestListUsableProviderSettingsFixesTheMemberVisibilityGap is the
// regression test for the bug this feature was built alongside: a plain
// "member" (no provider_settings.read/manage) got an empty list from
// ListProviderSettings, which is exactly what a chat provider picker used to
// call — so standard members could never see any configured provider.
// ListUsableProviderSettings uses the same loose "any org member" trust
// level as ResolveProviderSetting instead.
func TestListUsableProviderSettingsFixesTheMemberVisibilityGap(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	memberPrincipal := env.addMember(t, "member")

	if _, err := env.automation.CreateProviderSetting(context.Background(), env.adminPrincipal, CreateProviderSettingParams{
		OrganizationID: env.orgID, Provider: "anthropic", DefaultModel: "claude-sonnet-5", APIKey: "sk-ant-x",
	}); err != nil {
		t.Fatalf("create provider setting: %v", err)
	}

	// The admin-only list still returns nothing for a plain member...
	adminList, err := env.automation.ListProviderSettings(context.Background(), memberPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list as member: %v", err)
	}
	if len(adminList) != 0 {
		t.Fatalf("expected the admin-gated list to stay empty for a plain member, got %d", len(adminList))
	}

	// ...but the usable list, which is what the chat picker should call,
	// does not.
	usable, err := env.automation.ListUsableProviderSettings(context.Background(), memberPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list usable as member: %v", err)
	}
	if len(usable) != 1 || usable[0].Provider != "anthropic" {
		t.Fatalf("expected the member to see the one configured provider setting, got %+v", usable)
	}
}

// TestProviderSettingResourceScopedBindingRestrictsToGrantedSubjects proves
// the opt-in allowlist: a provider setting is usable by every org member
// until an admin scopes a policy binding to it, after which only matching
// subjects may see or resolve it.
func TestProviderSettingResourceScopedBindingRestrictsToGrantedSubjects(t *testing.T) {
	t.Setenv(testEncryptionEnvVar, testEncryptionKey)
	env := newTestEnv(t)
	grantedMember := env.addMember(t, "member")
	otherMember := env.addSecondMember(t, "other-member")

	setting, err := env.automation.CreateProviderSetting(context.Background(), env.adminPrincipal, CreateProviderSettingParams{
		OrganizationID: env.orgID, Provider: "openai", DefaultModel: "gpt-5", APIKey: "sk-openai-x",
	})
	if err != nil {
		t.Fatalf("create provider setting: %v", err)
	}

	// Before any binding, both members can see and resolve it.
	for name, principal := range map[string]*iam.Principal{"granted": grantedMember, "other": otherMember} {
		if usable, err := env.automation.ListUsableProviderSettings(context.Background(), principal, env.orgID); err != nil || len(usable) != 1 {
			t.Fatalf("%s: expected the unrestricted setting to be usable before any binding, got %+v err=%v", name, usable, err)
		}
		if _, err := env.automation.ResolveProviderSetting(context.Background(), principal, env.orgID, "openai"); err != nil {
			t.Fatalf("%s: expected resolve to succeed before any binding: %v", name, err)
		}
	}

	if _, err := env.iam.CreatePolicyBinding(context.Background(), env.adminPrincipal, iam.CreatePolicyBindingParams{
		OrganizationID:  env.orgID,
		Name:            "OpenAI provider access",
		SubjectType:     "user",
		SubjectID:       grantedMember.User.ID,
		PermissionCodes: []string{"provider_settings.read"},
		ResourceType:    "provider_setting",
		ResourceID:      setting.ID,
	}); err != nil {
		t.Fatalf("create provider-setting-scoped policy binding: %v", err)
	}

	// The granted member still sees/resolves it...
	if usable, err := env.automation.ListUsableProviderSettings(context.Background(), grantedMember, env.orgID); err != nil || len(usable) != 1 {
		t.Fatalf("expected the granted member to still see the setting, got %+v err=%v", usable, err)
	}
	if _, err := env.automation.ResolveProviderSetting(context.Background(), grantedMember, env.orgID, "openai"); err != nil {
		t.Fatalf("expected the granted member to still resolve the setting: %v", err)
	}

	// ...but the other member, who was never granted, no longer can.
	if usable, err := env.automation.ListUsableProviderSettings(context.Background(), otherMember, env.orgID); err != nil || len(usable) != 0 {
		t.Fatalf("expected the setting to disappear for the ungranted member, got %+v err=%v", usable, err)
	}
	if _, err := env.automation.ResolveProviderSetting(context.Background(), otherMember, env.orgID, "openai"); err == nil {
		t.Fatal("expected the ungranted member to be denied resolving the restricted setting")
	}

	// An org-wide grant of provider_settings.read (e.g. via the admin role,
	// or a role-scoped binding) still covers every resource, restricted or
	// not — a resource-scoped restriction narrows the default-open case, it
	// never overrides an org-wide grant.
	if usable, err := env.automation.ListUsableProviderSettings(context.Background(), env.adminPrincipal, env.orgID); err != nil || len(usable) != 1 {
		t.Fatalf("expected the admin to still see the restricted setting, got %+v err=%v", usable, err)
	}
}
