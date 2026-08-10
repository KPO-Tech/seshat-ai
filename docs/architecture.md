# Architecture — SeshatOS

This document describes the current repository layout and the package boundaries between the local product backend, the cloud control plane, and the open-source runtime.

---

## Repository shape

```
seshat-ai/
├── seshat-backend/   ← local backend / desktop HTTP API
├── seshat-server/    ← cloud control plane (IAM, orgs, automation, knowledge, ...)
└── seshat-ui/        ← Electron desktop client
```

`seshat` — the open-source Go runtime — is not part of this repository. It is consumed as an
external module, `github.com/KPO-Tech/seshat`, declared directly in `seshat-backend/go.mod`
and `seshat-server/go.mod`.

The dependency direction is intentionally one-way:

```text
seshat-ui        → seshat-backend   (HTTP only)
seshat-backend   → seshat           (pkg/* only)
seshat-server    → seshat           (pkg/* only)
seshat           → seshat-backend   (never)
seshat           → seshat-server    (never)
```

`seshat-server` does not import `seshat-backend` — confirmed 2026-08-10 (zero
occurrences of the module path in `seshat-server/go.mod` or any import). The
two product backends are independent Go modules that both depend on `seshat`,
not on each other; see "Cloud server bootstrap" below for why an earlier
version of this document described a temporary shared-package dependency
that no longer reflects the code.

`go.work` at the repository root ties the two local Go modules together during local development:

```go
use (
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

**This section was stale until 2026-08-10** — it previously described
`seshat-server` as an early bootstrap with only `api/`/`app/`/`config/` and a
"target role" still to be built. The code has moved well past that; see
`helps/audit-2026-08-10.md` (local/cloud boundary section) for the audit that
caught the drift, and `ROADMAP.md` ("Direction: seshat-server becomes the
multi-tenant backbone") for the up-to-date migration status, which is the
document to check first when this section next goes stale.

`seshat-server/` is a real, independently mature control plane, not a
bootstrap:

```
seshat-server/
├── cmd/server/                  ← server entrypoint
└── internal/server/
    ├── api/                     ← HTTP handlers
    ├── app/                     ← server dependency container
    ├── config/                  ← bootstrap and wiring
    ├── iam/                     ← orgs, users, memberships, roles, policy bindings, audit (mature, heavily tested)
    ├── automation/               ← devices, scheduled jobs, runs (mature, heavily tested)
    ├── knowledge/                 ← org-scoped RAG/corpus domain, mirrors seshat-backend's knowledge
    ├── agentregistry/             ← shared agent preset catalog
    ├── mcpregistry/                ← shared MCP server catalog
    ├── skillregistry/              ← shared skill repo catalog
    ├── memories/                   ← flat memory list (connected-mode counterpart to local memories)
    ├── longtermmemory/              ← graph memory (connected-mode counterpart to local long-term store)
    ├── preferences/                 ← connected-mode user preferences
    ├── quotas/                      ← usage counters (counting only, no enforcement)
    ├── websearchsettings/            ← org/platform web search provider config
    ├── workspacechat/                ← console's own live chat playground (sdk.Session directly, not job-based)
    ├── mailer/                       ← SMTP sender (self-service registration emails)
    └── apperr/                       ← typed server errors
```

Current role — already built, not aspirational:
- Full cloud IAM: organizations, memberships, invitations, groups, dynamic
  custom roles, policy bindings, audit trail, superadmin
- Automation: device pairing, scheduled jobs, runs, single-instance scheduler
- Org-scoped knowledge/RAG, hybrid BYOK/platform-default provider and
  embedder settings
- Shared catalogs (agents/MCP/skills) that `seshat-backend`'s `cloud*`
  adapters consume read-only, enrichment-only, in connected mode
- Self-service registration by email domain

Known-thin areas (built and wired, but with minimal test coverage — see the
LOC/test-file breakdown in `helps/audit-2026-08-10.md`): `websearchsettings`,
`mcpregistry`, `agentregistry`, `preferences`, `skillregistry`,
`longtermmemory`, `quotas` (each has real handlers but only one test file);
`workspacechat` has no dedicated test file at all despite reusing
`sdk.Client`/`sdk.Session` directly.

Explicitly deferred, not started: **interactive sessions** (multi-turn,
streamed, persistent chat through `seshat-server` itself, as opposed to
one-shot scheduled jobs) — see ROADMAP.md for why this is scoped separately
rather than an extension of `automation`.

The important rule is still architectural, not just physical: `seshat-server`
must not become a second copy of the local runtime backend. It should own
cloud coordination concerns. In practice this holds today — e.g. inbox
thread/message bodies stay exclusively in `seshat-backend` (see "Example:
Inbox" below), and `seshat-server` never stores them.

### Example: Inbox

The inbox connectors (Gmail, WhatsApp) are a concrete instance of this split.

`seshat-backend` owns all of it today: the `Connector` interface, `inbox.Service`,
the connector implementations, encrypted account tokens, threads/messages, the
agent tools, and the Inbox Agent. This runs per local install regardless of mode.

`seshat-server` owns nothing here yet. Two extensions are anticipated once a real
multi-user/multi-device organization needs them, not before:

- Org-level OAuth app credentials (an admin registers one Google Workspace client
  for the whole org), mirroring the SSO `provider_config.go` pattern already used
  for OIDC/SAML.
- Multi-tenant sync orchestration through `cloudautomation`, replacing the
  local-only ticker (`runGmailSyncLoop`) that exists solely because
  `cloudautomation` is connected-mode-only.

`seshat-server` must never store thread or message bodies itself — that would be
the "second copy of the local runtime backend" the rule above forbids.

---

## Runtime boundary

Both product backends depend on the public `seshat/pkg/*` surface only.

Allowed examples:

```go
import (
    "github.com/KPO-Tech/seshat/pkg/config"
    "github.com/KPO-Tech/seshat/pkg/rag"
    "github.com/KPO-Tech/seshat/pkg/sdk"
    "github.com/KPO-Tech/seshat/pkg/storage"
    "github.com/KPO-Tech/seshat/pkg/types"
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
go build ./seshat-backend/... ./seshat-server/...
go test ./seshat-backend/... ./seshat-server/...
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
