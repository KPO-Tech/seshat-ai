"""The website's palette, generated from the kit's tokens.

The site keeps no colour of its own: `website/src/styles/tokens.css` is a copy the
kit writes, exactly like the logos. Change a token, run
`python publish.py --apply --repo seshat-ai`, and the pages follow;
`python publish.py --check` fails when the site has drifted.

Every value is a token, or a mix of two of them. The single exception is the card
surface: no token is lighter than paper, and the brand avoids plain white, so it
is declared here once.

The retired colours at the bottom are the ones the site used before this file
existed. tests/test_kit.py checks that none of them has come back.
"""
from __future__ import annotations

from . import tokens as t

CARD = "#FFFCF8"                        # a card is lighter than the page; never pure white

_DARK = t.INK_STOPS[0][1]               # the dark stop of the structural gradient
_STROKE = t.INK_STOPS[1][1]             # its light stop
_ON_DARK = t.INK_STOPS_ON_DARK[0][1]    # the lightest text on a dark surface

# What the site used before its palette came from the kit: the previous orange, the
# old light orange for dark surfaces, the cold greys of the light theme and the whole
# of the previous dark theme. None of these is a token today, so finding one in the
# site means a colour was written by hand instead of taken from here.
RETIRED = (
    "#ef7c2f", "239, 124, 47",          # the orange before ORANGE
    "#a94a0a", "#d7691f", "169, 74, 10",  # its shades
    "#f29a5a",                            # the light orange before ORANGE_LIGHT
    "#2f2e34", "#1f1b16", "#5e564c",      # ink, text, secondary text
    "#ede6db", "#e3dacd",                # the band and the hairline, now derived
    "#4a4850", "#14131a", "#0e0d12",      # cold darks in the diagrams
    "#1d1c21", "#25242a", "#2a292f", "#3a383f", "#121115", "#17161a",  # the old dark theme
    "#ece7df", "#6f6a73",                # and its text greys
)


def _mix(colour: str, share: int, other: str) -> str:
    """A CSS mix: `share` percent of `colour`, the rest `other`."""
    return f"color-mix(in srgb, {colour} {share}%, {other})"


def _shadow(ink: str, near: int, far: int) -> str:
    """Two stacked shadows tinted by `ink`: one tight, one wide."""
    return (f"0 1px 2px {_mix(ink, near, 'transparent')}, "
            f"0 8px 24px {_mix(ink, far, 'transparent')}")


def css() -> str:
    """The stylesheet the site imports before every other one."""
    return f"""/* Généré par kit/palette.py depuis kit/tokens.py. Ne pas modifier à la main. */

/* La palette du kit, telle quelle. */
:root {{
  --orange: {t.ORANGE};
  --orange-light: {t.ORANGE_LIGHT};
  --orange-deep: {t.ORANGE_DEEP};
  --orange-text: {t.ORANGE_TEXT};
  --ink: {t.INK};
  --charcoal: {t.CHARCOAL};
  --grey: {t.GREY};
  --paper: {t.PAPER};
  --cream: {t.CREAM};
  --tile-dark: {t.TILE_DARK};
  --off-white: {t.OFF_WHITE};
  --black: {t.BLACK};
  --ink-on-dark: {_ON_DARK};
  --grey-on-dark: {t.GREY_ON_DARK};
}}

/* Ce que les pages utilisent : une couleur, du papier, des gris. */
:root {{
  color-scheme: light;
  --bg: var(--paper);
  --band: {_mix('var(--cream)', 55, 'var(--paper)')};
  --surface: {CARD};
  --line: {_mix('var(--cream)', 96, 'var(--ink)')};
  --text: var(--ink);
  --text2: var(--grey);
  --accent: var(--orange);
  --accent-text: var(--orange-text);
  --on-accent: var(--ink);
  --panel: var(--tile-dark);
  --on-panel: var(--ink-on-dark);
  --on-panel2: var(--grey-on-dark);
  --code-bg: {_mix('var(--cream)', 45, 'var(--paper)')};
  --shadow: {_shadow('var(--ink)', 6, 6)};
}}

/* Le thème sombre : la page s'assombrit, l'orange monte d'un cran. */
:root[data-theme='dark'] {{
  color-scheme: dark;
  --bg: {_mix('var(--tile-dark)', 55, 'var(--black)')};
  --band: {_mix('var(--surface)', 40, 'var(--bg)')};
  --surface: var(--tile-dark);
  --line: {_STROKE};
  --text: var(--off-white);
  --text2: var(--grey-on-dark);
  --accent: var(--orange-light);
  --accent-text: var(--orange-light);
  --panel: {_mix('var(--bg)', 55, 'var(--black)')};
  --code-bg: {_mix('var(--bg)', 55, 'var(--black)')};
  --shadow: {_shadow('var(--black)', 30, 25)};
}}
"""
