# SeshatOS Documentation

This is a map of `docs/`, not an exhaustive file list — each section below names the entry point to start from and what the rest of that subfolder is for.

## Start here

| Document | What it's for |
|---|---|
| [`helps/roadmap.md`](./helps/roadmap.md) | Session journal for `seshat-backend`/`seshat-server` work — read this first at the start of any session touching those two. |
| `../ROADMAP.md` (repo root) | The `seshat-server`/`seshat-console` engineering log, picking up where `helps/roadmap.md` leaves off (2026-08-16). Different scope, same "read before working" role — see its own note on why these two aren't merged. |
| [`architecture.md`](./architecture.md) | Package map, layer responsibilities, dependency rules for the Go backend split. |
| [`frontend-strategy.md`](./frontend-strategy.md) | Frontend direction: keep the current React desktop, use Svelte for new product surfaces when appropriate. |
| [`development.md`](./development.md) | Local setup, env vars, Go workspace structure. |

`D:\Documents\PROJECTS\ai\Discussions\` (outside this repo) holds the current MVP strategy and product direction (Chat-first order, `seshat-desktop` rebuild) — check `Discussions/mvp/` before assuming anything under `project/` or `produits/` below is still the active plan.

## Reference docs

| Document | What it's for |
|---|---|
| [`RUNTIME.md`](./RUNTIME.md) | `~/.config/seshat` runtime layout. |
| [`desktop-packaging.md`](./desktop-packaging.md) | Desktop startup, server URL defaults, Windows/Linux packaging. |
| [`security-sandbox.md`](./security-sandbox.md) | Permission prompts, sandbox status, release wording. |

## `helps/` — session journal and working audits

Point-in-time engineering notes. `roadmap.md` is the entry point (see above). The other files:

- [`audit-2026-09-04-n8n-gap-analysis.md`](./helps/audit-2026-09-04-n8n-gap-analysis.md) — **live checklist**, actively used to track the Automation engine's remaining gaps against n8n-class workflow builders.
- [`audit-2026-08-29-openwork-den-comparison.md`](./helps/audit-2026-08-29-openwork-den-comparison.md) — mostly closed competitive/enterprise-readiness audit, 2 narrow open items remain.

Closed, fully-resolved audits from earlier in the project (2026-08-02, 2026-08-10, 2026-08-13 enterprise-readiness) are in [`archive/`](./archive/), along with the completed console-redesign tracking doc and the screen-backlog doc whose job is done.

## `produits/` — current product framing

See [`produits/README.md`](./produits/README.md) for the full breakdown. One per product/platform (`general.md` for the portfolio view, then `chat/`, `platforms/automation/`, `platforms/knowledge/`), mirroring `seshat-ui/src/renderer/apps/<platform>/` on the code side.

## `project/` — planning notes

- [`future-ideas.md`](./project/future-ideas.md) — parking lot for ideas that came up but aren't scheduled. Still actively referenced.

The formal business/vision/strategy pack that used to live in `project/strategy/` is archived — see below.

## `console-guides/` — Seshat Console help center content

`.mdx` source for the in-app help center, organized by console section (`ai-core/`, `automation/`, `integrations/`, `organization/`, `preferences.mdx`, `workspace/`). Current and actively maintained; the successor to `archive/console-ui-redesign.md`'s tracking work.

## `archive/` — superseded, kept for historical reference

Not live documentation — each file carries a banner explaining what superseded it and why it's kept rather than deleted. Includes:

- Three closed point-in-time audits (2026-08-02, 2026-08-10, 2026-08-13 enterprise-readiness).
- `casdoor-frontend-mapping.md`, `console-ui-redesign.md`, `seshat-console-target-ia.md` — console build-order/IA planning docs whose backlogs are cleared or whose naming has drifted from the current `console-guides/` structure.
- `navigation-redesign-plan.md` — a nav proposal that wasn't implemented as written.
- `strategy/` (+ `strategy/fr/`) — the 2026-08-20 business/vision/GTM/financial-model snapshot, frozen since the day it was written. Superseded by `Discussions/mvp/` (outside this repo) for current strategy.
