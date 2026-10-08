# Technology Choices

This document records the default technology choices for the MVP.

## Desktop Frontend

Use:

- Electron
- React
- TypeScript
- Vite / electron-vite
- Tailwind CSS
- existing design tokens exposed through CSS variables
- icon-park icons where already used
- lucide icons only if the local app standard moves to lucide later

Do not use:

- UnoCSS
- two CSS utility stacks at the same time
- new component libraries unless there is a strong reason
- broad CSS rewrites during feature work

Tailwind CSS is the official styling system for the renderer.

Plain CSS is allowed only for:

- global design tokens
- resets
- third-party generated DOM overrides
- keyframes
- browser/viewer internals that cannot be reached through JSX

## Frontend Direction

The UI should be dense, calm and operational.

Seshat is not a landing page. It is a desktop workspace for repeated work:

- clear navigation
- strong scanning
- stable panels
- predictable controls
- good empty/loading/error states
- fast access to tools and sources

## Backend / Runtime

Keep Go as the main backend/runtime language.

Do not rewrite Seshat in Python.

Use Go for:

- runtime
- sessions
- tools
- permissions
- sandbox
- providers
- Knowledge orchestration
- embedded local profile
- server product backend

Python is allowed for Python-native capabilities only, especially:

- Docling
- OCR/layout extraction when needed
- optional local sidecars

Python should be a capability boundary, not the main architecture.

## Data / Storage

Use profile-based storage:

Embedded:

- SQLite
- local filesystem
- embedded/local vector store
- in-process scheduler
- fake or local providers for tests

Development:

- Postgres when testing enterprise behavior
- OpenSearch only for integration/performance checks
- local filesystem artifacts
- optional local Docling

Production:

- Postgres
- OpenSearch or equivalent production vector/search backend
- S3-compatible artifact storage
- remote Docling workers when needed
- distributed scheduling if required
- observability with OpenTelemetry-compatible metrics/traces

## Testing

Default tests should require zero external infrastructure.

Use:

- fake provider for agent loop tests
- deterministic test embedder for Knowledge pipeline tests
- SQLite/local stores for normal integration tests
- httptest/fake services for remote boundaries

External dependencies belong in explicit integration suites:

- Postgres
- OpenSearch
- Docling
- real LLM providers
- real connectors

## Product Architecture

Use this separation (details in `repository_boundaries.md`):

- `seshat`: reusable runtime and generic capabilities (mechanism).
- `SeshatOS`: what a person does on their own machine.
- `SeshatCloud`: what an organization needs shared, governed and unattended (policy and tenancy).
- `seshat-ai`: the company, no product code.

Mechanism belongs in `seshat`. Policy belongs in the product that applies it.

Examples:

- Google Drive sync mechanism: `seshat`
- OAuth credential storage policy: `SeshatCloud`
- S3 traversal mechanism: `seshat`
- organization ownership and ACL mapping: `SeshatCloud`
- tool execution runtime: `seshat`
- workspace chat permissions: `SeshatCloud`

