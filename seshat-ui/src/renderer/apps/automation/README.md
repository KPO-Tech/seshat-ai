# Automation App / Agent Workflows

Automation is the Agent Workflows product surface: a visual platform for
building governed agent/dataflow workflows. It absorbs the old standalone
`workflows/` prototype so Seshat does not maintain two competing workflow
builders.

Boundaries:

- Automation owns agent workflows, graph-based jobs, canvas editing, node
  testing, variables, run replay, templates, and graph-specific settings.
- Scheduling owns prompt-based scheduled jobs and calendar/cadence workflows.
- Both can consume the same backend job API, but UI modules must stay separate.
- Shared wire-format dataflow types live in `src/renderer/types/dataflow.ts`,
  not inside Automation, so Scheduling and future apps do not import
  Automation internals.

Current structure:

- `App.tsx` mounts the internal app router.
- `routes.tsx` owns `/automation`, `/automation/new`, and `/automation/:jobId`.
- `pages/AutomationPage.tsx` orchestrates job loading, save/delete/run actions,
  editor state, providers, devices, and settings.
- `components/` contains Automation-specific panels.
- `graph/` contains the graph editor, node forms, run replay, and graph helpers.
- `api/` contains Automation-specific DTOs.
- `styles/automation.css` owns the app-level Automation stylesheet.

Legacy:

- `/workflows/*` redirects to `/automation`.
- The removed `apps/workflows` UI was a static YAML DAG prototype. Its product
  intent now belongs here.
