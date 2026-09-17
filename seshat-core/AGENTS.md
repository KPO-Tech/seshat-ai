# AGENTS.md — seshat-core

`seshat-core` is a single Go module holding business logic that both
`seshat-backend` and `seshat-server` need in an identical form. It exists
to avoid duplicating that logic twice across the two products, nothing more.

## What belongs here

Code belongs in `seshat-core` only if **all** of these are true:

- It is genuinely used, unchanged, by both `seshat-backend` and `seshat-server`
  (not "conceptually similar" — the same behavior, the same inputs/outputs).
- It carries no organization/user/tenant/ACL concepts of its own (those stay
  in each product's own policy layer, which calls into this code).
- It is specific to Seshat's own product needs (CRM/prospecting-style logic,
  internal data models, etc.) — not a generic, reusable capability someone
  outside seshat-ai could use on its own.

## What does not belong here

- **Used by only one product** (`seshat-backend` or `seshat-server`, not
  both): put it directly in that product's own `internal/` tree instead.
  Do not pre-emptively move something here "in case the other side needs it
  later" — wait until it's actually duplicated.
- **Tenant-agnostic mechanism** that would be useful outside seshat-ai
  entirely (talking to an external API, parsing a file format, a generic
  algorithm): that belongs in `seshat/pkg` (the public runtime), not here.
  See `connectors`, `gmail`, `msgraph`, which moved from here to
  `seshat/pkg` for exactly this reason.
- **Organization/tenant/IAM/ACL policy**: always stays in `seshat-server`
  or `seshat-backend`, never here.

## Structure

`seshat-core` is one Go module (`go.mod` at this root), not one module per
subdirectory. A new shared capability becomes a new subpackage here (e.g.
`seshat-core/<name>/`), never a new nested `go.mod`. This keeps `go.work`
and every consumer's `go.mod` needing exactly one `require`/`replace` pair
for `seshat-core`, regardless of how many packages live inside it.

## Before adding something here

Ask: is this duplicated identically in both products right now, or would
moving it here be speculative? If speculative, leave it where it is until
the second copy actually exists.
