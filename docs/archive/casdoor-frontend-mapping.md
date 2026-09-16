> **Archived 2026-09-16.** This screen backlog is fully cleared (see root `ROADMAP.md`) — all Tier A/B/C domains it tracked are built and verified live. Kept as a build-order record.

---

# Casdoor Frontend Mapping For Seshat Server

## Goal

This document maps Casdoor's admin frontend to `seshat-server`'s control-plane API, to decide how much of Casdoor's frontend (if any) is worth reusing when building `seshat-server`'s own web admin frontend.

Scope clarification (updated 2026-07-09): this is **not** about `seshat-ui`. `seshat-ui` is the desktop app and only ever talks to `seshat-backend` (local), never to `seshat-server` directly. `seshat-server` needs its own, separate **web** frontend — an admin/ops console (audience: platform admins, possibly enterprise customer admins, still undecided) for configuring organizations/applications/providers/roles/policies/devices/jobs and for monitoring the control plane without going through the API or the database directly. Casdoor's own web frontend serves exactly this role for Casdoor itself, which is why it's a relevant reference.

The analysis is based on:

- the local Casdoor clone's frontend: `/home/amiche/Projects/AI/ai/helps/casdoor/web/src/` (read directly — `BaseListPage.js`, `ManagementPage.js`, `RoleEditPage.js`, `SessionListPage.js`, `backend/OrganizationBackend.js`, `backend/UserBackend.js`, plus file sizes/imports across the rest of `web/src/`, not just the two files the original version of this doc was based on)
- `seshat-server/openapi.yaml`, the current, validated API surface

## Executive Summary

Unchanged from the original version of this doc, but now backed by having actually read Casdoor's frontend code, not just its API-calling layer: **Casdoor's frontend cannot be connected to `seshat-server` without a full rewrite of every screen's data layer, and its own architecture (stack, auth model, routing) is old enough that copying its actual source files brings more baggage than value.**

The mismatch is not styling. It's three separate things, all confirmed by reading the code:

1. **Data contract** — composite `owner/name` identities, `{status, data, data2}` responses, Casdoor-specific query params. (already known from the previous version of this doc)
2. **Auth transport** — every single Casdoor API call uses `credentials: "include"` (cookie session). `seshat-server` uses `Authorization: Bearer <token>`. This means every one of the ~40 `backend/*.js` files needs its fetch calls rewritten, not adapted.
3. **Stack age** — Create React App via `craco`, React 18 **class components** with `UNSAFE_componentWillMount`, `react-router-dom` v5 (`this.props.match`, `this.props.history.push`, not the v6+ hooks API). None of this is what a new project would choose today.

Reuse the **ideas** (screen structure, which fields matter, table column choices, information architecture), not the **code**. Build the actual frontend fresh, wired directly to `seshat-server`'s already-documented `openapi.yaml`.

## Current Seshat Server Coverage (2026-07-09)

This is the actual current surface (see `openapi.yaml`, 50 paths, 0 lint errors) — much larger than when this doc was first written:

- **Auth**: bootstrap, login, logout, `GET /auth/me`
- **Organizations**: full CRUD, paginated/searchable/sortable
- **Users**: full CRUD, paginated/searchable/sortable, `DELETE /users/{id}/sessions` (revoke all)
- **Memberships**: full CRUD, paginated/searchable/sortable
- **Roles**: full CRUD — **dynamic, per-organization custom roles now exist** (this was Priority 4 / Tier C in the original doc; it's done)
- **Permissions**: read-only catalog
- **Invitations**: full lifecycle (create/list/get/accept/revoke), paginated/searchable/sortable
- **Groups**: full CRUD, paginated/searchable/sortable (membership via a real join table, not Casdoor's Casbin-style group nesting)
- **Policy Bindings**: full CRUD, paginated/searchable/sortable — grants a permission set to a user, group or role; Seshat's replacement for Casdoor's Casbin `Model`/`Adapter`/`Enforcer`/`Permission` stack, much smaller and flatter
- **Sessions**: self-service (see/revoke own) + admin (see/revoke anyone's), paginated/searchable/sortable
- **Audit Events**: paginated/searchable/sortable, structured filters (org/actor/action/resource_type)
- **Applications**: full CRUD, paginated/searchable/sortable, generated `client_id`/`client_secret`
- **Providers**: full CRUD, paginated/searchable/sortable (generic OAuth/OIDC/SAML upstream identity provider config)
- **Provider Settings**: full CRUD — LLM API credentials per (org, provider); **no Casdoor equivalent at all**
- **Devices / Jobs / Runs**: full automation control plane (register/list/revoke devices, CRUD+pause/resume/trigger jobs, list/cancel runs, device claim protocol); **no Casdoor equivalent at all**

Every list endpoint returns the same envelope: `{<resource>: [...], count, total, limit, offset, has_more, sort, order, query?}` (`ListMeta` in `openapi.yaml`), driven by `limit`/`offset`/`sort`/`order`/`q` query params, computed in real SQL (see `internal/server/db/query.go`) — not Casdoor's `p`/`pageSize`/`field`/`value`/`sortField`/`sortOrder` + `{data, data2}`.

## Frontend Architecture Comparison (new section, 2026-07-09)

Read directly from `helps/casdoor/web/`, not inferred:

| | Casdoor web | What `seshat-server`'s frontend needs |
|---|---|---|
| Build tool | Create React App via `craco` | anything current (Vite, etc.) |
| React style | Class components, `UNSAFE_componentWillMount` | function components + hooks |
| Routing | `react-router-dom` v5, `:organizationName/:name` composite params | opaque `:id` params matching `openapi.yaml` paths |
| UI library | `antd` 6 (re-themed with a "shadcn-style" token file, but still antd underneath) | open choice — antd works fine if reused deliberately, doesn't have to be |
| Auth | Cookie session, `credentials: "include"` on every fetch | `Authorization: Bearer <token>` header |
| List pattern | `BaseListPage` (class, extended per screen) → antd `Table` with per-column search dropdowns, tied to a Casdoor-specific "Form" (per-org custom form fields) and "Tour" (onboarding walkthrough) system | a table + `q`/`sort`/`order`/`limit`/`offset` bound to `ListMeta` — no per-org custom-form or tour system exists or is needed in Seshat |
| Edit pages | 900–1800+ lines each (`ApplicationEditPage.js`: 1847, `UserEditPage.js`: 1620), many embedded sub-tables (`table/*.js`: `MfaTable`, `WebauthnCredentialTable`, `SigninTable`, `ProviderTable`, etc.) for a much larger protocol/profile surface | a fraction of the fields, matching Seshat's deliberately smaller model |
| Dependencies pulled in alongside the admin screens | web3 wallet SDKs (`@web3-onboard/*`), `face-api.js`, `echarts`, `ethers`, `ldap`, dozens of OAuth provider login buttons (Alipay/Baidu/DingTalk/Douyin/...) | none of this — it belongs to Casdoor domains already marked out-of-scope (commerce, FaceID/IDV, LDAP sync, web3 auth) |

None of this is a styling complaint. It means: copying a Casdoor screen file and "adapting the field names" is not actually less work than writing the screen from scratch against `openapi.yaml`, because the auth call, the routing param, the list-fetch plumbing, and the response-shape handling in that file are *all* wrong for `seshat-server`, on top of the field names.

## Screen-by-Screen Reassessment

### Tier A — good reference for structure, full data-layer rewrite either way

- **Organizations** (`OrganizationListPage.js`/`OrganizationEditPage.js`) — Seshat's admin block (name/slug/website/support email/description) is a small, clean subset of Casdoor's much larger org settings page (password policy, MFA defaults, LDAP, themes — none of which Seshat has). Reuse the two-pane list+detail idea, not the form.
- **Applications** (`ApplicationListPage.js`/`ApplicationEditPage.js`) — Seshat covers name/slug/display name/callback/homepage/provider bindings/generated credentials. Casdoor's edit page additionally covers full OAuth/OIDC/SAML protocol tuning, signup schema, certs, theming (hence 1847 lines). Reuse the list table and the "basic info" card layout only.
- **Providers** (`ProviderListPage.js`/`ProviderEditPage.js`) — same story: Seshat has one generic provider shape (OAuth/OIDC/SAML fields), Casdoor has category-specific pages per provider kind (email/SMS/storage/payment/MFA/captcha/...). Reuse the list, write the edit form from Seshat's actual field list.
- **Sessions** (`SessionListPage.js`) — read in full: `extends BaseListPage`, a `Table` with columns + a `fetch()` that calls `SessionBackend.getSessions(...)` and reads `res.data`/`res.data2`. The *pattern* (table + fetch + pagination) is exactly what's needed; every line touching the backend needs rewriting for `ListMeta`/bearer auth/Seshat's actual session fields (`user_email`, `user_display_name`, `organization_ids`, `expires_at`).
- **Audit Events** (`RecordListPage.js`) — Casdoor's `Record` is a raw HTTP request/response log; Seshat's `AuditEvent` is a structured domain event (`action`, `resource_type`, `resource_id`, `metadata`). Conceptually similar table UX, different columns entirely.

### Tier B — reference loosely, expect a near-total rewrite

- **Users** (`UserListPage.js`/`UserEditPage.js`, 1620 lines) — Seshat now has full user CRUD, but Casdoor's user model is far richer (avatar, phone, region, MFA, WebAuthn, groups, consents, transactions...). Build a Seshat-sized user edit page (email, display name, admin flag, memberships) from scratch; don't try to trim Casdoor's.
- **Invitations** (`InvitationListPage.js`/`InvitationEditPage.js`) — Casdoor invitations are invitation-*code* products (quota, used count, signup group binding). Seshat invitations are simple organization-access invites (email, role, expiry, status). Different product, same table-list idea.
- **Groups** (`GroupListPage.js`, `GroupTreePage.js`) — Casdoor models groups as a tree with Casbin-flavored roles/domains. Seshat groups are flat, org-scoped, plain user-membership sets (backed by a real join table now, see the 2026-07-09 audit fix). Skip `GroupTreePage.js` entirely — there's no tree.

### Tier C — no usable Casdoor mapping, build native

- **Roles** (`RoleListPage.js`/`RoleEditPage.js`) — read `RoleEditPage.js` directly: Casdoor roles nest `users`/`groups`/`roles`/`domains` (a Casbin RBAC-with-hierarchy model). Seshat's `CustomRole` is flat: `code`/`name`/`description`/`permission_codes[]`, no nesting, no domains. This was Tier C in the original doc pending a "static vs dynamic roles" decision — that decision is made (dynamic, done), but the *shape* still doesn't map to Casdoor's screen. Build a simple role-editor (name, description, permission checklist) instead.
- **Permissions / Policy Bindings** — Casdoor's `PermissionListPage.js`/`ModelListPage.js`/`AdapterListPage.js`/`EnforcerListPage.js` are all Casbin infrastructure screens (models, adapters, enforcers, raw permission rules). Seshat's `PolicyBinding` (subject type/id → permission codes, one flat table) has no Casdoor screen to reference at all — it's simpler than what Casdoor exposes, by design. Build from scratch; a single list+form screen, no Casbin concepts needed.
- **Devices / Jobs / Runs** — Casdoor has nothing resembling this (closest analog, `EntryListPage.js`/`ServerListPage.js`, is Casdoor's own newer AI-gateway feature, a different product concept — agent/server/entry/site, not device-targeted job scheduling). Design these screens from scratch around Seshat's actual domain: device registry, job scheduler config (cron/interval/once, cloud vs device target), run history/log viewer.
- **Provider Settings** (LLM credentials) — no Casdoor equivalent (Casdoor's "providers" are identity providers, not LLM providers). Small, standalone screen: pick provider, model, base URL, API key (write-only field, never displayed back — matches the backend's redaction-by-construction).

### Confirmed still out of scope (unchanged from the original doc)

Commerce (Coupons/Orders/Payments/Plans/Pricing/Products/Subscriptions/Transactions), Casbin infra beyond what's noted above, LDAP/generic Syncers, Certs/Keys, Tickets/Forms, the AI-gateway domain (Agents/Servers/Entries/Sites/Rules — Casdoor's own newer feature, unrelated to Seshat's automation), CAS/SCIM/Kerberos/RADIUS/FaceID-IDV, web3/wallet auth.

## Recommended Integration Strategy

**Do not reuse Casdoor frontend source files as-is.** Every screen's auth call, routing params, and response-shape handling are wrong for `seshat-server`, on top of the field-level mismatches already documented. Copying a file and adapting it is not meaningfully faster than writing it against `openapi.yaml` directly, and it imports a large, dated dependency tree (CRA/craco, RRv5, class components, web3/FaceID/commerce libraries the pages don't even use) along the way.

**Do reuse:**

- the *screen inventory and structure* (list page → detail/edit page, sidebar nav grouped by domain, table + filter/search + pagination as the default list shape)
- *which fields matter* per entity, as a sanity check against Seshat's own (smaller) model
- optionally, the `shadcnTheme.js` antd token file as a starting point for color/typography *if* antd ends up being the chosen component library — it's a legitimate, already-tasteful reskin of antd's defaults, decoupled from the rest of Casdoor's code

**Stack choice for `seshat-server`'s frontend is still open** and worth a deliberate decision (function components + hooks either way, given Casdoor's class-component style is exactly what a fresh project should avoid):

- antd (same component library Casdoor uses, just the current app framework, not the old files) — fastest to build a dense admin console, biggest bundle
- a lighter stack (e.g. shadcn/ui + Tailwind) — more design control, more component-building work up front

## Suggested Build Order

Matches current backend maturity — everything listed already has full CRUD + pagination/search/sort on the server:

1. Organizations, Applications, Providers (Tier A, closest to Casdoor's structure)
2. Users, Memberships, Invitations, Groups (Tier B)
3. Roles, Policy Bindings (Tier C, native screens, no Casdoor template)
4. Sessions, Audit Events (Tier A pattern-wise, Seshat-specific columns)
5. Devices, Jobs, Runs, Provider Settings (fully native — this is Seshat's own automation control plane, nothing to map from Casdoor)

## Bottom Line

Casdoor is a good reference for *what an IAM admin console needs to contain* and *how to lay it out* — it's answering the same product question `seshat-server`'s frontend needs to answer. It is not a usable source of code for that frontend: the auth model, routing model, API contract, and component style are all things a fresh project should not inherit. Read Casdoor's screens for ideas, then build `seshat-server`'s frontend as a new, small, hooks-based app wired directly to `openapi.yaml`.
