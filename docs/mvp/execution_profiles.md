# Execution Profiles

Seshat should support three execution profiles.

## Embedded

Target:

- desktop app
- local development
- offline-friendly usage
- zero required external infrastructure

Default choices:

- database: SQLite
- vector/search: embedded local store
- artifacts: local filesystem
- scheduler: in-process
- providers: fake/local/cloud optional
- embedder: deterministic test/local/cloud optional
- reranker: no-op/local/cloud optional
- Docling: disabled or local subprocess on demand
- web search: optional

This profile should be enough for:

- Main Chat
- local sessions
- files
- attachments
- basic Knowledge
- tools
- local testing

## Development

Target:

- integration checks
- enterprise-like local tests
- Docker Compose when necessary

Choices:

- database: Postgres
- vector/search: OpenSearch or equivalent
- artifacts: local filesystem
- Docling: local service or subprocess
- providers: fake by default, real only for smoke tests

This profile should not be required for everyday UI work.

## Production

Target:

- team/enterprise deployment
- multi-tenant reliability
- scale and observability

Choices:

- database: Postgres
- vector/search: OpenSearch or managed equivalent
- artifacts: S3-compatible storage
- scheduler: durable/distributed when needed
- Docling: remote workers
- observability: metrics/traces/logs
- strict IAM and audit

## Testing Rule

Default tests must not require production infrastructure.

Every remote dependency should have at least one of:

- embedded implementation
- local implementation
- fake implementation for tests

