# Seshat MVP Plan

This folder is the clean source of truth for the Seshat MVP direction.

The goal is to stop developing every surface at the same time and finish the
core product in a strict order.

## MVP Order

1. Chat
2. Settings
3. Admin Panel
4. Skills Creator
5. Knowledge UI

## Post-MVP

1. Inbox
2. Companion
3. Team
4. Other surfaces

Automation (jobs, schedules, triggers, runs) is not on this list: it lives in SeshatCloud only, see
`repository_boundaries.md`.

## Core Principle

Seshat already has enough feature breadth. The next step is not to add more
surface area, but to make the daily paths excellent:

- Main Chat
- Knowledge capability
- provider and model selection
- files and attachments
- tools and permissions
- sources and provenance
- session isolation
- local/embedded execution

## Important Distinction

Knowledge UI can stay locked until its MVP turn.

Knowledge capability must remain available to Chat while Chat is active:

- knowledge search
- file ingestion
- attachment context
- citations
- source provenance

The service can be used before the dedicated product page is redesigned.

## Documents

- `stack.md`: technologies and architectural choices.
- `frontend_governance.md`: app lifecycle and Tailwind migration rules.
- `app_status.md`: current activation status of product surfaces.
- `done_criteria.md`: concrete DONE gates.
- `ai_manus_reference.md`: how AI-Manus should be used as UI inspiration.
- `execution_profiles.md`: embedded, development and production profiles.
- `concepts.md`: runtime/agent/tool/skill/workflow/service vocabulary.
- `repository_boundaries.md`: what each of the four repositories owns, and the rule that decides what belongs in SeshatOS.
- `priorities.md`: P0/P1 priorities and what not to prioritize now.
- `codex_rules.md`: operational rules for agent-assisted work.
