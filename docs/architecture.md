# Architecture — SeshatOS

This document describes the current repository layout and the package boundaries between the local product backend, the cloud server bootstrap, and the open-source runtime.

---

## Repository shape

```
seshat-ai/
├── seshat-backend/   ← local backend / desktop HTTP API
├── seshat-server/    ← cloud server bootstrap (auth, orgs, jobs, sync)
├── seshat-ui/        ← Electron desktop client
└── seshat/           ← open-source Go runtime submodule
```

The dependency direction is intentionally one-way:

```text
seshat-ui        → seshat-backend   (HTTP only)
seshat-server    → seshat-backend   (temporary shared Go packages)
seshat-backend   → seshat           (pkg/* only)
seshat           → seshat-backend   (never)
seshat           → seshat-server    (never)
```

`go.work` at the repository root ties the three Go modules together during local development:

```go
use (
    ./seshat
    ./seshat-backend
    ./seshat-server
)
```

---

## Local backend

The main product backend now lives in `seshat-backend/`.

```
seshat-backend/
├── cmd/api/                     ← thin HTTP entrypoint
└── internal/
    ├── api/                     ← transport layer, SSE, middleware, route wiring
    ├── app.go                   ← DI container
    ├── agents/                  ← agent definitions
    ├── audit/                   ← audit log service
    ├── auth/                    ← auth, sessions, API keys, RBAC
    ├── bkerr/                   ← typed backend errors
    ├── db/                      ← stores, schema, migrations
    ├── files/                   ← file management
    ├── knowledge/               ← RAG ingestion and retrieval
    ├── mcp/                     ← MCP configuration
    ├── memories/                ← user memory services
    ├── metrics/                 ← observability snapshot service
    ├── plans/                   ← plans attached to sessions
    ├── preferences/             ← permission mode and user prefs
    ├── query/                   ← runtime adapter over seshat SDK
    ├── quotas/                  ← usage counters
    ├── resources/               ← users, orgs, workspaces
    ├── scheduler/               ← local scheduled runs
    ├── settings/                ← providers, OAuth, storage config
    ├── skills/                  ← skill registry and resolution
    └── websearch/               ← web search providers and logs
```

### Layer order

```text
cmd/api
  → internal/api
  → internal/app.go
  → internal/<domain>
  → internal/db
  → seshat/pkg/*
```

### Responsibilities

`cmd/api/`
- Process startup and shutdown
- Config loading
- HTTP server boot
- Docling auto-start for local desktop usage

`internal/api/`
- Parse requests and validate inputs
- Resolve auth principals
- Call domain services
- Map `bkerr` to HTTP responses
- Stream SSE responses for agent runs

`internal/app.go`
- Compose stores, services, and runtime dependencies
- No business logic

`internal/<domain>/`
- Own business rules
- Accept principals and typed params
- Return domain types and `bkerr` errors
- Never import `internal/api/`

`internal/db/`
- Own persistence concerns only
- CRUD, queries, pagination, migrations
- No transport logic
- No high-level business policy

---

## Cloud server bootstrap

The cloud-side server now lives in `seshat-server/`.

```
seshat-server/
├── cmd/server/                  ← server entrypoint
└── internal/server/
    ├── api/                     ← HTTP handlers for server bootstrap
    ├── app/                     ← minimal server dependency container
    └── config/                  ← bootstrap and wiring
```

Current role:
- Separate cloud-oriented entrypoint from the local desktop backend
- Bootstrap auth, users, organizations, audit, and future job/sync domains
- Reuse some backend packages temporarily while the split is still in progress

Target role:
- Cloud auth and IAM surfaces
- Organizations and tenancy
- Devices and trust relationships
- Jobs, runs, automation orchestration
- Sync and audit surfaces

The important rule is architectural, not just physical: `seshat-server` must not become a second copy of the local runtime backend. It should own cloud coordination concerns.

---

## Runtime boundary

Both product backends depend on the public `seshat/pkg/*` surface only.

Allowed examples:

```go
import (
    "github.com/EngineerProjects/seshat/pkg/config"
    "github.com/EngineerProjects/seshat/pkg/rag"
    "github.com/EngineerProjects/seshat/pkg/sdk"
    "github.com/EngineerProjects/seshat/pkg/storage"
    "github.com/EngineerProjects/seshat/pkg/types"
)
```

Forbidden:
- importing `seshat/internal/*`
- pushing product auth or org logic into `seshat`
- coupling the UI directly to Go packages or DB internals

---

## Request lifecycle in the local backend

```text
HTTP request
  → middleware
  → handler in internal/api
  → service in internal/<domain>
  → store in internal/db
  → response mapping / SSE stream
```

For query streaming:

```text
POST /api/v1/query/stream
  → auth middleware
  → query handler
  → query service
  → seshat SDK runtime
  → SSE chunks + runtime events
  → final response
```

---

## Development commands

From the repository root:

```bash
go build ./seshat-backend/... ./seshat-server/... ./seshat/...
go test ./seshat-backend/... ./seshat-server/... ./seshat/...
```

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
