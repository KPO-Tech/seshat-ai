# Future ideas — not yet decided, don't lose track

Notes for product directions discussed but not committed to `GOAL.md`/`ROADMAP.md` yet. Move an idea into those documents once it's actually being built; keep this file for "we talked about it, we agreed it's worth doing eventually, nothing is scheduled."

Last updated: 2026-08-01.

---

## Apps page — specialized surfaces on top of one general agent

**The idea:** keep a single, general-purpose chat as the main/default surface (Home) — not code-specialized, not split into "Chat vs Code" as two competing entry points. Add an **Apps** page later: a launcher for specialized, purpose-built surfaces the user can open (potentially several at once, like real applications), each with its own UI affordances but sharing the same underlying agent engine:

- **Code** — the specialized coding surface (diff view, file tree, terminal panel, etc.) that today's general chat is not trying to be.
- **RAG / notebook-equivalent** — a workspace for knowledge-base work (closer to a Jupyter/notebook-style flow than a chat thread).
- **Image generation** — a dedicated creation surface (seshat SDK already has `pkg/image` + `generate_image` tool; this would be a UI-first way to reach it without going through chat tool-calling).
- **Music generation** — mentioned as a maybe-later idea, no concrete plan, no SDK support to build on yet.
- **Web app builder** (Lovable-equivalent) — generate/iterate on a web app from a prompt, with live preview.

**Why one general agent first, not a Chat/Code split on Home:** forcing "Chat or Code" as the very first decision on the home screen makes users choose before they know what they need, and most tasks aren't cleanly one or the other anyway. A single general surface now, with specialization arriving as opt-in apps later, avoids that up-front fork.

**Recommended technical direction (my recommendation during this discussion, not locked in):** one underlying agent/session engine (the seshat SDK backend already in `seshat-backend`/`seshat-server` — tool-calling, RAG, image generation already supported) differentiated **at the UI/workspace layer** per app (default system prompt, tool subset, panels/affordances specific to that app), rather than building genuinely separate agent stacks per app. Keeps maintenance sane — a fix to the core agent loop (e.g. the chat tool-call rendering issue below) benefits every app surface instead of needing to be reimplemented per app.

**Open questions:** how apps are launched/multiplexed (tabs? separate windows? a dock?), whether specialized apps need their own backend services beyond what `seshat-backend` already exposes (Code likely does — file tree/terminal are new surface area), how deep the "notebook-equivalent" RAG app diverges from the existing Knowledge Base UI that already exists today.

---

## Companion profiles — not wired into seshat-ai yet

seshat SDK ships `pkg/companion` (added v1.2.1): a `Profile` (name, style, traits, instructions, enabled/disabled) that gets injected into the agent's system prompt via `ClientConfig.Companion`, giving the agent a lightweight, user-chosen personality/presence. Neither `seshat-backend` nor `seshat-server` sets this today — it's a fully-built, unused capability.

**Idea:** expose this as a user-facing personalization feature (a settings page: name your assistant, pick a style/traits, optional custom instructions) rather than leaving it dark. Low implementation cost (the SDK does the work) — mainly a settings UI + wiring `ClientConfig.Companion` from stored preferences into session creation, on both `seshat-backend` (desktop) and `seshat-server` (cloud chat) client-construction paths.

**2026-08-05 addendum:** distinct from the CLI/TUI mascot idea in `helps/seshat-openclaude-audit-and-workflows.md` (that one's a terminal personality system for the open-source `seshat` engine). This is the `seshat-ui` desktop equivalent — same underlying SDK capability (`pkg/companion`), different surface. Floated as something that could eventually be positioned as its own named product in `strategy/4.product.md`, not just a settings toggle — explicitly future, not scoped, not to be added to the strategy docs yet.

---

## Doctor diagnostics — no desktop equivalent

seshat SDK ships `pkg/doctor`: local config/runtime-path/SQLite/provider-credential/helper-tool diagnostics (also exposed as `seshat doctor` CLI and a TUI dialog in the seshat project itself). seshat-ai has no equivalent surfaced to desktop users for self-service troubleshooting/support.

**Idea:** a "Diagnostics" or "Health Check" panel in seshat-ui settings, backed by a new thin endpoint in `seshat-backend` that calls `pkg/doctor`'s checks and renders the report — useful for support requests ("run diagnostics and paste the output") without needing log-file spelunking.

---

## Related open bug (tracked separately, noted here for context)

Chat's tool-call rendering currently groups all tool-call blocks together (visually "all tool calls up top") instead of interleaving them chronologically with the model's reasoning/commentary text as they actually happened — unlike e.g. Claude Code's own transcript view, which shows reasoning → tool call → reasoning → tool call → ... in true order. This is very likely a frontend content-block-ordering issue, not a model behavior issue. A previous session (several days old as of 2026-08-01) attempted to fix this without success; worth a fresh, careful look at how `seshat-ui`'s message renderer buckets text vs. tool_use content blocks. Not filed as a formal idea here since it's a bug fix, not a product direction — but it's part of the same "make the agent feel alive and engaging" thread as the Apps page discussion above.
