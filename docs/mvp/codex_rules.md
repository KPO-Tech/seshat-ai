# Codex Working Rules

These rules are meant to be copied or referenced by project agent instructions.

## Current Focus

Chat is ACTIVE.

Settings, Admin, Skills Creator and Knowledge UI are LOCKED until
their turn.

Inbox, Companion and Team are POST_MVP.

Automation and Scheduling do not exist in SeshatOS: they belong to SeshatCloud. Do not add a
local scheduler or an automation screen.

## Hard Rule

Do not modify LOCKED or POST_MVP applications unless the user explicitly asks
for that exact surface.

Allowed exceptions:

- shared component migration needed by the ACTIVE surface
- bug fix that blocks the ACTIVE surface
- security/correctness issue explicitly approved by the user

## Migration Rules

Use React, TypeScript and Tailwind CSS.

Preserve existing Seshat:

- business logic
- API calls
- IPC behavior
- stores
- hooks
- streaming semantics
- permissions
- backend integration
- types

Use AI-Manus only as UI/UX inspiration.

Do not port:

- Vue structure
- AI-Manus backend assumptions
- AI-Manus state model
- AI-Manus routing model

## Commit Rules

Keep commits focused.

Prefer separate commits for:

- Tailwind migration
- feature changes
- backend correctness
- tests
- documentation

Do not mix unrelated dirty worktree changes into migration commits.

## Verification Rules

For UI migration, run:

```bash
npm run typecheck
npm run lint
npm run build
```

If a check cannot be run, document why.

## Naming Rule

Do not call a new thing an Agent unless it has:

- goal
- decision loop
- tool/action selection
- execution context
- termination condition

Otherwise prefer:

- Tool
- Skill
- Workflow
- Service
- Task

