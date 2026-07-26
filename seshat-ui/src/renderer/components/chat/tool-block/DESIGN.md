# Tool display design

This is where we think about *how a tool call looks in the chat* before touching
code — the thing that kept breaking one tool at a time until `toolDisplay.tsx`
gave every tool's icon/label/silent/groupable/render a single home (see that
file's top comment for why). This doc is the other half: not "which tool maps
to which renderer" but "what should any of this actually look like."

Update this file when the visual language changes, not just when a tool is
added. If a decision here turns out wrong, cross it out and say why — that's
more useful to the next person than silently reverting.

---

## The five surfaces a tool call can render as

From quietest to loudest:

1. **Silent line** (`SilentToolView`) — icon + label + optional snippet, one
   row, no body. For tools with no user-facing input/output worth ever
   showing (`read`, `task_get`, `enter_worktree`, …). Only expands if it
   failed (shows raw `result.content`) or is `submit_plan` (swaps to
   `PlanArtifactCard`).
2. **Quiet-group summary** (`QuietToolGroup`) — one collapsed line
   summarizing 2+ groupable tools that ran back-to-back with no text between
   them ("Read a file, Ran a command"). Expands to a list of individual
   **grouped item lines**.
3. **Grouped item line** / **solo line** (`ToolLineItem`) — same component
   either way (a lone non-silent tool gets this directly from `ToolBlock`,
   never a group wrapper of one). Icon + `soloLabel` (or category clause) +
   copy + chevron. Expands to the tool's full card body.
4. **Full card body** — whatever the tool's dedicated `*ToolView` renders
   (or `GenericToolView`'s raw input/output JSON if none). Lives *inside*
   surface 1's error-expand or surface 3's chevron-expand — it is never its
   own top-level card anymore (see `ToolBlock.tsx`'s comment on why a bordered
   card even for a single Read felt heavier than the operation deserved).
5. **Permission card** (`PermissionCard`) — the one surface that's a real
   standalone card with a border, for the one state that truly needs to
   interrupt the flow: a tool blocked on the user's decision.

**Rule of thumb:** density should track how much the user is expected to
*read*, not how much data the tool produced. A `read` that returns 400 lines
is still just "did the file get read," so it stays silent; a `bash` that
prints one line is still an action with a command and a result the user
should be able to scan, so it never goes silent.

## Hard rule: never render the same content twice

Every full-card renderer owns 100% of its own error/output presentation.
Nothing above it (`ToolLineItem`, `QuietToolGroup`, `ToolBlock`) may also dump
`result.content` as a generic fallback "just in case" — that's exactly how
bash and grep ended up showing the same error message twice (once from the
renderer's own `Section label="Error"`, once from a blanket
`{status === 'failed' && <pre>{result.content}</pre>}` in `ToolLineItem`,
removed in this pass). If a renderer is missing its own error section, fix
*that renderer* (see `BashToolView`/`WebSearchToolView`, patched here to add
the same `<Section label="Error"><pre className="tb-pre tb-pre--error">`
block every other renderer already had) — don't paper over it with a shared
catch-all one level up.

Corollary: don't show a structured field when it isn't meaningful. Bash's
footer used to print `Exit code: ?` for a command that was blocked before it
ever ran (no exit code exists yet) — it now only renders once
`parsed.exitCode` is actually a number. A placeholder value is worse than no
line at all.

## Hard rule: no tool gets the raw-dump fallback by default

`GenericToolView` (raw `tool.input` JSON + raw `result.content`) exists as a
safety net for tools nobody has looked at yet, not as an acceptable
permanent display for ~50 tools that used to have no registry entry at all
(bash job-control siblings, notebook_*, memory_*, automation daemon jobs,
social feeds, math tools, skills introspection, git/notification stubs, …).
Audited and fixed this session — every tool now gets one of exactly two
treatments, never a third "leave it as raw JSON" option:

- **`silent: true`** — the result is a confirmation or plumbing state change
  with nothing worth reading unless it failed (`create_directory`,
  `delete_job`, the git/notification stub tools that always error, …). Same
  bucket as `read`/`list_directory` already were.
- **A shared `render`** — the result is real content, shown through one of a
  small number of reusable body components instead of a bespoke one-off per
  tool: `ProseToolView` (readable text — social feeds, skill docs, notebook
  op summaries), `JsonToolView` (structured JSON worth pretty-printing —
  memory graph lookups, automation job records), `MathToolView` (expression
  in, result out), `PatchToolView` (apply_patch's per-file change list,
  color-coded by verb).

If a new tool shows up with no entry, it still falls back to
`GenericToolView` — that's the "not audited yet" state, not a design choice.
Give it one of the two treatments above instead of leaving it there.

## Conventions for `toolDisplay.tsx` entries

- **`label`** is the identity — PermissionCard, the "other"-category fallback,
  and the silent line all read it. Keep it short (1–3 words), Title Case, no
  punctuation.
- **`snippet`** is silent-only: the one extra fact worth showing inline
  without expanding (a filename, a query, an ID). Keep it to what fits on one
  line without wrapping — `compact()` truncates long strings for this reason.
- **`soloLabel`** is for everything *not* silent: it's what a human would say
  they just watched the agent do ("Read foo.py", "Bash — fixed the off-by-one").
  Prefer the tool's own `description`-style input field over echoing raw
  arguments when one exists (see bash's `soloLabel`) — a model-authored
  sentence reads better collapsed into one line than `command` verbatim.
- Silence is the default worth defending, not the exception: if a tool's
  result is purely plumbing (state changes the user will see reflected
  elsewhere — Agent Monitor, a side panel, the plan review UI) it should be
  silent. Don't add a full card just because a tool *has* interesting fields;
  add it because a human genuinely wants to read them inline, in the
  transcript, without opening anything else.

## `submit_plan` — current state

Fixed this session: the tool-call row's inline swap to `PlanArtifactCard`
(`SilentToolView`'s `submitPlanInfo`) was reading `result.metadata.additional
.plan_id`, a key that never exists on the wire — the engine/backend always
flatten `ResultMetadata.Additional` onto the metadata object directly, so the
real key is `result.metadata.plan_id`. Fixed and traced against the Go
source (`toolResultMetadata`/`buildToolResultMessages`/`buildToolResultSSE`
all do the same flattening, confirmed no code path ever produces a nested
`additional` key).

**Not yet re-verified live end-to-end** — attempting to re-trigger a real
`submit_plan` call through the running app this session hit an unrelated
hang (`enter_plan_mode: checking permissions` never resolved, in this local
dev environment's permission-mode config). That hang predates this session's
changes and nothing here touches `enter_plan_mode`'s own permission-checking
code, but it's worth a dedicated look if plan mode is generally flaky for you
day-to-day — separate issue from the display fix above.

The top-level plan flow (banner card above the input, `PlanEditorPanel`) does
not depend on this fix at all — it's driven by the independent
`plan.submitted` runtime event, not tool-result metadata — so it should be
unaffected either way.

## Thinking blocks between tool calls

**Implemented.** `groupBlocks()` (`MessageItem.tsx`) now scans past a run of
interior `thinking` blocks between two groupable `tool_use` blocks — if
another groupable tool follows, the thinking block(s) get pulled into the
same group instead of ending it. A run like *read → (silent reasoning) →
bash → (silent reasoning) → edit* collapses into one quiet-group instead of
three top-level surfaces with two "Thinking" toggles wedged between them.

Only *interior* thinking counts: a thinking block can't lead or trail a
group (the scan always starts and ends on a real tool_use match), and a
**real** text reply still ends the group exactly as before — thinking with
no other tool after it just falls through to a normal standalone
`ThinkingBlock`.

Inside `QuietToolGroup`'s expanded item list, a folded thinking block renders
as `ThinkingGroupItem` — same row shape as `ToolLineItem` (icon + label +
copy + chevron), 💭 instead of a status icon, italic label. Per user
decision:
- **Closed by default**, same as every other item in a healthy group — it's
  reasoning, not an alert, so it doesn't earn auto-expand the way an error
  does.
- A **lone** thinking block between two tools that don't end up grouped
  (e.g. one side isn't groupable, like `web_search`) gets no special
  treatment — it stays the plain top-level `ThinkingBlock` toggle. The
  problem being solved is groups breaking apart; a thinking block with
  nothing to join isn't that case.
- `summarizeQuietGroup`'s collapsed line ignores thinking items entirely (it
  only ever received the `tool` items) — a thinking blurb explains what
  happened, it isn't itself something that happened, so it doesn't change
  the "Read a file, Ran a command" summary.
