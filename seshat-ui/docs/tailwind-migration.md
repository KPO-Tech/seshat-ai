# Tailwind Migration Plan

Seshat UI standardizes on Tailwind CSS as the single utility-first styling stack.
UnoCSS has been removed from the active Vite/npm setup. The goal is to migrate
all styling that can be expressed cleanly with Tailwind utilities while keeping
small, justified CSS islands for global base styles, vendor CSS, and genuinely
complex renderers.

## Styling Policy

- Use Tailwind for layout, spacing, sizing, borders, typography, colors,
  hover/focus states, overflow, positioning, and responsive behavior.
- Use Seshat design tokens through Tailwind aliases from
  `src/renderer/styles/tailwind.css`, for example `bg-app-surface`,
  `text-app-text-muted`, `border-app-border`, and `rounded-app-md`.
- Keep `src/renderer/styles/tokens.css` as the design-token source of truth.
- Keep `src/renderer/styles/globals.css` for global reset, Electron drag
  regions, scrollbars, and shared keyframes.
- Keep vendor CSS imports for Arco, KaTeX, PDF.js, and XYFlow.
- Keep scoped CSS only when Tailwind would make the component harder to read or
  maintain, such as markdown rendering, code/diff/table viewers, and deep
  third-party overrides.
- Do not reintroduce a second utility CSS engine.

## Migration Order

1. Desktop chrome
   - `components/layout/Shell.tsx`
   - `components/layout/Titlebar.tsx`
   - `components/layout/Sidebar.tsx`
   - `components/layout/RightPanelHost.tsx`
   - browser panel and agent workspace surfaces

2. Chat and tools
   - `pages/Conversation.tsx`
   - `components/chat/ChatInput.tsx`
   - `components/chat/MessageItem.tsx`
   - `components/chat/ToolBlock.tsx`
   - `components/chat/QuietToolGroup.tsx`
   - `components/chat/tool-block/*`
   - browser, bash, web search, MCP, file, diff, image, audio, and silent tool
     renderers

3. Shared UI primitives
   - `components/ui/IconButton.tsx`
   - `components/ui/StatusBadge.tsx`
   - `components/ui/SelectorPill.tsx`
   - `components/ui/PlannedFeatureCard.tsx`
   - `components/ui/Toast.tsx`
   - `components/settings/CapabilityLink.tsx`

4. Settings and admin
   - settings shell and nav
   - account/general/provider/knowledge/web-search/settings pages
   - admin dashboard and workspace pages
   - use Arco primitives where they fit instead of hand-rolled cards, tables,
     tabs, forms, modals, drawers, and selects

5. Product apps
   - Knowledge
   - Automation
   - Inbox
   - Scheduling
   - Skills Creator
   - Companion

6. Cleanup pass
   - remove converted `<style>{CSS}</style>` blocks
   - remove obsolete app-level `.css` files
   - remove `shared.css` if fully absorbed
   - audit with `rg "<style>|_CSS|\\.css" src/renderer`
   - run typecheck, lint, build, and visual checks

## Commit Strategy

Keep the migration reversible with focused commits:

- `refactor(ui): migrate desktop shell to tailwind`
- `refactor(chat): migrate conversation layout to tailwind`
- `refactor(tools): migrate tool blocks to tailwind`
- `refactor(settings): migrate settings surfaces to tailwind`
- `refactor(apps): migrate knowledge workspace to tailwind`
- `chore(ui): remove obsolete css blocks`

Each migration commit should keep behavior unchanged unless the commit message
explicitly says otherwise.

## Verification

For each completed zone:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- inspect dark and light themes
- inspect compact/narrow right-panel widths where applicable
- inspect active, hover, focus, empty, loading, error, and streaming states
