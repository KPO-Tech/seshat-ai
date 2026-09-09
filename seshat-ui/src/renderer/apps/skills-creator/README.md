# Skills Creator App

Skills Creator is a platform for browsing, editing, importing, enabling, and
eventually publishing skills.

Target structure:

- `pages/` route-level screens.
- `components/` Skills-specific UI pieces.
- `api/` Skills-specific API wrappers and DTOs.
- `hooks/` Skills-specific data hooks.
- `styles/` Skills-specific scoped CSS.

Current applied structure:

- `App.tsx` mounts the internal app router.
- `routes.tsx` owns Skills Creator routes.
- `api/types.ts` contains Skills-specific DTOs/view types.
- `components/` contains the sidebar tree, editor panel, empty state, icon picker, and repo manager modal.
- `lib/` contains skill grouping, file/markdown helpers, and icon preference helpers.
- `styles/skills-creator.css` owns the Skills Creator stylesheet.
- `pages/SkillsCreatorPage.tsx` owns data loading, selection state, and page-level orchestration.
