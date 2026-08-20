# Knowledge Agent toolset

## Product split

Knowledge should keep three separate surfaces:

- Search: a focused search experience, close to Google/Bing, constrained to retrieval over included knowledge. It should use only the tools required for indexed search and cited answers.
- Collections: management of knowledge bases, files, ingestion, visibility, and test search for one collection.
- Chat: a dedicated Knowledge Agent conversation, separate from the general assistant, with more space and product-specific tools.

## Knowledge Chat direction

The Knowledge Agent chat can later receive a curated toolset that is broader than Search, but still designed around internal knowledge first:

- Search internal company and personal knowledge, with citations.
- Use web search as a secondary source when internal knowledge is insufficient.
- Create structured reports, PDFs, DOCX/Markdown files, spreadsheets, and presentations from trusted knowledge.
- Fill web forms or navigate websites through the browser, with explicit user approval before submission.
- Use company templates, writing style, and export settings when available.

## Safety and policy

The toolset should be attached by product mode, not globally:

- `knowledge-search`: retrieval-only, cited answers.
- `knowledge-chat`: curated document, report, browser, and web tools.
- `general-chat`: broad assistant tools, but not automatically the Knowledge-specific workflow bundle.

External actions should require approval before sending, submitting, publishing, or modifying remote systems. Generated artifacts should keep source traceability whenever they depend on indexed knowledge.

## Backend work needed

Add a backend model for per-agent/per-mode tool policy, for example by passing `agent_slug` plus a future `toolset_slug` or `mode` when creating a run. The desktop UI can already route Search and Chat separately, but the backend should eventually enforce the exact tool allowlist for each surface.
