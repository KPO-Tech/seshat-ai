# Engineering journal, 2026

## Current series: the website documentation (2026-10-12)

This series is not archived and carries no banner: it is the current work that checks the English pages of
`seshat-ai.com` against the runtime code. Read them together, in this order.

| File | What it is |
|---|---|
| `audit-2026-10-12-documentation-du-site.md` | What the 30 pages get wrong, verified in `seshat-runtime` (E1 to E18, C1 to C14, S1 to S11). |
| `plan-2026-10-12-correction-documentation-du-site.md` | The execution plan, lot A to lot F, with the file and the proof for every task. |
| `bilan-2026-10-12-lots-a-et-d-documentation-du-site.md` | What lots A and D delivered, where the plan was not followed, and what remains. |
| `bilan-2026-10-14-lots-b-a-f-documentation-du-site.md` | What lots B to F delivered (PR #166 to #171), the guards that keep the pages right (`npm run guard:docs`), and what remains (terminal screenshots, a few runtime inconsistencies). Start here to resume. |

## Current plan: what we keep from Freebuff, and the desktop work (2026-10-17)

| File | What it is |
|---|---|
| `plan-2026-10-17-adoption-freebuff-et-desktop.md` | The decisions taken with the product owner, and the plan in five lots (security, desktop interface, runtime, desktop release, Knowledge), with where each idea lives in `helps/freebuff`. Living document: update the follow-up table as lots are done. |
| `inventaire-outils-et-agents-2026-10-17.md` | Every tool of the runtime registry with its measured token cost, sorted into default, deferred (found with `tool_search`) and specialised (not offered to the general agent), with the platform profiles and the decisions still open. Draft for validation before the desktop agent is changed. |

## Brought back on 2026-10-08 (archived, one banner per file)

Audits and roadmap written while the products were one repository. They moved here from
`SeshatCloud/docs/journal-legacy/` because they are reflection and history, not documentation of
the code. Each file carries a banner; do not use them to decide anything today.

| File | What it is |
|---|---|
| `roadmap.md` | Execution roadmap of the old single repository. |
| `audit-2026-08-29-openwork-den-comparison.md` | Comparison with OpenWork Den. |
| `audit-2026-09-04-n8n-gap-analysis.md` | Gap analysis against n8n. |

Current rules are in `docs/mvp/` and in the decision records of each repository.
