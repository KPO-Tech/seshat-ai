> **Note (2026-09-16).** This codebase is being superseded by `seshat-desktop` (started 2026-09-15, see its own `AGENTS.md`: "Do not copy broad chunks from seshat-ui... treat it as reference material only"). Accurate as of 2026-09-10, kept as the detailed architecture/design-decision record while the rebuild is in progress - not a target for new work.

---

# Agent Instructions — seshat-ui (SeshatOS Desktop Client)

This file provides guidance for AI agents working on `seshat-ui`, the Electron + React desktop client for SeshatOS. Read it before making any changes.

---

## Project overview

`seshat-ui` is a **frameless Electron desktop application** that wraps the SeshatOS HTTP API. It is a pure frontend — no AI logic, no database, no backend code. Its only job is to present a fast, polished interface on top of the REST + SSE API.

**Dependency direction:**

```
seshat-ui → nexus-product HTTP API   (always, via IPC bridge or fetch)
seshat-ui → nexus-engine             (never — engine is Go, UI is TypeScript)
nexus-product → seshat-ui            (never)
```

seshat-ui communicates with nexus-product **exclusively** through the HTTP API at `http://127.0.0.1:8090/api/v1`. It never imports Go code, never reads the DB, never calls nexus-engine directly.

---

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 43+ (frameless, `frame: false`, custom title bar) |
| Build | electron-vite + Vite 6 |
| UI framework | React 19 |
| Styling | UnoCSS (utility classes) + scoped CSS-in-JS strings per component |
| Component library | Arco Design (`@arco-design/web-react`) |
| Icons | `@icon-park/react` |
| State | Zustand 5 (persisted via `localStorage` for UI prefs) |
| Data fetching | SWR + custom `api` client |
| Router | React Router 8 (hash router — required for Electron file:// loads) |
| Markdown rendering | `react-markdown` + `remark-gfm` + `rehype-katex` + `remark-math` |
| Diagram rendering | `mermaid` |
| Lists (virtual) | `@tanstack/react-virtual` |
| Type safety | TypeScript 5.8, strict mode, `zod` for runtime validation |
| Linting | `oxlint` |
| Type check | `tsc --noEmit` |

---

## Project structure

```
seshat-ui/
├── src/
│   ├── main/                  ← Electron main process (Node.js context)
│   │   ├── index.ts           ← app bootstrap, window creation
│   │   ├── runtime.ts         ← paths, backend origin, bridge secret
│   │   └── ipc/
│   │       ├── backend.ts     ← IPC handlers: auth, http:request, http:stream:*
│   │       ├── secure-store.ts ← OS keychain (safeStorage)
│   │       └── system.ts      ← window controls (minimize/maximize/close)
│   │
│   ├── preload/
│   │   └── index.ts           ← contextBridge — exposes window.nexus to renderer
│   │
│   └── renderer/              ← React application (browser context)
│       ├── api/
│       │   ├── client.ts      ← typed api.get/post/put/patch/delete/upload
│       │   └── types.ts       ← all API response types (TypeScript interfaces)
│       ├── components/
│       │   ├── auth/          ← AuthGuard, AuthLayout, FormPrimitives
│       │   ├── chat/          ← ChatInput, ChatTopBar, MessageItem, ToolBlock, ...
│       │   │   ├── plan/      ← PlanArtifactCard, PlanEditorPanel
│       │   │   ├── subagent/  ← SubagentPanel
│       │   │   └── tool-block/ ← per-tool renderers (Bash, Task, WebSearch, AskUser, ...)
│       │   ├── layout/        ← Shell, Sidebar, RightPanelHost, SearchModal, ErrorBoundary
│       │   ├── ui/            ← IconButton, ProviderIcon, SelectorPill, StatusBadge
│       │   ├── MarkdownView.tsx
│       │   └── NexusLogo.tsx
│       ├── hooks/
│       │   ├── useChat.ts     ← SSE streaming logic (the main orchestrator)
│       │   ├── useAuth.ts
│       │   ├── useProviders.ts
│       │   ├── chatControllers.ts
│       │   └── useInactivityTimeout.ts  ← idle auto-logout, mounted in AuthGuard (added 2026-08-06)
│       ├── lib/
│       │   ├── chat.ts        ← message normalization, status helpers
│       │   ├── plan.ts        ← plan parsing helpers
│       │   └── sessionTitle.ts ← auto-title generation from prompt
│       ├── apps/              ← product platforms inside SeshatOS (see apps/README.md)
│       │   ├── admin/         ← org/platform administration + Workspace Console
│       │   ├── automation/    ← Agent Workflows: visual, governed agent/dataflow execution
│       │   ├── companion/     ← custom agent roster and companion surfaces
│       │   ├── inbox/         ← connected mailbox and message triage
│       │   ├── knowledge/     ← Knowledge-to-Action platform
│       │   ├── scheduling/    ← scheduled execution, recurring tasks, future calendar/plugins
│       │   ├── skills-creator/← skills catalog, editing, import, publishing
│       │   └── team/          ← teams and future multi-agent collaboration
│       ├── pages/             ← global SeshatOS pages only
│       │   ├── Home.tsx       ← new-chat landing
│       │   ├── Conversation.tsx ← global active session view
│       │   ├── Login.tsx / Register.tsx
│       │   ├── app-launcher/index.tsx
│       │   └── settings/      ← user/global settings views
│       ├── router/index.tsx   ← createHashRouter — all routes
│       ├── stores/
│       │   ├── auth.ts        ← auth state (token, user, roles)
│       │   ├── session.ts     ← sessions, messages, streaming, agent state, sub-agents
│       │   ├── ui.ts          ← theme, sidebar, right panel, permission mode
│       │   ├── providers.ts   ← provider configs cache
│       │   └── secure-storage.ts ← thin wrapper over window.nexus.secureStore
│       ├── styles/
│       │   ├── tokens.css     ← design tokens (CSS custom properties)
│       │   ├── globals.css    ← base reset, scrollbar, animations
│       │   └── shared.css     ← auth-page layout utilities
│       └── types/
│           ├── electron.d.ts  ← window.nexus type declarations
│           ├── assets.d.ts    ← SVG/PNG module declarations
│           └── dataflow.ts    ← shared wire-format dataflow types (nodes, runs, node
│                                 traces) consumed by Automation and Scheduling alike —
│                                 lives here, not inside `apps/automation/`, so neither
│                                 app imports the other's internals
├── public/                    ← static assets (logos, icons)
├── electron.vite.config.ts
├── uno.config.ts
├── tsconfig.json
└── package.json
```

`admin/` and `team/` deliberately stay flat (no `api/`/`components/`/`pages/` split) —
admin is a config console for platform administrators, not a growing product
surface, so it doesn't need the full app shape; not an oversight.

The old `apps/workflows/` YAML-DAG prototype was absorbed into `automation/` —
`/workflows/*` just redirects to `/automation` now. `apps/workspace/` never
existed as a top-level app either — Workspace lives nested under
`admin/workspace/`.

---

## Architecture and data flow

### Process model

```
┌─────────────────────────────────────────────────────────┐
│  Electron Main (Node.js)                                │
│  main/index.ts → registers IPC handlers → creates window│
│  main/ipc/backend.ts  — proxies HTTP to nexus-product   │
│  main/ipc/system.ts   — window controls                 │
│  main/ipc/secure-store.ts — OS keychain                 │
└────────────────────────────┬────────────────────────────┘
                             │ contextBridge (preload/index.ts)
                             │ exposes window.nexus
┌────────────────────────────▼────────────────────────────┐
│  Renderer (React, sandboxed)                            │
│  api/client.ts → calls window.nexus.http.request()      │
│  stores/ → Zustand state                                │
│  hooks/useChat.ts → SSE streaming orchestrator          │
│  pages/ → route-level views                             │
│  components/ → UI building blocks                       │
└─────────────────────────────────────────────────────────┘
```

### Security model

- Renderer is fully sandboxed (`sandbox: true`, `nodeIntegration: false`, `contextIsolation: true`).
- All Node.js access goes through the contextBridge (`window.nexus`).
- IPC handlers verify sender origin (`assertTrustedSender`) — only `file://` or the dev renderer URL is accepted.
- The desktop bridge uses a per-install HMAC-SHA256 secret stored at `~/.config/nexus/data/desktop-bridge-secret` (mode `0o600`) to authenticate against the local nexus-product backend at startup.
- Auth tokens are stored in the OS keychain via `safeStorage` (encrypted with the OS secret), not in `localStorage`.
- External links are opened in the OS browser, never in the Electron window (`shell.openExternal`).

### SSE streaming

The main orchestrator is `hooks/useChat.ts` → `sendMessage`. It:

1. Adds a user message + empty assistant placeholder to the session store.
2. Starts the SSE stream via `window.nexus.http.startStream` (Electron) or `fetch` (browser fallback).
3. Routes incoming SSE events:
   - `runtime` events → `handleRuntimeEvent` (tool status, permission requests, plan events, sub-agent events)
   - `done` event → `commitDonePayload` (replaces streaming blocks with final messages)
   - all others → `handleStreamChunk` (text/thinking/tool_use blocks)
4. Batches React re-renders via `requestAnimationFrame` (`scheduleSync`/`flushSync`).
5. Implements exponential-backoff retry (3 retries, 1s/2s/4s) on `TypeError` (network drops).

---

## Design system — Artistic direction

### Philosophy

The Nexus UI aims for a **premium, focused, dark-native** aesthetic. The reference point is modern AI desktop tools (Claude desktop, Linear, Notion AI) but darker, warmer, and more immersive.

Keywords: **warm darkness, muted depth, orange fire, breathing space**.

### Color palette

Defined in `src/renderer/styles/tokens.css`. Never hardcode colors — always use CSS custom properties.

| Token | Dark value | Light value | Use |
|---|---|---|---|
| `--color-bg` | `#2F2E34` | `#F6F4F1` | App background, sidebar |
| `--color-surface` | `#3A3941` | `#FFFFFF` | Cards, inputs, panels |
| `--color-surface-elevated` | `#4A4852` | `#F3EEE8` | Dropdowns, tooltips |
| `--color-border` | `#54515B` | `#DDD5CC` | Dividers |
| `--color-border-subtle` | `#4D4A54` | `#E6DED5` | Subtle separators |
| `--color-text` | `#E7E2DA` | `#1E1C1A` | Primary text |
| `--color-text-secondary` | `#B6AEA3` | `#746F69` | Labels, secondary content |
| `--color-text-muted` | `#918A82` | `#938C84` | Placeholders, hints |
| `--color-primary` | `#EF7C2F` | `#EF7C2F` | **Brand orange — CTAs, active states, focus rings** |
| `--color-accent` | `#C89A6A` | `#C89A6A` | Warm gold — decorative accents |

The backgrounds are **warm tinted** (slight purple-brown cast), not neutral gray. This is intentional — it creates depth without being harsh.

### Typography

- **Sans-serif**: `Plus Jakarta Sans` → `Inter` → system-ui. Round, friendly, legible at small sizes.
- **Base size**: 14px (renderer globals), 13px (UI chrome), 15px (chat textarea).
- **Weights used**: 400 (body), 600 (labels), 700 (headers, shortcuts), 800 (brand name).
- **Letter-spacing**: `-0.02em` on large headings (brand name `Nexus`), `+0.05em` on uppercase labels.

### Spacing and shape

- **Border radius scale**: 6px (small chips) → 8px (small buttons) → 10px (sidebar items) → 12px (menus, tags) → 14px (dropdowns) → 20px (chat input wrapper).
- **Sidebar**: 224px expanded, 56px collapsed (`--sidebar-width` / `--sidebar-collapsed-width` in `tokens.css`). Animated at `0.2s cubic-bezier(0.4, 0, 0.2, 1)`.
- **Title bar**: 42px high. Custom (`frame: false`). Drag region on the center/left, no-drag on controls.
- **Right panel**: 420px default, resizable between 320px and 720px.
- **Input gradient border**: The chat input uses a `background-image` trick to render a gradient border — `linear-gradient(135deg, --color-primary, --color-accent, --color-surface-elevated)`. Do not break this pattern.

### Motion

- **`fade-in`**: 0.15s ease-out, translateY(4px→0) — used on panels, dropdowns.
- **`slide-up`**: 0.15s, 12px→0 — used on bottom-anchored sheets.
- **`pulse-opacity`**: 0.8s ease-in-out infinite — the streaming cursor `▋`.
- **`glow-breathe`**: 0.5s ease-in-out — subtle orange glow behind the agent.
- Sidebar/panel transitions: `0.2s cubic-bezier(0.4, 0, 0.2, 1)` — slightly ease-in at start, smooth out.

### Scrollbars

Invisible at rest, `rgba(128,128,128,0.3)` on hover, 5px wide. The `scrollbar-hide` class removes them entirely for panels where scrolling is implicit.

### Dark/light theme

Both themes are fully supported. Default is `dark`. The theme attribute on `<html>` is `data-theme="dark"|"light"` and `data-color-scheme="default"`. Arco Design is wired to follow this via their theming API. Always test both themes when touching layout or color.

---

## CSS patterns

### CSS-in-JS strings (component-local styles)

The preferred pattern for component styles is a `const CSS_STRING = \`...\`` injected via `<style>{CSS_STRING}</style>` at the top of the component tree. This keeps styles co-located with the component without needing CSS modules.

```tsx
// ✅ Do this
function MyComponent() {
  return (
    <>
      <style>{MY_CSS}</style>
      <div className="my-root">...</div>
    </>
  )
}
const MY_CSS = `
.my-root { background: var(--color-bg); }
`
```

Never use inline `style={}` for anything other than dynamic values (dimensions, calculated positions). Never reach for a CSS file if a scoped string works.

### UnoCSS utility classes

For layout utilities (`flex`, `items-center`, `gap-2`, etc.) use UnoCSS. The reset is `@unocss/reset`. The config is in `uno.config.ts`. Prefer these over a bespoke CSS-in-JS rule for plain layout (spacing, flex/grid alignment, sizing) - a hand-written block for something `flex items-center gap-2` already says is exactly the kind of code this exists to avoid.

### Arco Design components — use first, by default

**Arco Design is the default for anything resembling a standard UI primitive**: cards, buttons, badges/tags, statistics, grids/layout, tables, tabs, selects, dropdowns, modals/drawers, forms and their inputs. Check Arco before writing a hand-rolled equivalent — not just for the "complex" cases. Theme it through CSS variable overrides, not Arco's JS config API. Never import Arco styles globally — they are already included.

This reverses an earlier, narrower framing ("only for complex interactive primitives"). In practice, dashboard-style pages (KPI/stat cards, project/template catalogs, filter pills, preview modals) were repeatedly hand-rolled from scratch instead, at real cost: more CSS per page than a comparable Arco-based build would need, and gaps a maintained component already closes (e.g. a hand-rolled preview drawer with no Escape-to-close or focus trap, both free with Arco's `Modal`/`Drawer`).

Hand-rolled CSS-in-JS is still the right call for styling that's genuinely bespoke to Seshat's own visual identity and has no real Arco equivalent — a category-toned icon tile, an accent-colored left border keyed to a tag, the specific card layout of a dashboard KPI strip. Wrap Arco's own components/props for that instead of reimplementing the primitive itself (e.g. put a custom-toned icon *inside* an Arco `Card`, don't rebuild `Card`).

---

## State management

### Zustand stores

| Store | File | Persistence | Description |
|---|---|---|---|
| `useUIStore` | `stores/ui.ts` | `localStorage` (partial) | Theme, sidebar collapse, right panel, permission mode, tool expansion |
| `useSessionStore` | `stores/session.ts` | None (ephemeral) | Sessions, messages, streaming blocks, agent state, sub-agent state, plans |
| `useAuthStore` | `stores/auth.ts` | None (OS keychain via IPC) | Auth token, user object, roles |
| `useProviderStore` | `stores/providers.ts` | None | Provider configs cache |

### Rules

- Stores hold the source of truth. Components read from stores, call actions on stores.
- `useSessionStore` is the most complex store. When modifying it: understand `StreamingBlock`, `AgentState`, `SubagentState` before touching anything in `useChat.ts`.
- `useUIStore` persists only the listed keys (`partialize`) — do not add large objects to the persisted slice.
- Never call `useSessionStore.getState()` inside a React render — only inside event handlers and effects.

---

## IPC bridge (`window.nexus`)

Defined in `src/preload/index.ts`, typed in `src/renderer/types/electron.d.ts`.

```ts
window.nexus = {
  window:      { minimize, maximize, close },
  dialog:      { openDirectory },
  secureStore: { get, set, delete },
  http: {
    request(payload):  Promise<BridgeResponse>
    upload(payload):   Promise<BridgeResponse>
    startStream(payload): Promise<{ streamId: string }>
    cancelStream(streamId): Promise<void>
    onStreamEvent(streamId, cb): () => void   // returns unsubscribe
  },
  auth: {
    login(credentials): Promise<SessionView | null>
    register(registration): Promise<SessionView | null>
    logout(): Promise<void>
    restoreSession(): Promise<SessionView | null>
    clearSession(): Promise<void>
    updateUser(user): Promise<SessionView | null>
  },
}
```

**Important:** `window.nexus` is only available in Electron. All API code must handle the fallback path where `window.nexus` is undefined (browser dev mode). See `api/client.ts` for the pattern.

---

## Adding a new page / feature

### 1. New route

Add to `src/renderer/router/index.tsx` under the `Shell` parent:

```tsx
{ path: 'my-feature', element: <MyFeaturePage /> },
```

For a platform app, mount only the app entrypoint in the root router:

```tsx
{ path: 'my-platform/*', element: <MyPlatformApp /> },
```

and keep its internal routes inside `src/renderer/apps/my-platform/routes.tsx`.

### 2. New page or app component

Create global pages under `src/renderer/pages/`.

Create product platforms under `src/renderer/apps/<app-name>/`. App folders own:
- Local state (hooks)
- Layout (`<style>` + divs)
- Data fetching (SWR or `api.*` calls)
- No business logic — call the API directly

### 3. New API call

Add a typed function in `src/renderer/api/client.ts` or inline in the component:

```ts
const data = await api.get<{ items: MyItem[] }>('/my-resource')
```

Add the response type to `src/renderer/api/types.ts`.

### 4. New sidebar link

Add a `<SidebarItem>` entry in `src/renderer/components/layout/Sidebar.tsx`.

### 5. New settings section

Add a nav entry in `src/renderer/pages/settings/SettingsNav.tsx` and a corresponding view component in `src/renderer/pages/settings/`.

---

## Adding a new tool renderer

Tool blocks are rendered by `src/renderer/components/chat/ToolBlock.tsx` which dispatches to per-tool renderers in `src/renderer/components/chat/tool-block/renderers/`.

To add a renderer for a new tool:

1. Create `renderers/MyToolView.tsx`.
2. Add a case in `ToolBlock.tsx` dispatcher.
3. If the tool has a rich result layout, add its styles to `styles.ts`.

Follow the existing renderers (`BashToolView`, `WebSearchToolView`, etc.) as the pattern.

---

## Build and type-check

Before finishing any change:

```bash
npm run typecheck   # tsc --noEmit — must pass
npm run lint        # oxlint — must pass
npm run build       # electron-vite build — must produce no errors
```

Dev mode:

```bash
npm run start       # electron-vite dev — launches Electron with HMR
```

Requires the nexus-product backend to be running on port 8090. Set `NEXUS_RUNTIME_ROOT` to match the backend's data directory.

---

## Rules for nexus-product backend

seshat-ui is a **consumer** of the nexus-product API. It must not:

- Attempt to call undocumented or non-existent API endpoints.
- Depend on implementation details of the backend (DB schema, internal types).
- Hard-code business logic that belongs in the backend (auth policy, quota rules).
- Break the desktop bridge handshake (the `HMAC-SHA256` nonce exchange at `/api/v1/desktop/handshake`).

When the API changes, update `src/renderer/api/types.ts` to match the new response shape.

---

## What not to do

- Do not add business logic to pages — call the API and render.
- Do not access `window.nexus` without a null-check — code must work without Electron.
- Do not hardcode colors — always use design tokens (`var(--color-*)`).
- Do not hand-roll a UI primitive Arco Design already provides (cards, buttons, tags, statistics, tables, tabs, selects, modals/drawers, forms) — check Arco first, by default, not only for "complex" cases.
- Do not add new global CSS files — use scoped CSS strings or UnoCSS utilities.
- Do not write a bespoke CSS-in-JS block for plain layout (flex/grid alignment, spacing, sizing) that UnoCSS utility classes already express in the className.
- Do not use `any` — type all API responses in `api/types.ts`.
- Do not put long inline styles in JSX — move to the component's CSS string.
- Do not add `console.log` in production paths.
- Do not change the hash router to a browser router — it will break Electron file:// loads.
- Do not modify anything in `nexus-engine/`.

---

## Commit messages

Same convention as the main repo:

```
<type>(<scope>): <short description>
```

Types: `feat`, `fix`, `refactor`, `style`, `docs`, `test`, `chore`, `perf`.
Scope: component or feature name (`chat`, `sidebar`, `settings`, `streaming`, `auth`, `plan`, `mcp`).

Examples:

```
feat(plan): add inline plan editor in the right panel
fix(streaming): cancel stale RAF on component unmount
style(tokens): add --color-code-bg token for syntax blocks
refactor(useChat): extract handleSubagentEvent to dedicated function
```
