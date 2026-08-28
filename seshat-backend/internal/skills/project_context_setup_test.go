package skills

import (
	"os"
	"path/filepath"
	"testing"

	publicskills "github.com/KPO-Tech/seshat/pkg/skills"
)

func TestEnsureProjectContextSetupSkillCreatesFileOnce(t *testing.T) {
	t.Setenv("SESHAT_RUNTIME_ROOT", t.TempDir())
	const userID = "test-user"

	if err := EnsureProjectContextSetupSkill(userID); err != nil {
		t.Fatalf("first call: %v", err)
	}

	skillPath := filepath.Join(publicskills.UserPath(userID), "project-context-setup", "skill.md")
	got, err := os.ReadFile(skillPath)
	if err != nil {
		t.Fatalf("reading seeded skill: %v", err)
	}
	if string(got) != projectContextSetupSkillMD {
		t.Fatalf("seeded skill content does not match expected constant")
	}
}

func TestEnsureProjectContextSetupSkillNeverOverwrites(t *testing.T) {
	t.Setenv("SESHAT_RUNTIME_ROOT", t.TempDir())
	const userID = "test-user"

	if err := EnsureProjectContextSetupSkill(userID); err != nil {
		t.Fatalf("first call: %v", err)
	}

	skillPath := filepath.Join(publicskills.UserPath(userID), "project-context-setup", "skill.md")
	const userEdit = "---\nname: \"My Edit\"\n---\n\nThe user changed this.\n"
	if err := os.WriteFile(skillPath, []byte(userEdit), 0o644); err != nil {
		t.Fatalf("simulating user edit: %v", err)
	}

	if err := EnsureProjectContextSetupSkill(userID); err != nil {
		t.Fatalf("second call: %v", err)
	}

	got, err := os.ReadFile(skillPath)
	if err != nil {
		t.Fatalf("reading skill after second call: %v", err)
	}
	if string(got) != userEdit {
		t.Fatalf("second call overwrote the user's own edit - got %q", got)
	}
}
