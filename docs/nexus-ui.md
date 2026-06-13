# Nexus UI — Architecture and Guide

Documentation for `nexus-ui`, the Electron + React desktop application for Nexus.

For AI agent working rules and artistic direction, see [`nexus-ui/AGENTS.md`](../nexus-ui/AGENTS.md).

---

## Overview

`nexus-ui` is a **frameless Electron desktop app** that consumes the Nexus AI REST + SSE HTTP API. It has no backend logic — it is a pure UI layer.

```
nexus-ui (Electron + React)
  ↓ HTTP / IPC bridge
Nexus AI API (Go, port 8090)
  ↓
nexus-engine (Go AI agent runtime)
```

---

## Process architecture

Electron splits code across two isolated processes:

### Main process (`src/main/`)

Runs in Node.js. Owns:
- Window creation (`index.ts`) — frameless, 1280×800, custom title bar
- IPC handler registration — three modules:
  - `ipc/backend.ts` — authenticates with the Nexus AI backend via HMAC-SHA256 bridge handshake, then proxies HTTP requests and SSE streams
  - `ipc/secure-store.ts` — OS keychain integration (`safeStorage`) for auth token persistence
  - `ipc/system.ts` — window controls (minimize / maximize / close)
- Runtime path resolution (`runtime.ts`) — `NEXUS_RUNTIME_ROOT` → `~/.config/nexus`

### Preload (`src/preload/index.ts`)

Bridges the two processes via `contextBridge`. Exposes `window.nexus` to the renderer — a typed API surface covering window controls, HTTP operations, streaming, auth, and secure storage.

### Renderer (`src/renderer/`)

Sandboxed browser context. Full React application. Never has direct Node.js access — everything goes through `window.nexus`.

---

## Application structure

```
src/renderer/
├── api/
│   ├── client.ts      ← typed api.get/post/patch/delete/upload
│   └── types.ts       ← all API response interfaces
│
├── stores/            ← Zustand state
│   ├── auth.ts        ← token, user, roles (stored in OS keychain)
│   ├── session.ts     ← sessions, messages, streaming, agent + sub-agent state, plans
│   ├── ui.ts          ← theme, sidebar state, right panel, permission mode
│   ├── providers.ts   ← provider configs cache
│   └── secure-storage.ts
│
├── hooks/
│   ├── useChat.ts     ← SSE streaming orchestrator (main complexity)
│   ├── useAuth.ts
│   └── useProviders.ts
│
├── components/
│   ├── layout/
│   │   ├── Shell.tsx          ← root layout: title bar + sidebar + main + right panel
│   │   ├── Sidebar.tsx        ← collapsible nav (260px / 68px)
│   │   ├── RightPanelHost.tsx ← resizable right panel (RAG results, plan editor, sub-agents)
│   │   └── SearchModal.tsx    ← ⌘K session search
│   ├── chat/
│   │   ├── ChatInput.tsx      ← textarea + file attach + corpus selector + permission mode
│   │   ├── ChatTopBar.tsx     ← session header (model, mode, title)
│   │   ├── MessageItem.tsx    ← renders a single conversation message
│   │   ├── ToolBlock.tsx      ← dispatches to per-tool renderers
│   │   ├── PermissionCard.tsx ← approval request card
│   │   ├── AgentToolView.tsx  ← agent state indicator
│   │   ├── plan/              ← plan artifact card, editor panel, modal
│   │   ├── subagent/          ← sub-agent panel
│   │   └── tool-block/
│   │       ├── renderers/     ← BashToolView, TaskToolView, WebSearchToolView, ...
│   │       ├── common.tsx     ← shared tool UI primitives
│   │       └── styles.ts      ← shared tool block styles
│   ├── auth/                  ← AuthGuard, AuthLayout, FormPrimitives
│   └── ui/                    ← IconButton, ProviderIcon, SelectorPill, StatusBadge
│
├── pages/
│   ├── Home.tsx               ← new chat landing
│   ├── Conversation.tsx       ← session + streaming view
│   ├── Login.tsx / Register.tsx
│   ├── ScheduledTasks.tsx
│   ├── settings/              ← admin settings (providers, MCP, knowledge, users, ...)
│   ├── user-settings/         ← personal preferences, memories
│   └── skills-creator/        ← skill authoring UI
│
└── styles/
    ├── tokens.css             ← CSS custom properties (design tokens)
    ├── globals.css            ← base reset, scrollbar, animations
    └── shared.css             ← auth layout utilities
```

---

## Routes

```
/login           ← unauthenticated
/register        ← unauthenticated (if NEXUS_ENABLE_SIGNUP=true)

/ (Shell)        ← requires auth (AuthGuard)
  /              ← Home: new chat
  /conversation/:id  ← active agent session
  /settings          ← admin settings (providers, MCP, knowledge, users, web search, about)
  /user-settings     ← personal settings (memories, preferences, profile)
  /skills-creator    ← skill authoring
  /scheduled-tasks   ← scheduled task list
```

All routes use `createHashRouter` (required for Electron file:// loads — browser history API is unavailable).

---

## Desktop bridge security

At startup the main process performs a **HMAC-SHA256 handshake** with the Nexus AI backend:

1. Generate a random 32-byte nonce.
2. Call `GET /api/v1/desktop/handshake?nonce=<nonce>`.
3. Read the per-install secret from `~/.config/nexus/data/desktop-bridge-secret` (created on first run, mode `0o600`).
4. Verify `body.proof === HMAC-SHA256(secret, nonce)`.

This ensures that `nexus-ui` only talks to a local backend that shares the same runtime root, preventing confused-deputy attacks where a malicious backend impersonates the trusted one.

If the handshake fails, all API calls are blocked and the app shows an error.

---

## SSE streaming pipeline

```
User sends message
  → useChat.sendMessage()
      → adds user + placeholder assistant messages to session store
      → calls window.nexus.http.startStream({ path: '/query/stream', body })
          → main process: POST /api/v1/query/stream (SSE)
              → streams back: text chunks, tool progress, permission requests, done
      → IPC channel: http:stream:event per SSE line
      → renderer dispatches:
          'runtime' events → handleRuntimeEvent()
              → tool.permission_required → show PermissionCard
              → plan.submitted → seed plan artifact
              → tool.progress → update tool status in streaming store
              → sub-agent events (agent_tool_use_id set) → handleSubagentEvent()
          'done' event → commitDonePayload() → replace streaming with final messages
          other events → handleStreamChunk() → append text/thinking/tool_use blocks
      → re-renders batched via requestAnimationFrame (scheduleSync/flushSync)
      → retry on TypeError (network drop): 3 attempts, 1s/2s/4s backoff
```

Token rendering performance: text delta updates use a fast path that shallow-clones only the last block instead of doing a full deep-clone of the streaming array.

---

## Design system

The design system is defined in `src/renderer/styles/tokens.css`. Key values:

| | Dark | Light |
|---|---|---|
| Background | `#2F2E34` (warm purple-brown) | `#F6F4F1` (warm cream) |
| Surface | `#3A3941` | `#FFFFFF` |
| Brand | `#EF7C2F` (orange) | `#EF7C2F` |
| Accent | `#C89A6A` (warm gold) | `#C89A6A` |
| Text | `#E7E2DA` (warm off-white) | `#1E1C1A` |
| Text muted | `#918A82` | `#938C84` |

Typography: **Plus Jakarta Sans → Inter → system-ui**, 14px base.

Spacing: border radius 6px → 8px → 10px → 12px → 20px (scale from chips to chat input).

See [`nexus-ui/AGENTS.md`](../nexus-ui/AGENTS.md) for the full artistic direction guide including motion, scrollbar behavior, CSS patterns, and what not to do.

---

## Running locally

```bash
cd nexus-ui

# Install dependencies
npm install

# Start dev mode (requires nexus-product running on :8090)
npm run start

# Type-check
npm run typecheck

# Lint
npm run lint

# Production build
npm run build

# Package as distributable
npm run package
```

Environment variables for dev:

| Variable | Description | Default |
|---|---|---|
| `NEXUS_BACKEND_ORIGIN` | nexus-product base URL | `http://127.0.0.1:8090` |
| `NEXUS_RUNTIME_ROOT` | Data directory (must match backend) | `~/.config/nexus` |

---

## API contract with nexus-product

All types consumed by the UI are defined in `src/renderer/api/types.ts`. When nexus-product adds or changes an API endpoint:

1. Update `src/renderer/api/types.ts` with the new response shape.
2. Update or add the call in `src/renderer/api/client.ts`.
3. Update the consuming component or hook.

The UI must never depend on undocumented response fields. If a field is not in `types.ts`, it does not exist from the UI's perspective.

---

## Key design decisions

**Frameless window** — The native OS title bar is replaced by a custom 42px title bar with Nexus branding in the center and window controls on the right. This gives a consistent look across platforms and allows the sidebar toggle button to sit in the title bar.

**Hash router** — `createHashRouter` is mandatory for Electron's `file://` protocol. Do not switch to a browser-history router.

**CSS-in-JS strings** — Component-local styles are co-located in the same file as a `const CSS_STRING`. This avoids CSS module overhead and keeps styles visible when reading the component.

**SSE via IPC** — In Electron the renderer cannot directly open an `EventSource` to a local server (CORS, sandbox). SSE is implemented by the main process reading the stream and forwarding events via `ipcRenderer.send` per line.

**RequestAnimationFrame batching** — Every streamed token would trigger a full React re-render without batching. The `scheduleSync`/`flushSync` pattern coalesces updates to at most once per animation frame (~16ms).
