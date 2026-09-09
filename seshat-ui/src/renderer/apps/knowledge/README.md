# Knowledge App

Knowledge is the enterprise Knowledge-to-Action platform.

Target structure:

- `pages/` route-level screens such as Overview, Search, Chat, Sources, Collections, Graph, Discover, Actions, and Settings.
- `components/` Knowledge-specific UI pieces.
- `api/` Knowledge-specific API wrappers and DTOs.
- `hooks/` Knowledge-specific data fetching and view state hooks.
- `styles/` Knowledge-specific scoped CSS shared across Knowledge screens.

Current applied structure:

- `App.tsx` mounts the internal app router.
- `routes.tsx` owns Knowledge routes.
- `api/types.ts` contains Knowledge-specific DTOs/view types.
- `pages/KnowledgePage.tsx` orchestrates data loading, session state, uploads,
  search execution, ingestion actions, and view selection.
- `components/` contains the current Search, Chat, Collections, preview,
  modal, drawer, icon, and badge components.
- `hooks/chatPreference.ts` persists the Knowledge Agent provider/model choice.
- `lib/` contains pure helpers for citations, document preview, status/date
  helpers, and Knowledge Agent prompt shaping.
- `styles/knowledge.css` owns the Knowledge platform stylesheet.
