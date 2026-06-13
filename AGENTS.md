# Agent Instructions — Nexus Product

This file provides guidance for AI agents (Nexus, Claude Code, Codex, or similar) working on this repository. Read it before making any changes.

---

## Project overview

nexus-product is the **private proprietary product layer** built on top of [nexus-engine](https://github.com/EngineerProjects/nexus-engine). It adds multi-user auth, organizations, workspaces, per-user provider credentials, knowledge/RAG, MCP management, audit, quotas, and a full REST+SSE HTTP API on top of the open-source runtime.

This repository contains two sub-projects:

| Directory | Language | Role |
|---|---|---|
| `cmd/api/` + `internal/` | Go | nexus-product — HTTP API server |
| `nexus-ui/` | TypeScript / Electron | Desktop client that consumes the API |
| `nexus-engine/` | Go (submodule) | Open-source AI agent runtime — **never modify** |

**Dependency direction is strictly one-way:**

```
nexus-ui       → nexus-product API   (HTTP only, port 8090)
nexus-product  → nexus-engine        (Go imports from pkg/ only)
nexus-engine   → nexus-product       (never)
nexus-engine   → nexus-ui            (never)
```

nexus-product may import `nexus-engine/pkg/*` freely. It must never import `nexus-engine/internal/*`. nexus-engine must never reference nexus-product.

---

## nexus-ui

`nexus-ui` is an Electron + React desktop application. It is a **pure UI consumer** of the nexus-product HTTP API — no AI logic, no database, no Go code.

Before working on nexus-ui, read **[`nexus-ui/AGENTS.md`](./nexus-ui/AGENTS.md)** which covers:
- Process architecture (main / preload / renderer)
- Desktop bridge security (HMAC-SHA256 handshake)
- Full design system and artistic direction (color palette, typography, motion, CSS patterns)
- SSE streaming pipeline
- State management (Zustand stores)
- How to add a new page, tool renderer, or settings section
- Build / lint / typecheck commands
- What not to do

The TypeScript stack uses **React 19**, **UnoCSS**, **Arco Design**, **Zustand 5**, **SWR**, and **electron-vite**.

---

## Build and test

Always run these before finishing:

```bash
go build ./...          # must pass — no exceptions
go vet ./...            # must pass — no exceptions
go test -race ./...     # must pass — fix failures, do not skip
gofmt -w .              # always run after editing Go files
```

If `go test` fails, investigate and fix the root cause. Do not disable tests or add `t.Skip()` to work around failures.

---

## Package structure

```
internal/
├── api/          ← HTTP transport (package api)
│   ├── app.go         App struct + AppConfig + NewApp
│   ├── bootstrap.go   BuildApp() — full dependency wiring
│   ├── routes.go      CreateRouter() — HTTP mux
│   ├── middleware.go  CORS, auth, recover, requestID, ratelimit
│   ├── helpers.go     writeJSON, decodeJSONBody, writeBackendError
│   └── *.go           one file per domain (auth.go, query.go, files.go, ...)
│
├── app.go        ← package nexus — App, Dependencies, NewApp (the DI container)
│
├── audit/        ← audit log service
├── auth/         ← JWT, API keys, principal, roles, identity
├── bkerr/        ← typed error kinds (InvalidInput, NotFound, Forbidden, ...)
├── db/           ← data access layer (stores, migrations, SQLite/PG/MySQL)
├── files/        ← file upload/download, workspace management
├── knowledge/    ← corpora, ingestion jobs, RAG search
├── mcp/          ← MCP server configuration management
├── memories/     ← user memories + long-term extraction
├── metrics/      ← Prometheus snapshot service
├── plans/        ← plan document CRUD
├── preferences/  ← user preferences, permission mode resolution
├── query/        ← query/streaming runtime adapter (wraps nexus-engine SDK)
├── quotas/       ← usage counters per metric
├── resources/    ← organizations, workspaces, user admin
├── settings/     ← provider settings, OAuth connections
└── websearch/    ← web search settings, provider configs, search logs

cmd/api/
├── main.go       ← thin entrypoint (~50 lines)
└── config.go     ← APIConfig + defaultAPIConfig
```

---

## Package boundary rules

- `internal/api/` is the **transport layer only** — it must not contain business logic. Handlers call backend services and map responses to HTTP.
- Domain services (`internal/<domain>/`) are the **business logic layer** — they take `*auth.Principal` and domain params, return domain types and `bkerr` errors. They never import `internal/api/`.
- `internal/db/` is the **data access layer** — raw store operations. Services wrap stores; handlers never access stores directly.
- `internal/app.go` (`package nexus`) is the **DI container** — it wires all stores into services. No logic here.
- `internal/bkerr/` defines error kinds. All services use `bkerr.InvalidInput`, `bkerr.NotFound`, etc. Handlers map these to HTTP status codes via `writeBackendError`.

**Import direction (strict):**
```
internal/api → internal/<domain> → internal/db
internal/api → internal/app.go (package nexus)
```

No cycles. Never import `internal/api/` from a domain service.

---

## Adding a new feature domain

Follow this pattern exactly:

**1. Backend service** — `internal/<domain>/types.go` + `internal/<domain>/service.go`

```go
package <domain>

// types.go — domain types, no db types exported
type Thing struct { ID, Name string; CreatedAt time.Time }
type CreateParams struct { Name string }

// service.go — business logic
type Service struct{ store *db.ThingStore }
func NewService(store *db.ThingStore) *Service { return &Service{store: store} }
func (s *Service) List(ctx context.Context, principal *auth.Principal) ([]Thing, error) { ... }
```

**2. Wire it** — `internal/app.go`

```go
// Dependencies field:
ThingStore *db.ThingStore

// App field:
Things *<domain>.Service

// NewApp:
Things: <domain>.NewService(deps.ThingStore),
```

**3. Bootstrap** — `internal/api/bootstrap.go`

Add store initialization and pass it to `nexus.Dependencies`.

**4. HTTP handler** — `internal/api/<domain>.go`

```go
package api

func (app *App) handleThings(w http.ResponseWriter, r *http.Request) {
    principal, _ := authPrincipalFromContext(r.Context())
    list, err := app.backend.Things.List(r.Context(), principal)
    if err != nil { writeBackendError(w, err); return }
    writeJSON(w, http.StatusOK, map[string]any{"things": list})
}
```

**5. Route** — `internal/api/routes.go`

```go
apiV1.Handle("/things", app.authMiddleware(http.HandlerFunc(app.handleThings)))
```

---

## Rules for nexus-engine

- **Never modify files inside `nexus-engine/`**. It is an active open-source submodule with its own CI and contributors.
- If nexus-product needs something that nexus-engine doesn't yet expose, open a PR on nexus-engine to add it to `pkg/` first, then consume it here.
- Always verify that `pkg/` of nexus-engine exposes what you need before importing from it.
- The `nexus-engine` submodule pointer in `go.mod` (`replace` directive) must never be changed without explicit instruction.

---

## Error handling

Always use `bkerr` in services:

```go
return nil, bkerr.NotFound("thing not found", err)
return nil, bkerr.InvalidInput("name is required", nil)
return nil, bkerr.Forbidden("access denied", nil)
return nil, bkerr.Internal("db error: "+err.Error(), err)
```

Handlers call `writeBackendError(w, err)` which maps error kinds to HTTP status codes automatically.

Never return raw `err.Error()` strings from services — they may leak internals.

---

## Go conventions

- Always pass `context.Context` as the first parameter for any function that may do I/O.
- Use `errors.Is` / `errors.As` for error comparisons — never string-match on `err.Error()`.
- No `interface{}` — use `any`.
- Value receivers on types containing `sync.Mutex` are forbidden — use pointer receivers.
- Do not add `fmt.Printf` for logging in production paths — use structured stderr writes.
- Prefer table-driven tests (`[]struct{ name, input, want }`).

---

## Branching strategy

```
main  → production, protected, PR required, Gate CI required
dev   → stable integration, protected, PR required, Gate CI required
feat/<slug> → working branches
```

- Always branch from `dev`.
- Never commit directly to `main` or `dev`.
- PRs target `dev`. Only `dev` → `main` for releases.

Before each commit:

```bash
go build ./... && go vet ./... && gofmt -l . && go test -race ./...
```

---

## Commit message format

```
<type>(<scope>): <short description>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

Examples:
```
feat(billing): add per-workspace usage cap enforcement
fix(auth): prevent token reuse after explicit logout
docs(api): document /v1/messages Anthropic compatibility headers
refactor(query): move buildContextInput to internal/query package
```

---

## Documentation updates

When you add or change behavior, also update:

| Change | Update |
|---|---|
| New API endpoint | `README.md` API table + `docs/architecture.md` |
| New domain service | `docs/architecture.md` package map |
| New env var | `docs/development.md` env var table |
| Breaking change | Note in PR description |
| New public SDK method | `docs/architecture.md` |

---

## What not to do

- Do not add business logic to `internal/api/` handlers — it belongs in services.
- Do not access `internal/db/` stores directly from handlers — always go through a service.
- Do not add `cmd/api`, user models, or auth to `nexus-engine`.
- Do not add `replace` directives to `go.mod`.
- Do not commit secrets, credentials, or large binaries.
- Do not use `//nolint` without an explanation comment on the same line.
- Do not make speculative changes. Only change what is needed to accomplish the stated task.

---

## When in doubt

- Read `README.md` for the product overview and API surface.
- Read `docs/README.md` for the full documentation index.
- Read `docs/architecture.md` for the backend package map.
- Read `docs/nexus-ui.md` for the desktop client architecture.
- Read `docs/product/vision.md` for what Nexus is and is not.
- Read `docs/development.md` for local setup and env vars.
- Read `internal/app.go` to understand the Go dependency graph.
- Read `nexus-ui/AGENTS.md` for UI-specific rules and artistic direction.
