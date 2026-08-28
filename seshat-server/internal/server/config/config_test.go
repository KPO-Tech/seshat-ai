package config

import "testing"

func TestOrgModeFromEnvDefaultsToMulti(t *testing.T) {
	if got := orgModeFromEnv(); got != OrgModeMulti {
		t.Fatalf("expected an unset SESHAT_SERVER_ORG_MODE to default to %q, got %q", OrgModeMulti, got)
	}
}

func TestOrgModeFromEnvReadsSingle(t *testing.T) {
	t.Setenv("SESHAT_SERVER_ORG_MODE", "single")
	if got := orgModeFromEnv(); got != OrgModeSingle {
		t.Fatalf("expected %q, got %q", OrgModeSingle, got)
	}
}

func TestOrgModeFromEnvTrimsAndLowercases(t *testing.T) {
	t.Setenv("SESHAT_SERVER_ORG_MODE", "  Single  ")
	if got := orgModeFromEnv(); got != OrgModeSingle {
		t.Fatalf("expected whitespace/case to be normalized to %q, got %q", OrgModeSingle, got)
	}
}
