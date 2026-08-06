# SeshatOS navigation redesign plan

Last updated: 2026-08-02.

This note captures the intended UI restructuring before moving routes,
components, or backend concepts. The goal is to avoid duplicated surfaces and
make every major item in the app answer one clear question: am I chatting,
launching a specialized app, managing reusable intelligence, configuring the
system, or working inside a concrete project?

---

## Product principles

1. Home stays immediate.

   Home is the everyday starting point for conversation and quick access. It
   should not become a dashboard full of admin/configuration decisions.

2. Settings configures the app, account, runtime, and organization.

   Settings is for preferences, credentials, permissions, connections, system
   health, and admin controls. If the user is changing how SeshatOS behaves,
   authenticates, connects, stores, or runs, it belongs in Settings.

3. Workspace manages reusable work resources.

   Workspace is the console for building and sharing internal intelligence:
   agents, skills, knowledge bases, document ingestion, tool registries, and
   eventually templates. If the user is creating something reusable by agents
   or by the organization, it belongs in Workspace.

4. Apps launches specialized surfaces.

   Apps is the launcher for focused work modes built on top of the same core
   agent/runtime: workflows, teams, code, research, notebook/RAG, image
   generation, document studio, web app builder, and similar surfaces.

5. Projects represents concrete work context.

   Projects should be a first-class concept later, separate from Workspace. A
   project is a named work context with a local root folder, sessions, files,
   apps, tasks, runs, and project-specific settings.

---

## Target top-level navigation

Recommended sidebar order:

```text
New Chat
Search
Scheduling
Apps
Workspace
Projects

Recents

Settings
Theme toggle
```

Short-term migration can keep unfinished items hidden, redirected, or labeled
as under development, but the long-term information architecture should point
in this direction.

---

## Home

Home should contain:

- General chat input and quick actions.
- Provider/model selection for the next chat.
- File/folder upload/open shortcuts.
- Quick prompts such as create a task, summarize a file, search the web, and
  brainstorm ideas.
- Recent chat access remains in the sidebar, not as a large Home dashboard.

Home should not contain:

- Agent/skill authoring.
- Knowledge base management.
- Workflow graph editing.
- Team orchestration management.
- Organization admin.
- Provider credential setup beyond clear prompts linking to Settings.

Open questions:

- Whether Home should show a compact current project selector once Projects
  exists.
- Whether quick actions should be configurable by user/org.

---

## Sidebar footer

Current decision:

- The Settings button opens the unified Settings surface.
- The old user/profile icon is now a direct dark/light theme toggle.
- `/user-settings` redirects to `/settings` for compatibility.

Future follow-up:

- Confirm everything from the legacy user settings page is represented in
  Settings > General, Settings > Memories, or another Settings tab.
- Once confirmed, delete the unused legacy user-settings page.

---

## Settings scope

Settings should contain:

- General personal preferences:
  - identity/preferred name;
  - profession/role;
  - about you;
  - working style;
  - response style;
  - automation/interactive permission defaults.
- Memories:
  - personal memories;
  - memory privacy/reset controls.
- Providers:
  - API keys;
  - OAuth;
  - base URLs;
  - available models;
  - default provider/model.
- Runtime and capabilities:
  - permission policy;
  - tool availability defaults;
  - local runtime constraints.
- Knowledge technical settings:
  - Docling/doc conversion service config;
  - embedder config;
  - ingestion backend config;
  - low-level storage behavior.
- Web Search:
  - providers;
  - quotas;
  - allowed/blocked domains;
  - environment fallback policy.
- Cloud Automation:
  - server connection;
  - device pairing;
  - connection status.
- System:
  - host capabilities;
  - diagnostics/doctor later;
  - versions and health checks.
- Admin:
  - users;
  - groups;
  - organizations;
  - organization workspaces;
  - audit logs;
  - quotas;
  - billing later.
- About.

Settings should not contain:

- Creating business agents.
- Editing reusable skills.
- Managing knowledge base contents.
- Importing business documents into knowledge bases.
- Workflow graph design.
- Team design.
- Project/session workspace roots, except global defaults.

Rule of thumb:

If it changes how the app/system/account/org works, put it in Settings. If it
creates something the agents/users will use as a work resource, put it in
Workspace or Apps.

---

## Workspace scope

Workspace should become the internal intelligence console.

Workspace tabs/sections:

- Agents:
  - built-in agents;
  - private user agents;
  - organization-public internal agents;
  - enable/disable;
  - permissions/tools/model defaults;
  - source/visibility labels.
- Skills:
  - create/edit/import skills;
  - private skills;
  - organization-public skills;
  - validation and packaging.
- Knowledge:
  - knowledge bases;
  - private/public visibility;
  - attached files;
  - ingestion status;
  - chunk counts;
  - reindex actions;
  - sharing/permissions.
- Documents/Ingestion:
  - internal documents;
  - imported files;
  - preprocessing jobs;
  - failures and retry;
  - maybe eventually document-to-knowledge workflows.
- Tools/MCP:
  - internal tool registry;
  - MCP server registry;
  - tool visibility by agent/team/org;
  - not raw credential setup, which stays in Settings.
- Templates:
  - workflow templates;
  - app templates;
  - project templates;
  - agent templates.

Current state:

- Workspace already has Agents and Knowledge.
- Skills Creator is still a separate top-level route.
- Workflow builder is still a separate top-level route.
- Teams is still a separate top-level route.

Migration intent:

- Move Skills Creator into Workspace as `Workspace > Skills`.
- Keep low-level provider/credential settings in Settings.
- Keep workflow graph design out of Workspace if it becomes an app surface;
  keep only reusable workflow templates/catalog in Workspace.

---

## Apps scope

Apps should be a launcher and workspace for specialized surfaces. Apps are not
system settings and not necessarily reusable resource catalogs. They are work
surfaces.

Initial app candidates:

- Workflows:
  - graph/DAG design;
  - workflow runs;
  - verifier/critic/router nodes;
  - agent-created workflow drafts.
- Teams:
  - multi-agent orchestration;
  - role assignment;
  - team run visualization.
- Code:
  - file tree;
  - diff view;
  - terminal;
  - project-aware coding sessions.
- Research:
  - deep research / investigation mode;
  - parallel agents;
  - source collection;
  - evidence board;
  - final report synthesis.
- Notebook / Knowledge Work:
  - RAG exploration;
  - document Q&A;
  - notebook-like analysis;
  - curated outputs.
- Image Generation:
  - image prompt/edit UI;
  - asset library;
  - history.
- Web App Builder:
  - prompt-to-app;
  - live preview;
  - iteration and deploy later.
- Document Studio:
  - document viewing/editing;
  - conversions if needed;
  - export/download flows.

Migration intent:

- Move `Workflows` from the main sidebar into Apps.
- Move `Teams` from the main sidebar into Apps.
- Apps may eventually support opening multiple app instances, optionally
  attached to a Project.

Open questions:

- Apps as a simple launcher page first, or a dock/tab system?
- Should app instances open inside the main content area, right panels, or
  separate Electron windows?
- What does app state persistence look like?

---

## Projects scope

Projects should become a first-class top-level item later.

A project should include:

- Name and description.
- Local root folder/workspace path.
- Linked conversations.
- Linked files/artifacts.
- Project-specific knowledge bases.
- Project-specific apps/runs.
- Default agent/team/workflow.
- Task/runs history.
- Permission and sandbox policy overrides.

Why Projects should not be hidden under Workspace:

- Workspace is about reusable intelligence resources.
- Projects are active work contexts.
- A user may open several apps inside one project, and several sessions may
  share the same project root.

Migration intent:

- Add Projects after Home/Apps/Workspace are clarified.
- Keep current per-session project path behavior, but later lift it to a
  first-class project entity.

---

## Search scope

Search should initially keep current conversation search behavior.

Later it should become global search:

- conversations;
- projects;
- files;
- knowledge bases;
- agents;
- workflows;
- apps/templates.

Open questions:

- Should global search include organization resources by default?
- How should permissions and visibility be displayed in results?

---

## Scheduling scope

Scheduling remains top-level because it is an everyday operational control,
not merely an app builder.

Scheduling should contain:

- Scheduled jobs list.
- Job creation/editing.
- Cloud/device target selection.
- Agent selection.
- Provider/model selection.
- Runs/history.
- Pause/resume/run now.

Future relationship to Apps:

- Workflow app can create reusable workflow definitions.
- Scheduling can schedule a prompt, an agent, or later a workflow.
- Scheduling should not become the workflow graph editor.

---

## Migration checklist

Phase 1: clarify navigation without large backend changes.

- Keep Settings as unified profile/preferences/runtime/admin place.
- Replace sidebar profile button with theme toggle. Done.
- Redirect `/user-settings` to `/settings`. Done.
- Add Apps route/page shell.
- Add Projects route/page placeholder or keep hidden until ready.
- Move Teams entry from sidebar to Apps.
- Move Workflows entry from sidebar to Apps.
- Move Skills Creator entry from sidebar to Workspace > Skills.
- Keep Scheduling top-level.
- Keep Workspace top-level.

Phase 2: make Workspace a real resource console.

- Add Workspace tabs for Skills, Documents/Ingestion, Tools/MCP, Templates.
- Move existing Skills Creator UI into Workspace > Skills.
- Decide whether Knowledge technical config stays only in Settings while
  knowledge base contents stay in Workspace.
- Add visibility model UI: private vs organization-public.
- Add resource ownership/source labels consistently.

Phase 3: build Apps.

- Create Apps launcher.
- Register existing Workflows and Teams pages as apps.
- Define app metadata: id, label, icon, description, status, route.
- Decide app launch behavior: route, tab, panel, or window.
- Add app-to-project attachment concept later.

Phase 4: introduce Projects.

- Define project backend model or local-first project store.
- Move per-session project path into project settings.
- Add project selector in chat/Home.
- Attach sessions, files, apps, knowledge, and runs to projects.

Phase 5: cleanup.

- Delete unused legacy user-settings page once settings parity is confirmed.
- Remove obsolete top-level routes after redirects have existed long enough.
- Update docs/screenshots.
- Add navigation tests for redirects and main sidebar.

---

## Risks to avoid

- Do not move everything into Workspace. Workspace should not become Settings
  with another name.
- Do not make Home decide between Chat/Code/Research up front. Keep one
  general agent surface and let Apps specialize later.
- Do not duplicate Knowledge in both Settings and Workspace. Split technical
  config from knowledge-base content.
- Do not make Scheduling the workflow builder. Scheduling should schedule
  things; Workflows should design things.
- Do not bury Projects inside Workspace. Projects are active contexts, not
  reusable intelligence resources.

