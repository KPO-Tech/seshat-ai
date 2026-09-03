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

**Connector-kind source of truth**: `shared/connector-catalog` (npm package
`@seshat/connector-catalog`, wired in via a `file:` dependency in both apps'
`package.json` - no workspace conversion needed). Kind lists, labels, and MCP
endpoint pre-fills all live there now, not hand-copied per file - see that
package's own doc comment. Consumed by seshat-console's `ConnectorsPage.tsx`/
`MCPServersPage.tsx`/`ConnectionsPage.tsx` and seshat-ui's
`AdminConnectorsView.tsx`/`AdminMCPServersView.tsx`. Icon *rendering* stays
local to each app (different icon libraries) - only add a new brand icon
mapping to the shared package if simple-icons gains an entry for a kind that
didn't have one before.

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
- [x] **Sidebar nav structure** (2026-09-03) — rebuilt from scratch, not
  just relabeled. Old shape mixed unrelated themes (Connectors nested
  under Knowledge, MCP Servers hidden as an "AI Config" sub-tab,
  Prospecting under Integrations). New groups (`nav.tsx`
  `organizationNavGroups`/`getOrganizationNavItems`):
  - **Organization**: Overview, Team & Access, Activity
  - **AI Core** (renamed from "AI & Knowledge" 2026-09-03, matching
    seshat-ui's Admin Console group of the same name): Providers (renamed
    from "AI Config" now that MCP Servers moved out), Knowledge, MCP
    Servers (own top-level route now, `/orgs/:id/mcp-servers`, was a hidden
    `ai/mcp-servers` sub-tab), Agents & Skills
  - **Automation**: its own single-item group (Devices/Desktop
    Policies/Hooks/Bundles/Jobs/Runs still live under it as secondary
    tabs) — matches seshat-ui's own precedent of a single-item group
    ("Your Account" → "My Usage"), rather than losing its label just
    because it's one primary nav entry
  - **Integrations**: Connectors (moved out of Knowledge, own top-level
    route now, `/orgs/:id/connectors` — file also moved,
    `pages/knowledge/ConnectorsPage.tsx` → `pages/connectors/
    ConnectorsPage.tsx`), Integrations (Applications/Identity
    Providers/SCIM/Network Diagnostics), Prospecting
  - **Preferences** stays the sole ungrouped plain item, after the groups

  The unifying idea for Integrations: every external system this org
  connects *with*, in either direction — Connectors/Identity
  Providers/SCIM pull the org's own data in or authenticate members
  against outside systems, Applications is the reverse (other systems
  authenticating against this org). Connectors moved out of Knowledge
  because syncing into a corpus is one *use* of a connected account, not
  what a connector fundamentally *is*.
- [x] Font-size/control-height already matched to seshat-ui in an earlier
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
| Connectors (OAuth apps) | `/orgs/:id/connectors` | Done | Moved out of a 480px modal onto the page as `pv-list`; kind list narrowed 20 → 4 (only the knowledge_sync-capable ones: gdrive/sharepoint/onedrive/confluence — the other 16 are agent_action-only, self-service-connected from Workspace, had no business here). Monochrome icons (no brand tint), matching seshat-ui's version. Nav location moved from under Knowledge to its own Integrations-group item 2026-09-03 (see Foundation section above). |
| Connectors (connected sources table) | same route | Reviewed, stays a table | Real per-instance data (corpus, sync status, last synced, sync history), not a fixed kind catalog - the pv-* pattern doesn't fit here on purpose. |
| AI Core → Providers | `/orgs/:id/ai/provider-settings` | Done | Same `pv-list`/`pv-card` grid chrome. Kept the existing colored `ProviderIcon` set (OpenAI green, Anthropic orange, ...) rather than flattening to monochrome — deliberate exception, those are an already-considered brand-icon set, unlike the connector glyphs the pv-* pattern was built around. Expand-for-details (default model/base URL) preserved via `.pv-card.expanded { grid-column: 1 / -1 }`. |
| Workspace → Connections (self-service, per-employee) | `/orgs/:id/workspace/connections` | Done (own pattern) | NOT the pv-* pattern — this one already has its own `wsc-*` card grid (2026-09-03, pre-dates this doc), grouped by category, WITH colored brand icons (deliberately kept, per-service recognizability matters more here than in an admin catalog). |
| Team & Access → Memberships | `/orgs/:id/team/memberships` | Done | Mirrors seshat-ui's Admin Console "Users" page: dropped the 4 redundant StatTile cards (Members/Teams/Pending Invites/Roles - the table below already shows all of it) and the "Organization access" Card wrapper, table goes straight under the page header. Avatar + name + email + an inline-editable `RoleSelect` right in the Role column (no more Edit-button-opens-a-drawer round trip) + a status pill (reusing the existing `.status-badge`/`.status-dot` classes) + Joined date + a delete icon. The edit-drawer's "change an existing member's role" branch is gone along with the Edit button - the drawer (`AddMemberDrawer`, renamed from `MembershipFormDrawer`) now only handles adding a new member. |
| Team & Access → Teams | `/orgs/:id/team/teams` | Done | Description shown as its own truncated+tooltip column (wasn't visible at all before) with a char-limited (200) counted `Input.TextArea` in the form. Slug now auto-follows Name while creating (slugified live) until the admin edits Slug directly themselves - never on an existing team, its slug may already be referenced elsewhere. |
| Team & Access → Invitations | `/orgs/:id/team/invitations` | Done | The All/Pending/Accepted/Revoked/Expired `Segmented` filter moved onto the same row as the "Invite" button (was stacked below with its own margin, reading as a big empty gap between the button and the table). |
| Team & Access → Roles | `/orgs/:id/team/roles` | Done | Same as Teams: description wasn't shown in the table at all, added the same truncated+tooltip column and a maxLength(200)+counter on the form's textarea. |
| Team & Access → Policies | `/orgs/:id/team/policies` | Done | Already showed its description inline under the name (no fix needed there) - only added the same maxLength(200)+counter to its form textarea, for consistency with Teams/Roles. |
| Organization → Overview | `/orgs/:id/overview` | Reviewed, left as-is (+ 1 fix) | A genuine multi-area dashboard (5 stat tiles, Needs Attention, Setup Status, Recent Activity, Recent runs) - not the redundant-stats-over-one-table anti-pattern, so its StatTile row stays. Did fix 4 leftover `rgba(255,255,255,0.02)` literals in the Setup Status card rows - missed by the original light-mode sweep because that search assumed spaced `rgba(255, 255, 255` and this file used the no-space form. |
| Organization → Activity → Audit | `/orgs/:id/activity/audit` | Reviewed, no changes needed | Already clean - no stat cards, no Card wrapper. |
| Organization → Activity → Chat Sessions | `/orgs/:id/activity/chat-sessions` | Reviewed | Table itself is clean. |
| Organizations (platform-level list) | `/platform/organizations` | Done | Same StatTile-redundancy fix as Memberships (Organizations/Default org/Inactive/Need details - all already visible per-row or via the pagination total). Card wrapper dropped too. |
| My Organizations (multi-org member landing page) | `/my-organizations` | Done | Same fix (Organizations/Owner of/Member of). |
| AI Core → Providers → Embedder | `/orgs/:id/ai/embedder` | Reviewed, no changes needed | Already clean expand/configure card, no redundant stats. |
| AI Core → Providers → Web Search | `/orgs/:id/ai/web-search` | Reviewed, no changes needed | Same pattern as Provider Settings/Embedder, already clean. |
| AI Core → Knowledge → Corpora | `/orgs/:id/knowledge/corpora` | Reviewed, no changes needed | Card grid + search/sort, already clean. |
| AI Core → MCP Servers | `/orgs/:id/mcp-servers` | Done (`f59c790`, `6b98456`, `3db7bed`) | Removed Stripe/Trello/Airtable from the "Bridged account" picker after finding `injectConnectorToken` was OAuth-only and silently never injected their header (`f59c790`) - then found that was too narrow a fix: those three have a real official MCP server, just static-key-authenticated instead of OAuth. Added a proper `StaticSecretResolver` fallback to `mcpregistry.Service` (seshat-server) and re-added all three to both consoles' dropdowns, now genuinely working (`6b98456`). Also dropped the redundant title/info-banner duplicating the breadcrumb and each other (`1c28b86`), and aligned the two consoles' kind lists against the actual vendor research in `roadmap.md`'s MCP Server Ledger (added OneDrive/Sheets/Calendar, removed a real Zendesk bug from seshat-ui - `3db7bed`). |
| AI Core → Agents & Skills → Agent Presets | `/orgs/:id/catalog/agent-presets` | Reviewed, no changes needed | Table + form already clean, cross-references MCP Servers correctly via the `mcp_servers` field. |
| AI Core → Agents & Skills → Skill Repos | `/orgs/:id/catalog/skill-repos` | Reviewed, no changes needed | Already clean, inherited-vs-own distinction already shown. |
| Automation → Devices | `/orgs/:id/automation/devices` | Reviewed, no changes needed | Already clean; one-time device token display already handled correctly (shown once, in its own drawer). |
| Automation → Desktop Policies | `/orgs/:id/automation/desktop-policies` | Reviewed, no changes needed | Catalog card + bindings table already clean. |
| Automation → Hooks | `/orgs/:id/automation/hooks` | Reviewed, no changes needed | Already explains the desktop-approval requirement inline via its own Alert. |
| Automation → Bundles | `/orgs/:id/automation/bundles` | Reviewed, no changes needed | Export/import tabs already clean, per-item created/failed result already shown on import. |
| Automation → Jobs | `/orgs/:id/automation/jobs` | Reviewed, no changes needed | Trigger/execution-target conditional fields already handled correctly, including the stale-field-on-switch fix already in place. |
| Automation → Runs | `/orgs/:id/automation/runs` | Reviewed, no changes needed | Already clean, filter + cancel + detail drawer. |
| Integrations → Connectors | `/orgs/:id/connectors` | Done | First pass removed dead code (an unreachable `kind === 'zendesk'` subdomain field, since the OAuth apps section only had 4 kinds at the time). Second pass, user-prompted ("est-ce que ce sont tous les connecteurs qu'on a"): the OAuth apps section itself only listed 4 of the 20 real OAuth kinds - registering an app for any of the other 16 (Slack, Notion, Jira, Salesforce, ...) had no path in seshat-console at all, only via seshat-ui's Admin Console or the API directly. Widened to all 20 (matching seshat-ui's AdminConnectorsView.tsx exactly - same labels/icons), switched from vendor-grouped labels ("Google") to per-kind labels ("Google Drive") since ConnectorOAuthApp is keyed by kind not vendor, and the Zendesk subdomain field is genuinely reachable again. The Connected sources table stays 4-kind-only on purpose - knowledge_sync is a hard capability limit, not a display choice. |
| Integrations → Integrations → Applications | `/orgs/:id/integrations/applications` | Reviewed, no changes needed | Already clean. |
| Integrations → Integrations → Identity Providers | `/orgs/:id/integrations/providers` | Reviewed, no changes needed | Already clean, Health badge already distinguishes "enabled" from "actually works." |
| Integrations → Integrations → SCIM Provisioning | `/orgs/:id/integrations/scim` | Reviewed, no changes needed | Already clean, one-time token display already handled correctly. |
| Integrations → Integrations → Network Diagnostics | `/orgs/:id/integrations/network-diagnostics` | Reviewed, no changes needed | Already clean. |
| Integrations → Prospecting → Sweeps | `/orgs/:id/prospecting/sweeps` | Reviewed, no changes needed | "Continue" sending empty area/country alongside sweep_id looked suspicious at first glance - verified against openapi.yaml's SweepAreaInput doc comment: intentional, every other field is ignored server-side when sweep_id is set. |
| Integrations → Prospecting → Settings | `/orgs/:id/prospecting/settings` | Reviewed, no changes needed | Already clean. |
| Everything else | — | Done | Organization, AI Core, Automation, and Integrations are all now reviewed end to end - see `docs/console-guides/README.mdx` for the user-facing writeup of what each page does (one `.mdx` file per page, grouped into folders by sidebar item). |

**`PageHeader` title/description** (was tracked here as a deferred bug, `task_194330fb`): resolved by removing both entirely rather than fixing the render. `title`/`description` briefly did start rendering (`dc59311`) - the CSS for it had been sitting ready in `index.css` the whole time, just never wired into the component - but on every page it turned out to be pure duplication of the topbar breadcrumb (title) or generic boilerplate the page's own content already made obvious (description). Both props are gone from `PageHeader` now (`3651642`); it's just an actions/badge row. One exception: `CorpusDetailPage`'s corpus name (dynamic, not boilerplate, and not shown anywhere else on screen) moved into the page body as its own small heading instead of disappearing.

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
