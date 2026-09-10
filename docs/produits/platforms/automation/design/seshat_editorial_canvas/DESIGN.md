---
name: Seshat Editorial Canvas
colors:
  surface: '#fff8f4'
  surface-dim: '#dfd9d5'
  surface-bright: '#fff8f4'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f9f2ef'
  surface-container: '#f3ede9'
  surface-container-high: '#ede7e3'
  surface-container-highest: '#e7e1de'
  on-surface: '#1d1b19'
  on-surface-variant: '#574238'
  inverse-surface: '#32302e'
  inverse-on-surface: '#f6f0ec'
  outline: '#8a7266'
  outline-variant: '#ddc1b2'
  surface-tint: '#9b4500'
  primary: '#9b4500'
  on-primary: '#ffffff'
  primary-container: '#ef7c2f'
  on-primary-container: '#582400'
  inverse-primary: '#ffb68d'
  secondary: '#7c572d'
  on-secondary: '#ffffff'
  secondary-container: '#fecb97'
  on-secondary-container: '#79542a'
  tertiary: '#006688'
  on-tertiary: '#ffffff'
  tertiary-container: '#00a7dc'
  on-tertiary-container: '#00374c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbc9'
  primary-fixed-dim: '#ffb68d'
  on-primary-fixed: '#331200'
  on-primary-fixed-variant: '#763300'
  secondary-fixed: '#ffdcbc'
  secondary-fixed-dim: '#efbd8a'
  on-secondary-fixed: '#2c1700'
  on-secondary-fixed-variant: '#613f18'
  tertiary-fixed: '#c2e8ff'
  tertiary-fixed-dim: '#75d1ff'
  on-tertiary-fixed: '#001e2b'
  on-tertiary-fixed-variant: '#004d67'
  background: '#fff8f4'
  on-background: '#1d1b19'
  surface-variant: '#e7e1de'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-base: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
  layout-sidebar: 17.5rem
  layout-inspector: 24rem
  gutter: 1rem
---

## Brand & Style

This design system establishes an architectural, editorial enterprise environment tailored for orchestrating autonomous agents and complex intelligence pipelines. Built on a foundation of warm limestone, deep espresso typography, and purposeful terracotta accents, it eschews generic hyper-saturated SaaS tropes in favor of an intellectual, calm, and grounded studio atmosphere.

The style fuses **Modern Minimalist Utility** with **Tactile Editorial Craft**:
- **Warm Editorial Rigor:** Warm-toned parchment and stone layers replace clinical cold greys, giving deep multi-hour workflows a calm, eye-friendly surface reminiscent of physical archives and drafting tables.
- **Architectural Precision:** Razor-sharp 1px structural framing, structural monospaced tags for agent IDs and execution timings, and quiet tonal division.
- **Controlled Intentionality:** Vibrant terracotta is strictly reserved for primary agent execution, forward momentum CTAs, and active routing states, while warm antique gold marks prestige configurations and agent capabilities.

## Colors

The palette is anchored in an earthy, warm limestone framework with precise tactile contrast:

### Workspace & Surfaces
- **Canvas Base (`#F6F4F1`):** Limestone tint providing the canvas for persistent navigation panels, workflow execution canvases, and root scaffolding.
- **Surface Layer (`#FFFFFF`):** High-clarity white reserved for focus blocks: workflow nodes, inspector side-panels, active dialogs, and tabular data records.
- **Elevated / Interactive Surface (`#F3EEE8`):** Warm parchment elevation utilized for floating utility toolbars, popovers, contextual tooltips, and secondary hover states.

### Lines & Boundaries
- **Border Default (`#DDD5CC`):** Crisp, quiet framing lines providing clear spatial containment without visual weight.
- **Border Subtle (`#E6DED5`):** Soft, low-contrast internal dividers, separating micro-metrics, table rows, and nested node parameters.

### Typographic Hierarchy
- **Text Primary (`#1E1C1A`):** Deep espresso charcoal ensuring maximum legible contrast without the harshness of pure black.
- **Text Secondary (`#746F69`):** Subdued graphite for operational meta info, agent run durations, timestamps, and descriptive parameter keys.
- **Text Muted (`#938C84`):** Soft stone for empty states, placeholder text, inactive inputs, and inert navigational icons.

### Brand Accents
- **Brand Primary (`#EF7C2F`):** Warm terracotta orange driving high-confidence human actions: "Run Workflow", "Deploy Agent", active step highlights, and focused input indicators.
- **Brand Accent (`#C89A6A`):** Warm antique gold utilized for system intelligence tags, tier status, and capability highlights.

### Operational Semantics
- **Success (`#15803D` / Background `#ECFDF5` / Border `#A7F3D0`):** Workflow step completed, verification passed.
- **Warning (`#B45309` / Background `#FFFBEB` / Border `#FDE68A`):** Pipeline degraded, rate-limit thresholds near capacity.
- **Critical / Error (`#DC2626` / Background `#FEF2F2` / Border `#FECACA`):** Unhandled execution exception, step failure.
- **Info (`#1D4ED8` / Background `#EFF6FF` / Border `#BFDBFE`):** Pipeline re-indexing, queued node execution.

## Typography

Typography prioritizes clarity, tight structural proportion, and operational legibility.

- **Primary Typeface (Inter):** Leveraged across structural interface headlines, action elements, and execution details. Headlines employ subtle negative letter-spacing (`-0.015em` to `-0.02em`) to mirror the clean authority of fine editorial publishing.
- **Monospace Typeface (JetBrains Mono):** Applied systematically to machine-level primitives: agent token IDs, memory addresses, latency counters, execution timestamps, and parameter keys.
- **Information Density Hierarchy:** Long descriptive logs sit at `body-sm` (13px), standard forms and node parameters use `body-md` (14px), and technical badge metadata uses `code-sm` (11px) with uppercase tracking.

## Layout & Spacing

The workspace uses a composite **Multi-Pane Shell with Fluid Canvas Architecture**:

- **Grid & Alignment:** Strictly governed by an 8pt base grid (with a 4pt sub-grid for micro-controls and tags).
- **Persistent Workbench (Sidebar):** Fixed at `17.5rem` (280px) on the left `#F6F4F1` surface, demarcated by a 1px `#DDD5CC` vertical border.
- **Workflow Infinite/Fluid Canvas:** Occupies the central viewport, presenting an optional subtle dot matrix (`1.5px` dots at `24px` intervals colored in `#E6DED5`).
- **Contextual Inspector Panel:** Slides in from the right edge at `24rem` (384px) in `#FFFFFF` with full height and a 1px border.

### Responsive Breakpoints
- **Desktop (>1280px):** Simultaneous persistent navigation, fluid execution canvas, and docked right inspector.
- **Tablet (768px - 1279px):** Sidebar collapses to an icon rail (`4.5rem`), inspector panel switches to an overlay drawer backdrop.
- **Mobile (<767px):** Canvas transitions to a linear step-card feed; sidebar becomes a modal sheet; margins compress to `1rem`.

## Elevation & Depth

This system avoids heavy drop shadows, building depth through tonal contrast and razor-sharp border boundaries.

- **Layer 0 (Canvas Base):** Flat `#F6F4F1`. All persistent structural backgrounds live here.
- **Layer 1 (Card & Nodes):** Solid `#FFFFFF` enclosed by a 1px `#DDD5CC` border. No drop shadow during rest states; visual segregation is achieved strictly via surface tint divergence.
- **Layer 2 (Node Hover & Interactive Selection):** Node border transitions to `#EF7C2F` (Primary) with an ultra-subtle warm shadow: `0 2px 8px -2px rgba(30, 28, 26, 0.06), 0 1px 3px -1px rgba(30, 28, 26, 0.04)`.
- **Layer 3 (Floating Controls, Menus, Modals):** `#FFFFFF` with `#DDD5CC` framing, elevated by `0 8px 24px -4px rgba(30, 28, 26, 0.08), 0 2px 6px -1px rgba(30, 28, 26, 0.04)`.
- **Dividers & Seams:** All dividers use 1px solid lines (`#DDD5CC` for structural modules, `#E6DED5` for inner module separators). Never blur or soften divider strokes.

## Shapes

The geometric aesthetic emphasizes structured discipline:

- **Base Radius (`0.25rem` / 4px):** Applied to form controls, action buttons, table cells, code blocks, and micro tags.
- **Container Radius (`0.5rem` / 8px):** Applied to workflow node containers, inspection cards, toolbars, and modal windows.
- **Strict Anti-Pill Philosophy:** Avoid rounded full/pill buttons for core controls. Status indicators and chips adopt `0.25rem` radii with rigid boundaries to maintain an authoritative, technical atmosphere.

## Components

### Buttons
- **Primary:** Terracotta background (`#EF7C2F`), crisp white text (`#FFFFFF`), `0.25rem` radius. Hover: `#DC681B`. Active: `#C9570E`. Focus: 2px offset ring using `#EF7C2F`.
- **Secondary:** Surface elevated (`#FFFFFF`), 1px border `#DDD5CC`, text `#1E1C1A`. Hover: `#F3EEE8` background, `#DDD5CC` border.
- **Ghost / Subtle:** Transparent background, text `#746F69`. Hover: `#F3EEE8` background, text `#1E1C1A`.

### Workflow Node Cards
- **Structure:** `#FFFFFF` background, 1px `#DDD5CC` border, `0.5rem` radius. Header partitioned by a 1px `#E6DED5` border.
- **Title & Icon:** Monospace node ID (`code-sm`, `#746F69`) aligned with status indicator dot.
- **Connectors / Ports:** 10px circular anchors positioned precisely on the outer border, filled with `#FFFFFF` and stroked with 2px `#DDD5CC` (hover: `#EF7C2F`).

### Status Badges & Chips
- **Geometry:** Height 22px, `0.25rem` radius, padding `0 6px`. Font: `JetBrains Mono` at `code-sm`.
- **Success:** `#ECFDF5` background, `#A7F3D0` border, `#15803D` text.
- **Warning:** `#FFFBEB` background, `#FDE68A` border, `#B45309` text.
- **Critical:** `#FEF2F2` background, `#FECACA` border, `#DC2626` text.
- **Brand / Accent:** `#FAF4ED` background, `#EAD8C3` border, `#C89A6A` text.

### Inputs & Text Areas
- **Rest:** `#FFFFFF` background, 1px `#DDD5CC` border, text `#1E1C1A`, placeholder `#938C84`, `0.25rem` radius.
- **Focus:** Border shifts to `#EF7C2F`, box-shadow `0 0 0 1px #EF7C2F`.
- **Monospace Code Inputs:** Surface `#F6F4F1` with font `JetBrains Mono` for system prompts, JSON schemas, and agent constraints.

### Lists & Data Tables
- **Header:** `#F6F4F1` background, 1px bottom border `#DDD5CC`, text `label-md` in `#746F69`, uppercase with tracking.
- **Row:** `#FFFFFF` background, bottom border 1px `#E6DED5`. Hover state `#F3EEE8`.
- **Data Alignment:** Text primary for main keys; JetBrains Mono for execution IDs, run times, and model parameter tags.

### Selection Controls
- **Checkboxes & Radios:** 16px square/circle, 1.5px `#DDD5CC` border, `#FFFFFF` rest background. Checked: `#EF7C2F` background with white checkmark.