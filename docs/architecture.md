# Architecture — Nexus AI

This document describes the package structure, layer responsibilities, and dependency rules for nexus-ai.

---

## Overview

nexus-ai is a **multi-layer Go application** built on top of the `nexus-engine` submodule. The layers are strictly ordered — each layer only imports downward.

```
┌──────────────────────────────────────────────────┐
│  cmd/api/                                        │
│  main.go + config.go  (thin entrypoint, ~80 lines)│
└──────────────────┬───────────────────────────────┘
                   │ imports
┌──────────────────▼───────────────────────────────┐
│  internal/api/           package api              │
│  HTTP transport layer                             │
│  App, BuildApp, CreateRouter, handlers, SSE       │
└──────────────────┬───────────────────────────────┘
                   │ imports
┌──────────────────▼───────────────────────────────┐
│  internal/app.go         package nexus            │
│  DI container: App, Dependencies, NewApp          │
└──────────────────┬───────────────────────────────┘
                   │ imports
┌──────────────────▼───────────────────────────────┐
│  internal/<domain>/      one package per domain   │
│  audit  auth  bkerr  files  knowledge  mcp        │
│  memories  metrics  plans  preferences  query     │
│  quotas  resources  settings  websearch           │
└──────────────────┬───────────────────────────────┘
                   │ imports
┌──────────────────▼───────────────────────────────┐
│  internal/db/            data access layer        │
│  Stores, migrations, schema, SQLite/PG/MySQL      │
└──────────────────┬───────────────────────────────┘
                   │ imports
┌──────────────────▼───────────────────────────────┐
│  nexus-engine/pkg/*      open-source runtime      │
│  sdk  providers  types  rag  storage  mcp  ...    │
└──────────────────────────────────────────────────┘
```

---

## Layer responsibilities

### `cmd/api/` — entrypoint

Two files only:

- `main.go` — signal handling, call `api.BuildApp`, call `api.CreateRouter`, start HTTP server, graceful shutdown.
- `config.go` — `APIConfig` struct and `defaultAPIConfig(cfg)`.

No business logic. No imports of `internal/db/` or domain services.

---

### `internal/api/` — HTTP transport (`package api`)

Responsible for:
- Parsing HTTP requests (JSON bodies, query params, path segments)
- Calling backend services
- Mapping `bkerr` errors to HTTP status codes via `writeBackendError`
- Writing JSON responses
- SSE streaming (query stream, permission events, prompt events)
- Middleware: auth, CORS, rate limit, recover, requestID, maxBody

Key files:
- `app.go` — `App` struct, `AppConfig`, `NewApp`
- `bootstrap.go` — `BuildApp(ctx, config)` — initializes all stores, services, SDK client
- `routes.go` — `CreateRouter(cfg, app)` — registers all routes
- `middleware.go` — auth middleware, CORS, recover, etc.
- `helpers.go` — `writeJSON`, `decodeJSONBody`, `writeBackendError`, `newRequestID`

**What does not belong here:** Business logic, database access, error type definitions.

---

### `internal/app.go` — DI container (`package nexus`)

Single file. Defines:
- `Dependencies` — all raw stores and external clients
- `App` — all domain services
- `NewApp(deps) *App` — wires stores into services

This is the composition root. It has no logic — only wiring.

```go
// Usage pattern
app := nexus.NewApp(nexus.Dependencies{
    Identity:   identityStore,
    FileStore:  fileStore,
    // ...
})
// then: app.Auth.Login(...), app.Query.RunPrompt(...)
```

---

### `internal/<domain>/` — domain services

One package per business domain. Each package has:
- `types.go` — domain types (no `db.*` types exported)
- `service.go` — business logic methods

Rules:
- Accept `*auth.Principal` and domain params.
- Return domain types and `bkerr` errors.
- Never import `internal/api/`.
- Never return raw DB errors — always wrap with `bkerr.*`.

Current domains:

| Package | Responsibility |
|---|---|
| `agents` | User-defined agent CRUD + SDK built-in registry bridge |
| `audit` | Audit log entries — write and query |
| `auth` | JWT, API keys, identity, roles, RBAC |
| `bkerr` | Typed error kinds used across all services |
| `files` | File upload/download, workspace scoping, Docling conversion |
| `knowledge` | Corpora, ingestion jobs, RAG hybrid search |
| `mcp` | MCP server configuration CRUD + hot-reload |
| `memories` | User memories + long-term entity extraction |
| `metrics` | Prometheus snapshot, Snapshotter interface |
| `plans` | Plan documents created by the agent's plan tool |
| `preferences` | User preferences, permission mode resolution |
| `prompt` | System prompt assembly layer (injected on every query) |
| `query` | Query/streaming runtime adapter (wraps nexus-engine SDK), session management |
| `quotas` | Per-user usage counters (queries, files, ingestions) |
| `resources` | Organizations, workspaces, user CRUD (admin) |
| `scheduler` | Cron-based background agent runs, job history |
| `settings` | Provider settings, OAuth device-code flow |
| `skills` | Skill registry, prompt resolution, user skill file I/O |
| `websearch` | Web search settings, provider configs, search logs |

---

### `internal/db/` — data access layer

SQLite / PostgreSQL / MySQL via GORM. One file per entity:

```
api_keys.go    audit.go      auth.go       bootstrap.go
config.go      credentials.go  db.go       embedder_config.go
files.go       groups.go     identity.go   ingestion_jobs.go
knowledge.go   mcp_servers.go  memories.go  migrations*.go
plans.go       provider_models.go  provider_oauth_connections.go
provider_settings.go  quotas.go  schema.go  search_provider_configs.go
security.go    sessions.go   storage_config.go  tenancy.go
user_memories.go  user_preferences.go  web_search.go
```

Rules:
- Stores operate on `db.*` model types (never domain types).
- Migrations are versioned and run automatically when `DB_AUTO_MIGRATE=true`.
- No business logic — pure CRUD, queries, and pagination.

---

## Request lifecycle

```
HTTP request
  → requestIDMiddleware          (inject request ID)
  → recoverMiddleware            (catch panics)
  → corsMiddleware               (if enabled)
  → maxBodyMiddleware            (4 MB limit)
  → authMiddleware               (validate JWT or API key → Principal)
  → handler (internal/api/*.go)
      → call service (internal/<domain>/service.go)
          → call store (internal/db/*.go)
          → return domain type + bkerr error
      → writeJSON / writeBackendError
```

For streaming queries:
```
POST /api/v1/query/stream
  → authMiddleware
  → handleQueryStream
      → buildQueryInput (assemble context: preferences + memories + RAG + attachments)
      → backend.Query.StreamPrompt
          → nexus-engine SDK session.SubmitMessage
          → onChunk callback → writeSSE (text chunks)
          → onRuntimeEvent callback → writeSSE (tool calls, permissions)
      → writeSSE("done", finalResult)
```

---

## nexus-engine integration

nexus-product consumes nexus-engine **exclusively through `pkg/`**:

```go
import (
    "github.com/EngineerProjects/nexus-engine/pkg/sdk"
    "github.com/EngineerProjects/nexus-engine/pkg/types"
    "github.com/EngineerProjects/nexus-engine/pkg/rag"
    "github.com/EngineerProjects/nexus-engine/pkg/storage"
    // ...
)
```

The `internal/query/runtime.go` file (`SDKRuntime`) is the main adapter. It wraps `sdk.Client` to implement `QueryRuntime`, `StreamingQueryRuntime`, `SessionManager`, and related interfaces.

---

## Adding a new domain

See [AGENTS.md](../AGENTS.md#adding-a-new-feature-domain) for the step-by-step guide.

Pattern summary:
1. `internal/<domain>/types.go` + `service.go` — business logic
2. `internal/app.go` — wire `Dependencies` + `App` + `NewApp`
3. `internal/api/bootstrap.go` — store initialization
4. `internal/api/<domain>.go` — HTTP handlers
5. `internal/api/routes.go` — route registration
