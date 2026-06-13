# Nexus AI

> Production-ready AI platform with a desktop UI, REST API, multi-user auth, sessions, memory, RAG, scheduled tasks, and MCP — built on [nexus-engine](https://github.com/EngineerProjects/nexus-engine).

![Go](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-37-47848F?logo=electron&logoColor=white)
![License](https://img.shields.io/badge/License-AGPL--3.0-blue)

---

## What is Nexus AI?

**nexus-engine** is the open-source Go runtime for multi-turn AI agents (tools, permissions, sessions, RAG, MCP). **Nexus AI** is the production layer on top: a multi-user backend with a full REST API and a desktop application.

```
┌─────────────────────────────────┐
│  nexus-ui  (Electron + React)   │  Desktop app
└────────────┬────────────────────┘
             │ HTTP + SSE
┌────────────▼────────────────────┐
│  cmd/api  →  internal/api       │  REST API (auth, sessions, SSE streaming)
│  internal/<domain>/             │  Auth · Memory · Plans · Skills · RAG
│  internal/db/                   │  SQLite / PostgreSQL via GORM
└────────────┬────────────────────┘
             │ Go SDK
┌────────────▼────────────────────┐
│  nexus-engine  (submodule)      │  Agent runtime, tools, providers, MCP
└─────────────────────────────────┘
```

---

## Features

- **Multi-user auth** — email/password, API keys, roles, organizations, workspaces
- **Streaming chat** — SSE-based streaming with per-turn tool events
- **Session management** — persistent sessions with ownership and workspace isolation
- **Memory** — user-defined memories injected into every session context
- **Plans** — structured multi-step plans attached to sessions
- **Skills** — slash-command shortcuts that resolve to prompt expansions
- **Knowledge / RAG** — hybrid BM25 + vector search over document corpora
- **MCP servers** — per-user MCP server config stored in DB, resolved at runtime
- **Scheduled tasks** — cron-based background agent runs
- **Web search** — pluggable backend (Tavily, Exa, Jina, SearXNG)
- **File attachments** — images and documents injected as context
- **Audit log** — append-only log of all queries
- **Desktop app** — Electron + React UI with tool views, plan editor, settings hub

---

## Repository structure

```
nexus-ai/
  cmd/api/            REST API entrypoint
  internal/
    api/              HTTP handlers, SSE, routes
    auth/             Identity, sessions, API keys, RBAC
    db/               GORM stores, migrations (SQLite + PostgreSQL)
    query/            Query orchestration (provider, memory, RAG, skills)
    agents/           DB-stored agent definitions
    memories/         User memory CRUD + context injection
    plans/            Plan management
    skills/           Skill registry + prompt resolution
    knowledge/        RAG ingestion and search
    mcp/              MCP server config store
    scheduler/        Cron job engine
    settings/         Provider credentials + OAuth
    files/            File upload and storage
    websearch/        Web search abstraction
    preferences/      Per-user preferences and permission modes
    quotas/           Usage counters (daily/monthly)
    audit/            Audit log
  nexus-engine/       Submodule → github.com/EngineerProjects/nexus-engine
  nexus-skills/       Submodule → github.com/EngineerProjects/nexus-skills
  nexus-ui/           Electron desktop app (React + TypeScript)
  docs/               Architecture, development guide, UI docs
```

---

## Quick start

### Prerequisites

- Go 1.26+
- Node 22+ (for the desktop UI)
- Git with submodule support

### Clone

```bash
git clone --recurse-submodules https://github.com/EngineerProjects/nexus-ai.git
cd nexus-ai
```

### Configure

```bash
cp .env.example .env
# Edit .env — set at least one provider API key
```

### Run the backend

```bash
go run ./cmd/api
# API available at http://localhost:8090
```

### Run the desktop UI

```bash
make ui-install     # install npm deps
make ui-dev         # Electron in dev mode
```

Or start everything at once:

```bash
make dev
```

---

## Configuration

All config is via environment variables. See [`.env.example`](.env.example) for the full reference.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8090` | HTTP listen port |
| `NEXUS_DB_DRIVER` | `sqlite` | `sqlite` or `postgres` |
| `NEXUS_DB_DSN` | `nexus.db` | Database connection string |
| `NEXUS_ADMIN_EMAIL` | — | Bootstrap admin email (first run) |
| `NEXUS_ADMIN_PASSWORD` | — | Bootstrap admin password (first run) |
| `ANTHROPIC_API_KEY` | — | Anthropic provider |
| `OPENAI_API_KEY` | — | OpenAI provider |
| `WEB_SEARCH_PROVIDER` | `auto` | `tavily`, `exa`, `jina`, `searxng`, `auto` |

---

## Development

```bash
make test           # go test -race ./...
make vet            # go vet ./...
make lint           # golangci-lint
make tidy           # go mod tidy
```

Full development guide: [`docs/development.md`](docs/development.md)  
Architecture overview: [`docs/architecture.md`](docs/architecture.md)

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). PRs target `dev`, never directly `main`.

---

## License

Nexus AI is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0).

The underlying runtime, [nexus-engine](https://github.com/EngineerProjects/nexus-engine), is Apache 2.0.

See [`LICENSE`](LICENSE) for the full text.
