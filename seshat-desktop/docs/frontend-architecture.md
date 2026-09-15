# Frontend Architecture Rules

## Component Boundaries

SeshatOS Desktop must avoid the old `seshat-ui` pattern where full features, UI shells, API calls, state management, and nested controls accumulate in one large file.

Shell components should only own layout, section routing, modal chrome, and composition. Feature logic belongs in named feature folders.

Preferred structure:

- `components/settings/SettingsModal.tsx`: settings modal shell and sidebar only.
- `components/settings/SettingsContent.tsx`: settings content router only.
- `components/settings/<SectionName>Settings.tsx`: one file per simple settings page.
- `components/settings/<feature>/*`: only when a settings page grows into a multi-component feature.
- `components/config/ConfigModal.tsx`: config modal shell and sidebar only.
- `components/config/<feature>/<FeatureName>Config.tsx`: one file per config page.
- `components/ui/*`: reusable primitives and icons with no feature-specific backend calls.

## Naming

Use professional, domain-specific names. Prefer `ProvidersConfig`, `ProviderSelect`, `ProviderRow`, `UsageSettings`, `AboutSettings`, and `AccountSettings` over generic names like `Panel2`, `Stuff`, `BigModal`, or `ConfigView`.

Avoid excessive folder nesting. A single page component should stay directly in its feature folder until it has enough child components, hooks, or local types to justify its own subfolder.

## File Size

Treat files above roughly 250 lines as a refactor warning, unless the file is mostly data definitions or generated code. A modal shell above that limit should almost always be split.

## API Access

Backend calls should live in feature components, hooks, or API modules, not in modal shells. Shared endpoint shapes should move to `src/renderer/api/types.ts` once more than one feature uses them.
