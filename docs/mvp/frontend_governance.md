# Frontend Governance

## Rule

Only the currently ACTIVE application may receive normal feature work.

LOCKED and POST_MVP applications are frozen unless the user explicitly changes
their status.

## Application Lifecycle

Statuses:

- ACTIVE: current focus.
- LOCKED: part of MVP, but not current focus.
- POST_MVP: intentionally postponed.
- DONE: migrated, verified and accepted.

## Reactivation Rule

A disabled or locked application can be reactivated only after:

1. Its UI is migrated to Tailwind CSS.
2. Obsolete styling patterns are removed.
3. Shared tokens and primitives are reused.
4. Existing unfinished flows are completed.
5. Typecheck passes.
6. Lint passes.
7. Build passes.
8. The user explicitly accepts moving focus to it.

## Migration Rule

Migration does not mean rewrite.

For every migrated component:

1. Inspect the existing Seshat implementation first.
2. Preserve working business logic, APIs, IPC, stores, hooks and types.
3. Inspect the AI-Manus equivalent only as UX reference.
4. Reuse the better layout and interaction patterns when useful.
5. Implement the result in React, TypeScript and Tailwind CSS.
6. Do not port Vue architecture or AI-Manus backend assumptions.
7. Do not rewrite working Seshat functionality without a concrete reason.
8. Remove old CSS only after the replacement is functional.

## CSS Rules

Preferred:

- Tailwind classes in JSX
- shared class constants for repeated Tailwind strings
- design tokens through `tailwind.css`
- small local helper functions such as `cx`

Allowed plain CSS:

- global tokens
- keyframes
- third-party generated markup
- browser/PDF/DOCX/XLSX viewer internals
- app-level legacy CSS during progressive migration

Avoid:

- new CSS modules
- new handcrafted global class systems
- component-local `<style>` injection
- duplicated CSS stacks
- mixing UnoCSS and Tailwind CSS

## Visual Identity

The `seshat-desktop` rebuild owns the current visual identity decision in:

`SeshatOS/seshat-desktop/` (the desktop's own docs) and the brand files under `SeshatOS/docs/brand/`

Current direction:

- neutral Manus-like light/dark palette;
- no old orange-first identity;
- `public/logo4.png` as working logo;
- `public/logo3.png` kept only as conceptual inspiration for a future original
  Seshat mark.

## Feature Rule

Do not use a Tailwind migration as an excuse to refactor product behavior.

Separate:

- UI migration
- feature improvement
- backend correctness
- data model changes

Each should have its own commit or phase.
