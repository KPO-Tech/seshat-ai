package skills

import (
	"os"
	"path/filepath"

	publicskills "github.com/KPO-Tech/seshat/pkg/skills"
)

// projectContextSetupSkillMD is a first-party skill, seeded per user (see
// EnsureProjectContextSetupSkill) rather than shipped in the seshat engine's
// own embedded "builtin" collection - this repo can write into a user's
// skill directory freely, but adding to the engine's builtin set would
// require an SDK release. Written once and never overwritten, so a user's
// own edits (via Skills Creator) always win.
const projectContextSetupSkillMD = `---
name: "Project Context Setup"
description: "Use this early in a new project, whenever the user wants to define, clarify, or write down a project's goals, scope, rules, or constraints - or explicitly asks to set up AGENTS.md or SESHAT.md. Always invoke when a conversation starts with something like 'let's define this project's context and rules' or 'help me set up the project context'. Structures the discussion before anything gets written, then writes the result to AGENTS.md in the project root."
argument-hint: ""
user-invocable: true
---

# Project Context Setup

You are helping the user think through and write down the context and rules
for a project, before real work on it begins. The output is a single file,
AGENTS.md, in the project's root directory - SeshatOS reads this file back
into every future conversation scoped to this project, so what gets written
here becomes the project's persistent memory.

## Why this matters

Without this file, every new conversation about the project starts from
zero - the agent re-derives goals and constraints from scratch, or guesses.
A good AGENTS.md means every future session already knows the problem being
solved, who it's for, and what's off the table.

## How to run this conversation

Ask one question at a time (use ask_user_question), not a single big form.
Let the user's answers naturally shape the follow-ups - don't march through
a rigid checklist if the conversation reveals something more important to
dig into first. Cover, in roughly this order:

1. **The core problem / goal** - what is this project actually solving, and
   for whom? Push past a one-line answer if it's vague - ask what happens
   today without this, or what "done" looks like.
2. **Who it's for** - end users, internal team, just the person you're
   talking to? This shapes tone, scope, and what's worth building at all.
3. **Hard constraints and non-negotiables** - tech choices already decided
   (language, framework, hosting), things explicitly to avoid, deadlines,
   budget/resource limits, anything a future session must never violate
   without asking first.
4. **Rough plan or milestones**, if the user already has one - don't force
   this if they don't; a good problem statement is more valuable than a
   fabricated roadmap.

## Writing the file

Once you have enough to write something genuinely useful (not necessarily
exhaustive - this can be revisited later), synthesize the conversation into
AGENTS.md using write_file. Structure it clearly (headings for Goal,
Audience, Constraints, Plan - only include sections that have real content).
Show the user what you're about to write, or what you wrote, and confirm
it's a fair summary - this file is quoted back at every future session, so
it's worth getting right rather than fast.

Do not pad the file with generic boilerplate to look thorough. A short,
accurate AGENTS.md beats a long generic one.

## Keep AGENTS.md short - substantial content goes in its own file

AGENTS.md is re-read and re-injected into every single conversation turn on
this project, forever. That makes it the wrong place for anything long:

- A business plan, a full research writeup, detailed architecture notes, a
  PPT outline - these belong in their own file (e.g. business-plan.md,
  research/market-notes.md), written with write_file directly into the
  project folder like any other project document.
- AGENTS.md should then just reference it in one line (e.g. "See
  business-plan.md for the full plan.") rather than inlining the content.
- This is not a separate mechanism to build or explain to the user - it is
  the same write_file tool, used the same way, just producing a different
  file. If a conversation in this project (this one or a later one) produces
  something substantial enough to be worth keeping, save it as its own file
  and, if it's foundational, add a one-line pointer to it from AGENTS.md.

Rule of thumb: if it would still make sense to read on every single future
turn regardless of topic, it belongs in AGENTS.md. If it is reference
material someone would look up when relevant, it belongs in its own file.
`

// EnsureProjectContextSetupSkill seeds the "Project Context Setup" skill
// into userID's own skill directory if it doesn't already exist. Idempotent
// and non-destructive - mirrors managedskills.EnsureExtracted's "check
// first, never clobber" pattern for the engine's builtin collection (see
// config.Bootstrap), just targeting the user tier instead since this repo
// has no way to add to the engine's embedded builtin set without an SDK
// release.
func EnsureProjectContextSetupSkill(userID string) error {
	skillPath := filepath.Join(publicskills.UserPath(userID), "project-context-setup", "skill.md")
	if _, err := os.Stat(skillPath); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(skillPath), 0o755); err != nil {
		return err
	}
	return os.WriteFile(skillPath, []byte(projectContextSetupSkillMD), 0o644)
}
