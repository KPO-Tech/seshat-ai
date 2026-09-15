# Visual Identity

Status: working decision for the `seshat-desktop` rebuild.

## Direction

The desktop UI should move away from the old orange identity and from the old
Flaticon-style mark.

Target feeling:

- calm, premium, quiet productivity;
- close to the Manus-like desktop screenshots without copying them exactly;
- neutral surfaces first, restrained accents second;
- strong light and dark mode support from the beginning;
- readable controls, soft borders, and very little decorative color.

## Logo Decision

Current logo: `public/logo4.png`.

Why:

- it reads better at small sizes than the other candidates;
- it works better in both light and dark UI;
- it suggests AI, tooling, system, and desktop workspace more directly;
- it is good enough as a working product mark while the app shell is rebuilt.

Notes:

- `logo3.png` remains the strongest conceptual inspiration because it connects
  more directly to "Seshat" and the scribe idea.
- Do not treat `logo4.png` as final brand ownership. Before public release,
  replace it with an original mark or verify its license.
- Avoid the old Flaticon mark as the main brand logo unless its license and
  attribution requirements are fully handled.

## Palette

Use a neutral Manus-like palette, not the old orange-first palette.

### Light Mode

| Token | Color | Usage |
| --- | --- | --- |
| `--surface-root` | `#F7F7F5` | app background |
| `--surface-sidebar` | `#EFEFEE` | left navigation |
| `--surface-panel` | `#FFFFFF` | input surfaces, popovers, cards |
| `--surface-muted` | `#F1F1F0` | subtle fills |
| `--border-soft` | `#E1E1DF` | default borders |
| `--border-strong` | `#D4D4D0` | active or framed controls |
| `--text-primary` | `#171717` | main text |
| `--text-secondary` | `#5F6368` | supporting text |
| `--text-muted` | `#8A8D91` | hints and placeholders |

### Dark Mode

| Token | Color | Usage |
| --- | --- | --- |
| `--surface-root` | `#171717` | app background |
| `--surface-sidebar` | `#1F1F1F` | left navigation |
| `--surface-panel` | `#252525` | input surfaces, popovers, cards |
| `--surface-muted` | `#2D2D2D` | subtle fills |
| `--border-soft` | `#353535` | default borders |
| `--border-strong` | `#474747` | active or framed controls |
| `--text-primary` | `#F4F4F2` | main text |
| `--text-secondary` | `#B8B8B4` | supporting text |
| `--text-muted` | `#858580` | hints and placeholders |

### Accents

| Token | Color | Usage |
| --- | --- | --- |
| `--accent-primary` | `#0A84FF` | primary actions, links, active states |
| `--accent-success` | `#41B883` | connected, completed, safe positive states |
| `--accent-warning` | `#D99A25` | credits, warnings, attention |
| `--accent-danger` | `#E05252` | destructive actions and errors |

Rules:

- Do not make orange the dominant identity color.
- Do not make the UI a one-hue blue/purple product.
- Use accent colors sparingly: active states, status, links, and critical calls.
- Prefer neutral surfaces and typography for the main desktop feeling.

## Shape And Typography

- Default radius: `8px`.
- Large input radius: `20px` to `24px`, when it matches the Manus-like chat
  composer.
- Keep cards and panels restrained; avoid nested cards.
- Use sans-serif for product UI.
- A serif headline is allowed only for the empty Chat landing view, if it helps
  create the Manus-like calm first impression.

## Implementation

- Define global tokens in `src/renderer/styles/tailwind.css`.
- Use Tailwind classes in React components.
- Prefer tokens through CSS variables for colors that must support themes.
- Keep logo usage centralized before the UI grows.

