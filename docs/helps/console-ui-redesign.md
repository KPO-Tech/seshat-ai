# seshat-console UI redesign — tracking doc

Started 2026-09-03. The goal: bring `seshat-console` (the web admin app) to the
same visual density, palette, and component patterns as `seshat-ui`'s Admin
Console (the desktop app's own admin surface), page by page, deliberately —
not a single big rewrite. This file is the running checklist so a session
picks up where the last one left off instead of re-deriving state from
scratch.

**Design-system source of truth**: `seshat-ui/src/renderer/styles/tokens.css`.
seshat-console's `src/theme/tokens.ts` `palette` object is value-for-value
matched to that file's `[data-theme='light']` block — when the two drift,
tokens.css wins and console should be brought back in line, not the reverse.

## Foundation (app-wide)

- [x] **Light theme** (2026-09-03) — `theme/tokens.ts`'s `palette` rewritten
  to seshat-ui's light tokens; antd `algorithm: theme.defaultAlgorithm`;
  `index.css` swept for every hardcoded dark hex/rgba (canvas, surface,
  border, text, and the "white haze on dark" `rgba(255,255,255,*)` /
  `rgba(245,242,236,*)` overlay families, all inverted to
  `rgba(30,28,26,*)` dark-tint-on-light equivalents). Brand orange
  (`#ef7c2f`) and the saturated status colors (success/warning/danger
  dots and small icons) kept as-is — they read fine on either theme and
  match seshat-ui's own choice to keep small status accents vivid
  regardless of theme.
- [x] **Sidebar density** (2026-09-03) — nav item height 56px → 32px,
  padding 24px → 12px, sider width 264 → 244, matching seshat-ui's Admin
  Console rail (`admin-nav-item`: 30px/8px). `<Sider>`/`<Menu>` switched
  from `theme="dark"` to `theme="light"`; `.ant-menu-dark` CSS selectors
  renamed to `.ant-menu-light`.
- [x] **Brand header + back button** (2026-09-03) — brand mark simplified
  (flat `palette.accent` square, no gradient/shadow, 26px). The
  "Back to Organizations"/"Back to Platform" full-width text button
  replaced with a discrete `HomeOutlined` icon button, same position, same
  gating (`isAdmin && inOrganizationRoute` — a platform superadmin only;
  a regular org member/admin has nowhere else to go, so they never see it).
- [ ] **Sidebar nav structure** (labels, grouping, route names) —
  deliberately NOT touched this round per explicit instruction. A
  separate, later pass.
- [ ] Font-size/control-height already matched to seshat-ui in an earlier
  pass (13px base, 30px controls) — done before this doc existed, listed
  here for completeness.

## Per-page redesign (pv-* catalog-card pattern)

Pages that are a "fixed catalog of kinds, each configured or not" get the
`pv-list`/`pv-card` grid pattern ported from seshat-ui's
`AdminConnectorsView.tsx`/`AdminProvidersView.tsx` (CSS in
`index.css`, `/* Provider/Connector catalog cards */` section). Pages that
list open-ended, per-instance records (multiple rows per kind, each with
its own state) stay as tables — the pattern doesn't fit those.

| Page | Route | Status | Notes |
|---|---|---|---|
| Knowledge → Connectors (OAuth apps) | `/orgs/:id/knowledge/connectors` | Done | Moved out of a 480px modal onto the page as `pv-list`; kind list narrowed 20 → 4 (only the knowledge_sync-capable ones: gdrive/sharepoint/onedrive/confluence — the other 16 are agent_action-only, self-service-connected from Workspace, had no business here). Monochrome icons (no brand tint), matching seshat-ui's version. |
| Knowledge → Connectors (connected sources table) | same route | Not started | Stays a table on purpose — real per-instance data (corpus, sync status, last synced, sync history), not a fixed kind catalog. |
| AI Config → Provider Settings | `/orgs/:id/ai/provider-settings` | Done | Same `pv-list`/`pv-card` grid chrome. Kept the existing colored `ProviderIcon` set (OpenAI green, Anthropic orange, ...) rather than flattening to monochrome — deliberate exception, those are an already-considered brand-icon set, unlike the connector glyphs the pv-* pattern was built around. Expand-for-details (default model/base URL) preserved via `.pv-card.expanded { grid-column: 1 / -1 }`. |
| Workspace → Connections (self-service, per-employee) | `/orgs/:id/workspace/connections` | Done (own pattern) | NOT the pv-* pattern — this one already has its own `wsc-*` card grid (2026-09-03, pre-dates this doc), grouped by category, WITH colored brand icons (deliberately kept, per-service recognizability matters more here than in an admin catalog). |
| Team & Access (memberships/teams/invitations/roles/policies) | `/orgs/:id/team/*` | Not started | Currently `ConsoleTable`-based (per the screenshot that kicked off this conversation). Real per-instance data (a member row, a team row) — likely stays a table, not a candidate for pv-*, but worth a density/light-mode pass. |
| Everything else (Automation, Prospecting, Integrations, Activity, Overview, ...) | various | Not started | Not yet reviewed individually. |

## How to pick up this work in a new session

1. Read this file first.
2. Pick the next `Not started` row.
3. Check whether it's a fixed-catalog page (→ pv-* grid) or a per-instance
   list (→ table, just needs a light-mode/density check, not a pattern
   change).
4. `npx oxlint src` + `npm run build` after every meaningful chunk — this
   repo's pre-commit hook already enforces this on commit, but catching it
   before then is faster.
5. Update this table before ending the session.
