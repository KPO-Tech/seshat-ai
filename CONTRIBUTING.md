# Contributing to SeshatOS

This is a private repository. Contributions are by invitation only.

---

## Branching strategy

```
main          production-ready, tagged releases only
  └── dev     stable integration branch — all feature work lands here first
        └── <type>/<slug>   your working branch, one per issue
```

- Branch off `dev`, not `main`.
- Never commit or push directly to `main`.
- Never commit or push directly to `dev`.
- All work must flow through PRs: `<type>/*` → `dev`, then `dev` → `main`.
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

- Go 1.25+
- `golangci-lint` for linting
- SQLite3 (for local dev; PostgreSQL is optional)

### Clone and build

```bash
git clone --recurse-submodules <this-repo>
cd seshat-ai

# Build the API server
go build -o bin/seshat-api ./cmd/api

# Run tests
go test ./...
go test -race ./...
```

### Environment

```bash
export SESHAT_ADMIN_EMAIL=admin@example.com
export SESHAT_ADMIN_PASSWORD=changeme
export ANTHROPIC_API_KEY=sk-ant-...   # or any supported provider key
```

Then run:

```bash
./bin/seshat-api
# Server on http://localhost:8090
```

See [`docs/development.md`](./docs/development.md) for the full variable reference.

---

## Code conventions

### Adding a new domain

Every feature domain follows the same three-layer pattern:

```
internal/<domain>/          ← business logic (no HTTP, no DB layer)
internal/api/<domain>.go    ← HTTP handlers (thin, delegates to service)
internal/db/<domain>.go     ← data access (store + models)
```

Wire the new service in `internal/app.go` (`Dependencies` + `App` + `NewApp`), add the store initialization in `internal/api/bootstrap.go`, and register routes in `internal/api/routes.go`.

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

### seshat submodule

Never modify files inside `seshat/`. It is an independent open-source repository. If you need something from the engine that isn't yet in `pkg/`, open a PR on seshat first.

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

- Run `go test -race ./...` before submitting.
- Tests must not make real API calls to external providers.
- New services should have at least one test.
- Table-driven tests preferred for cases with multiple inputs.

---

## Pull request checklist

Before pushing, run locally:

```bash
go build ./...
go test -race ./...
gofmt -w .
go vet ./...
```

PR checklist:

- [ ] Tests pass (`go test -race ./...`)
- [ ] New behavior is covered by at least one test
- [ ] Public API changes are reflected in `README.md` or `docs/`
- [ ] Commit messages follow Conventional Commits
- [ ] PR targets `dev`, not `main`
- [ ] seshat was not modified

---

## What we will not merge

- Features that push business logic into `internal/api/` handlers.
- Direct store access from handlers (always use a service).
- Any modification to `seshat/`.
- Changes that remove or weaken authentication/authorization checks.
- Code that uses `//nolint` without an explanation comment.
- New global mutable state.
