# Contributing to SeshatOS

This is a private repository. Contributions are by invitation only.

SeshatOS (`seshat-ai`) is the product layer built on the Seshat Go runtime: a self-hosted AI platform and desktop app for teams with a REST API, multi-user auth, knowledge bases, scheduled automation, agent workspaces, and operational governance. This repository is where invited contributors work on the application backend, desktop experience, team workflows, and production surfaces around the runtime.

---

## Contribution areas

- **Backend API** — REST endpoints, SSE streaming, app wiring, service boundaries, and API contracts for clients and SDKs.
- **Desktop app** — Electron, React UI flows, workspace ergonomics, settings, operator tooling, and team productivity surfaces.
- **Knowledge and automation** — RAG pipelines, document ingestion, scheduled tasks, workflow automation, and app-level memory features.
- **Auth and governance** — sessions, roles, permissions, organizations, admin controls, and enterprise-readiness concerns.
- **Docs and onboarding** — product docs, developer docs, deployment guides, API usage examples, and contribution clarity.

---

## Branching strategy

```
main          production-ready, tagged releases only
  └── dev     stable integration branch — CI-gated, PR only
        └── staging   accumulation branch — direct push/merge, no PR, no CI
              └── <type>/<slug>   your working branch, one per issue
```

- Branch off `staging`, not `dev` or `main`.
- `staging` exists specifically to avoid burning this private repo's limited monthly
  GitHub Actions minutes: per `.github/workflows/ci.yml`, CI only triggers on a
  `pull_request` targeting `main`/`dev`, or a direct push to `main` — pushing to
  `staging` (or any topic branch) never runs CI. Merge topic branches into `staging`
  directly, no PR needed, and batch up work there.
- Never commit or push directly to `main`.
- Never commit or push directly to `dev`.
- `staging` → `dev` happens via **one PR covering everything accumulated since the
  last sync** (this is the point CI actually runs — batch it, don't open a PR per
  topic branch). `dev` → `main` remains its own PR at milestone boundaries.
- Name your branch `<type>/<short-slug>` where `<type>` is one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, or `ci`.
- Open PRs **targeting `dev`**. The only allowed PR into `main` is `dev` → `main` at milestone boundaries.
- Direct PRs from topic branches into `main` will be closed without merge.
- The **Gate CI check** must be green before any PR can be merged (Build + Test + Lint all pass).

---

## Before you open a PR

- **Bug fix** — confirm the bug is reproducible; include a failing test case in the PR if possible.
- **New feature** — align with the [product roadmap](./docs/product/roadmap.md) before writing code.
- **Refactor** — discuss first. We are conservative about structural changes.
- **Documentation** — PRs are welcome without prior discussion.

---

## Development setup

### Requirements

- Go 1.26+
- Node.js 22+ (for desktop, console, and website builds)
- `golangci-lint` for linting
- SQLite3 (for local dev; PostgreSQL is optional)

### Clone and build

```bash
git clone <this-repo>
cd seshat-ai

# Build the local backend API server
cd seshat-backend && go build -o bin/seshat-api ./cmd/api
cd ..

# Run tests
go test ./seshat-backend/... ./seshat-server/...
go test -race ./seshat-backend/... ./seshat-server/...
```

### Environment

```bash
export SESHAT_ADMIN_EMAIL=admin@example.com
export SESHAT_ADMIN_PASSWORD=changeme
export ANTHROPIC_API_KEY=sk-ant-...   # or any supported provider key
```

Then run:

```bash
./seshat-backend/bin/seshat-api
# Server on http://localhost:8090
```

See [`docs/development.md`](./docs/development.md) for the full variable reference.

---

## Code conventions

### Adding a new domain

Every feature domain follows the same three-layer pattern:

```
seshat-backend/internal/<domain>/          ← business logic (no HTTP, no DB layer)
seshat-backend/internal/api/<domain>.go    ← HTTP handlers (thin, delegates to service)
seshat-backend/internal/db/<domain>.go     ← data access (store + models)
```

Wire the new service in `seshat-backend/internal/app.go` (`Dependencies` + `App` + `NewApp`), add the store initialization in `seshat-backend/internal/api/bootstrap.go`, and register routes in `seshat-backend/internal/api/routes.go`.

Full walkthrough in [AGENTS.md](./AGENTS.md#adding-a-new-feature-domain).

### Error handling

Use `bkerr` in services. Handlers call `writeBackendError` — HTTP status mapping is automatic.

```go
// Service
return nil, bkerr.NotFound("thing not found", err)

// Handler
if err != nil { writeBackendError(w, err); return }
```

### Go style

- Format with `gofmt` — enforced by CI.
- Follow `go vet` — enforced by CI.
- No `interface{}` — use `any`.
- `context.Context` as first parameter on any function that may do I/O.
- Pointer receivers on types that contain `sync.Mutex`.

### seshat dependency

`seshat` is consumed as an external Go module (`github.com/KPO-Tech/seshat`), not vendored in this repo. Never patch it via `replace` directives here. If you need something from the engine that isn't yet in `pkg/`, open a PR on the seshat repo first, then bump the version with `go get github.com/KPO-Tech/seshat@vX.Y.Z` in `seshat-server/go.mod` and `seshat-backend/go.mod`.

---

## Commit messages

```
<type>(<scope>): <short description>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

Examples:
```
feat(memories): add long-term extraction opt-out per user
fix(auth): invalidate sessions on password change
docs(api): document SSE framing contract in query_sse.go
```

---

## Testing

- Run `go test -race ./seshat-backend/... ./seshat-server/...` before submitting.
- Tests must not make real API calls to external providers.
- New services should have at least one test.
- Table-driven tests preferred for cases with multiple inputs.

---

## Pull request checklist

Before pushing, run locally:

```bash
go build ./seshat-backend/... ./seshat-server/...
go test -race ./seshat-backend/... ./seshat-server/...
gofmt -w .
go vet ./seshat-backend/... ./seshat-server/...
```

PR checklist:

- [ ] Tests pass (`go test -race ./seshat-backend/... ./seshat-server/...`)
- [ ] New behavior is covered by at least one test
- [ ] Public API changes are reflected in `README.md` or `docs/`
- [ ] Commit messages follow Conventional Commits
- [ ] PR targets `dev`, not `main`
- [ ] No local `replace` directive added for `github.com/KPO-Tech/seshat`

---

## What we will not merge

- Features that push business logic into `internal/api/` handlers.
- Direct store access from handlers (always use a service).
- Local `replace` directives pointing `github.com/KPO-Tech/seshat` at a filesystem copy.
- Changes that remove or weaken authentication/authorization checks.
- Code that uses `//nolint` without an explanation comment.
- New global mutable state.
