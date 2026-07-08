# seshat-console

Web admin/ops frontend for `seshat-server` (the cloud control plane). Separate from `seshat-ui` (the desktop app, which never talks to `seshat-server` directly — only `seshat-backend` does).

See `../docs/casdoor-frontend-mapping.md` for the reasoning behind the screen-by-screen build order and stack choice.

## Stack

- Vite + React + TypeScript
- antd (function components, current version — not related to Casdoor's copy of antd)
- `openapi-fetch` + `openapi-typescript`: the API client is fully typed, generated directly from `seshat-server/openapi.yaml`
- TanStack Query for server state/caching
- zustand for the auth token/session store
- antd's native `Form` (rules-based validation) rather than a separate form library — it already owns form state and integrates directly with `Form.Item` error rendering

## Getting started

```bash
npm install
npm run dev
```

The dev server proxies `/api/*` to `http://localhost:8081` (see `vite.config.ts`), so run `seshat-server` locally alongside it — no CORS configuration needed for local dev.

## Regenerating the API client types

Whenever `seshat-server/openapi.yaml` changes:

```bash
npm run api:generate
```

This regenerates `src/api/schema.d.ts`. Do not hand-edit that file.

## Auth

Bearer token only (no cookies) — matches `seshat-server`'s auth model. The token is stored in `localStorage` (see `src/store/auth.ts`) and attached to every request by `src/api/client.ts`. A 401 response clears the local session and the app falls back to the login screen.

On first run against a fresh `seshat-server` (no users yet), the app redirects to `/bootstrap` to create the first platform admin + organization; afterwards `/bootstrap` redirects away (the server itself only allows this once).

## Adding a new domain screen

Follow the `organizations` slice as the reference (`src/api/organizations.ts` + `src/pages/organizations/OrganizationsPage.tsx`):

1. Add the domain's `ListParams`/CRUD hooks in `src/api/<domain>.ts`, built on the generated `paths`/`components` types.
2. Add the list/detail page(s) under `src/pages/<domain>/`.
3. Wire it into `builtPages` in `src/routes/router.tsx` (replaces the placeholder for that nav item — nav ordering/grouping lives in `src/layout/nav.ts`).
