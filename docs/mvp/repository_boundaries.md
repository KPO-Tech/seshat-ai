# Repository Boundaries

The four repositories and what each one owns. Updated on 2026-10-08; it replaces the earlier
`seshat/` versus `seshat-ai/` split, which predates the separation of the products.

| Repository | Owns |
|---|---|
| `seshat` | The engine: agent runtime, providers, tools, permissions, RAG building blocks, connectors library, SDK, CLI/TUI. Generic mechanisms only, public, Apache-2.0. |
| `SeshatOS` | The local product: desktop (Electron, React) and local Go backend. One person or a small team, on their own machine. |
| `SeshatCloud` | The multi-tenant product: organizations, IAM, SCIM, automation, organization knowledge, console, document intelligence. |
| `seshat-ai` | The company: website, strategy, product framing, brand. No product code. |

## Core rule

```text
seshat       = capabilities (mechanism)
SeshatOS     = what a person does on their own machine
SeshatCloud  = what an organization needs shared, governed and unattended
seshat-ai    = the company around them
```

## One capability, one home

A capability lives in SeshatOS or in SeshatCloud, not in both.

**SeshatOS (local) only if at least one holds:** it needs the user's machine (files, shell, desktop, a
local model, the local browser, local MCP servers); it must work offline, for one person, without an
account; it holds data that must not leave the machine.

**Everything else is SeshatCloud:** organizations or several users, shared state, unattended
execution, custody of other people's SaaS credentials, administration and governance, quotas and
billing, synchronisation of an organization's sources.

Settled consequences:

- **Automation** (jobs, schedules, triggers, runs) is SeshatCloud only. SeshatOS has no scheduler and
  no automation screen.
- **Memory** is personal: local when SeshatOS is standalone, in the Cloud when it is connected, so that
  what a person taught their agents follows them to another computer. What an organization wants to
  impose on every agent (rules, forbidden actions) is something else, governance, a separate
  capability still to design.
- **Usage counters** are not kept locally: the quota of a person's own provider is their own account's.
- **Knowledge** exists in both: a person's own files locally, an organization's sources in the Cloud.
  The five local connectors are frozen and give way to the Cloud's when a desktop is connected.
- Where SeshatOS talks to SeshatCloud, the contract has one source: the server's `openapi.yaml`.

The full decision, with the table of where each capability lives, is record 0003 in
`SeshatCloud/docs/decisions/`.

## Mechanism and policy

Mechanism belongs in `seshat` (a sync that turns credentials and a cursor into items and a next
cursor). Policy belongs in the product that applies it (authorise the principal, decrypt the token,
map the ACL, ingest, audit). Product logic never goes into `seshat`, and a shared piece of generic
code goes into `seshat/pkg` once, for both products to import.
