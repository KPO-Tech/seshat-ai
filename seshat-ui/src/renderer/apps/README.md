> **Note (2026-09-16).** This codebase is being superseded by `seshat-desktop` - see `seshat-ui/AGENTS.md`. Kept as reference, not a target for new work.

---

# SeshatOS Renderer Apps

This directory contains product platforms inside SeshatOS.

An app belongs here when it can grow into an independent product surface with
its own navigation, API client, components, hooks, state, and styles.

## Platform Apps

Current platform apps:

- `admin/` - organization and platform administration, including the Workspace Console.
- `automation/` - Agent Workflows: visual, governed agent/dataflow execution.
- `companion/` - custom agent roster and companion surfaces.
- `inbox/` - connected mailbox and message triage.
- `knowledge/` - enterprise Knowledge-to-Action platform.
- `scheduling/` - scheduled execution, recurring tasks, and future calendar/plugins.
- `skills-creator/` - skills catalog, editing, import, and publishing workflows.
- `team/` - teams and future multi-agent collaboration.

Future large products such as `data/` should be added here instead of under
`pages/`.

## Global Pages

`src/renderer/pages/` is reserved for global SeshatOS pages:

- auth pages;
- home/new chat;
- global conversation;
- history;
- user settings;
- app launcher;
- other lightweight cross-platform pages.

The global chat can use platform capabilities, but it does not belong to one
specific platform. A platform can still expose its own specialized chat page.

## Recommended App Layout

New or refactored apps should evolve toward this shape:

```text
apps/<app-name>/
  index.tsx
  routes.tsx
  api/
  pages/
  components/
  hooks/
  stores/
  styles/
```

Keep shared primitives in `components/`, shared API plumbing in `api/`, and
shared cross-cutting helpers in `lib/`. Do not place app-specific business UI
inside global folders unless it is deliberately reusable across platforms.

`admin/` and `team/` deliberately stay flat instead of following this shape.
`admin/` is a configuration console for platform administrators, not a
growing product surface, so splitting it into `api/`/`components/`/`pages/`
adds no value — this is a deliberate exception, not a pending migration.
