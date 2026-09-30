# Frontend Strategy

This note records the current frontend direction for SeshatOS.

## Decision

Keep the current `seshat-desktop` application as an Electron + React + TypeScript app.

Do not start a broad React-to-Svelte rewrite while the backend, document reading, connectors, knowledge, and platform boundaries are still moving. The existing desktop already carries the main chat, right panels, document previews, settings, plugins, admin views, IPC, and sidecar integration. Rewriting it now would cost focus without solving the heaviest parts of the product.

Use Svelte as a preferred option for new, future product surfaces when they are created from scratch, especially:

- Knowledge
- Inbox
- dedicated platform dashboards
- focused internal tools
- future product modules that do not need to live inside the existing React renderer

This gives SeshatOS a gradual path: the existing desktop can keep moving, while new surfaces can prove a lighter UI model without forcing a large migration.

## Boundary

Future Svelte apps should not depend on React renderer internals.

The stable boundary should be:

- `seshat-backend` / `seshat-server` APIs
- shared HTTP/SSE contracts
- shared TypeScript types when useful
- shared design tokens and UX conventions
- framework-local components for each app

In practice:

```text
seshat-backend / seshat-server
        ^
        |
React desktop today     Svelte knowledge     Svelte inbox     Svelte future apps
```

The backend owns product state, auth, connectors, document reading policy, knowledge ingestion, and platform responsibilities. Frontends should stay replaceable clients over those contracts.

## Migration Rule

Migrate existing React desktop areas to Svelte only when there is a concrete reason:

- the area is being rebuilt anyway
- the code is isolated enough to replace cleanly
- Svelte reduces real complexity for that surface
- the API boundary is already stable

Avoid migration for its own sake. The goal is a clearer product architecture, not a framework trophy.

