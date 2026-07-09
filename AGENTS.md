# Agent Instructions — SeshatOS

Read this file before changing code in this repository.

---

## Project overview

`seshat-ai` is the private product layer built on top of [seshat](https://github.com/EngineerProjects/seshat), the open-source Go runtime.

The repository now contains four main sub-projects:

| Directory | Language | Role |
|---|---|---|
| `seshat-backend/` | Go | local backend / desktop HTTP API |
| `seshat-server/` | Go | cloud server for auth, orgs, jobs, sync |
| `seshat-ui/` | TypeScript / Electron | desktop client that consumes the local API |
| `seshat/` | Go (submodule) | open-source runtime — never modify casually |

Dependency direction is one-way:

```text
seshat-ui       → seshat-backend   (HTTP only)
seshat-server   → seshat-backend   (temporary shared Go packages)
seshat-backend  → seshat           (pkg/* only)
seshat          → seshat-backend   (never)
seshat          → seshat-server    (never)
```

`seshat-backend` may import `seshat/pkg/*` freely. It must never import `seshat/internal/*`.

---

## Build and test

Always run these before finishing Go work:

```bash
go build ./seshat-backend/... ./seshat-server/... ./seshat/...
go vet ./seshat-backend/... ./seshat-server/... ./seshat/...
go test -race ./seshat-backend/... ./seshat-server/... ./seshat/...
gofmt -w .
```

If a Go test fails, fix the root cause. Do not paper over failures with skips.

---

## Backend layout

The product backend lives under `seshat-backend/`:

```text
seshat-backend/
  cmd/api/                 thin local-backend entrypoint
  internal/api/            HTTP transport, SSE, middleware, route wiring
  internal/app.go          DI container
  internal/<domain>/       business logic
  internal/db/             persistence and migrations
```

The cloud bootstrap lives under `seshat-server/`:

```text
seshat-server/
  cmd/server/              cloud entrypoint
  internal/server/api/     server HTTP handlers
  internal/server/app/     minimal server container
  internal/server/config/  server bootstrap wiring
```

---

## Package boundary rules

Inside `seshat-backend`:

- `internal/api/` is transport only. No business logic there.
- `internal/<domain>/` owns business rules.
- `internal/db/` owns CRUD, queries, migrations, and persistence details.
- `internal/app.go` wires dependencies only.
- Services return domain types and `bkerr` errors.
- Handlers map those errors with `writeBackendError`.

Import direction is strict:

```text
internal/api → internal/<domain> → internal/db
internal/api → internal/app.go
```

Never import `internal/api/` from a service.

---

## Adding a new backend domain

Follow this pattern:

1. Add `seshat-backend/internal/<domain>/types.go` and `service.go`.
2. Wire the store and service in `seshat-backend/internal/app.go`.
3. Initialize persistence in `seshat-backend/internal/api/bootstrap.go`.
4. Add handlers in `seshat-backend/internal/api/<domain>.go`.
5. Register routes in `seshat-backend/internal/api/routes.go`.

Handlers stay thin. Stores are never called directly from handlers.

---

## Rules for seshat-ui

`seshat-ui` is a pure UI consumer of the local backend HTTP API.

Before changing UI code, read [`seshat-ui/AGENTS.md`](./seshat-ui/AGENTS.md).

Do not:
- move backend logic into Electron or React
- read backend internals directly from the UI
- hard-code policy that belongs in the backend

---

## Rules for seshat

- Never modify files inside `seshat/` unless the task explicitly requires runtime changes.
- If the backend/server needs something missing from `seshat/pkg/*`, add it in `seshat` first, then consume it here.
- The local backend module path lives in `seshat-backend/go.mod` and intentionally keeps `module github.com/EngineerProjects/seshat-ai/seshat-backend`.
- The `replace` wiring between `seshat-backend`, `seshat-server`, and `seshat` is intentional. Do not change it casually.

---

## Development commands

Run the local backend:

```bash
cd seshat-backend
go run ./cmd/api
```

Run the cloud server bootstrap:

```bash
cd ../seshat-server
go run ./cmd/server
```

Run the desktop app from the repository root:

```bash
make dev
```

---

## Documentation to update

When behavior changes, update the relevant docs:

- `README.md` for repo layout and quick-start changes
- `docs/architecture.md` for package or boundary changes
- `docs/development.md` for workspace and command changes
- `docs/RUNTIME.md` for runtime/docling behavior

---

## When in doubt

Read these first:

- `README.md`
- `docs/architecture.md`
- `docs/development.md`
- `seshat-backend/internal/app.go`
- `seshat-ui/AGENTS.md`
