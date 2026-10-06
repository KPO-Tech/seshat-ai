"""Logo du runtime seshat (CLI, TUI, SDK) : le logo principal avec une variation « développeurs ».

RETENU (2026-10-06) : Sh2, la rosette dans une fenêtre de terminal à trois points
(terminal() ci-dessous, variantes officielles dans official_variants()).
Pistes écartées, conservées dans OPTIONS : Sh1 (invite « > _ ») et Sh3 (chevrons « < > »).
Toutes dérivent de mark.reseau_inner (stalk=False pour libérer le bas).
Couleurs : mark.py (alignées sur seshat-desktop).
"""
from pathlib import Path

import appicons as a
import mark as g
from render import pretty_svg

ROOT = Path(__file__).resolve().parent.parent

# deux chevrons de code ; leurs pointes tombent sur les nœuds EMB_FEET (13,46) et (87,46)
CHEVRONS = "M25,26 L13,46 L25,66 M75,26 L87,46 L75,66"


def _prompt(color, accent):
    return (f'<path d="M34,73 L45,81 L34,89" fill="none" stroke="{accent}" stroke-width="4.2" '
            f'stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="M53,89 H69" fill="none" stroke="{color}" stroke-width="4.2" stroke-linecap="round"/>')


def terminal(color, accent, small=False):
    """Rosette dans une fenêtre de terminal. `small` : traits renforcés, sans les points, pour 16 et 32 px."""
    if small:
        frame = (f'<rect x="5" y="7" width="90" height="86" rx="13" fill="none" stroke="{color}" stroke-width="6"/>'
                 f'<path d="M5,29 H95" stroke="{color}" stroke-width="5"/>'
                 f'<circle cx="19" cy="18" r="3.6" fill="{accent}"/>')
        rosette = g.reseau_inner(color, accent, bold=True, stalk=False)
        return frame + f'<g transform="translate(12 31) scale(.76)">{rosette}</g>'
    frame = (f'<rect x="4" y="6" width="92" height="88" rx="12" fill="none" stroke="{color}" stroke-width="3.6"/>'
             f'<path d="M4,26 H96" stroke="{color}" stroke-width="3" opacity=".85"/>'
             f'<circle cx="16" cy="16" r="2.8" fill="{accent}"/><circle cx="26" cy="16" r="2.8" fill="{color}"/>'
             f'<circle cx="36" cy="16" r="2.8" fill="{color}"/>')
    rosette = g.reseau_inner(color, accent, stalk=False)
    # rosette agrandie : elle remplit la largeur intérieure de la fenêtre
    return frame + f'<g transform="translate(7.5 29.5) scale(.85)">{rosette}</g>'


# nom -> (description, viewBox de la marque seule, corps(arc, accent), centre vertical pour la tuile)
OPTIONS = {
    "Sh1-invite": ("La tige devient une invite de terminal « > _ » sous la rosette.",
                   "6 0 88 96",
                   lambda c, k: g.reseau_inner(c, k, stalk=False) + _prompt(c, k), 48),
    "Sh3-chevrons": ("L'arc devient deux chevrons « < > » dont les pointes portent les nœuds.",
                     "6 0 88 88",
                     lambda c, k: g.reseau_inner(c, k, bow=CHEVRONS, stalk=False), 44),
}


def _tile(body, cy):
    return g.svg("0 0 100 100", f'<rect x="1" y="1" width="98" height="98" rx="21" fill="{a.CHAR}"/>'
                 f'<g transform="translate(50 50) scale(0.74) translate(-50 -{cy})">{body}</g>')


def variants(name):
    desc, vb, fn, cy = OPTIONS[name]
    return {
        "on-light": g.svg(vb, fn(a.CHAR, a.ORANGE_DEEP)),
        "on-dark": g.svg(vb, fn(a.CREAM, a.ORANGE)),
        "mono-black": g.svg(vb, fn("#000000", "#000000")),
        "icon-dark": _tile(fn(a.CREAM, a.ORANGE), cy),
    }


TERMINAL_VIEWBOX = "0 2 100 96"


def official_variants():
    """Variantes officielles du logo du runtime seshat (piste Sh2, terminal)."""
    def tile(body, fill, border=None):
        stroke = f' stroke="{border}" stroke-width="2"' if border else ""
        return g.svg("0 0 100 100", f'<rect x="1" y="1" width="98" height="98" rx="21" fill="{fill}"{stroke}/>'
                     f'<g transform="translate(50 50) scale(0.8) translate(-50 -50)">{body}</g>')
    return {
        "on-light": g.svg(TERMINAL_VIEWBOX, terminal(a.CHAR, a.ORANGE_DEEP)),
        "on-dark": g.svg(TERMINAL_VIEWBOX, terminal(a.CREAM, a.ORANGE)),
        "mono-black": g.svg(TERMINAL_VIEWBOX, terminal("#000000", "#000000")),
        "mono-white": g.svg(TERMINAL_VIEWBOX, terminal("#FFFFFF", "#FFFFFF")),
        "icon-dark": tile(terminal(a.CREAM, a.ORANGE), a.CHAR),
        "icon-light": tile(terminal(a.CHAR, a.ORANGE_DEEP), a.PAPER, a.PAPER_BORDER),
        "favicon": tile(terminal(a.CREAM, a.ORANGE, small=True), a.CHAR),
    }


def main():
    official = ROOT / "logo" / "runtime" / "seshat"
    official.mkdir(parents=True, exist_ok=True)
    for vname, content in official_variants().items():
        (official / f"{vname}.svg").write_text(pretty_svg(content), encoding="utf-8")
    print("runtime officiel (Sh2 terminal)")
    for name in OPTIONS:
        out = ROOT / "logo" / "runtime" / "explorations" / name
        out.mkdir(parents=True, exist_ok=True)
        for vname, content in variants(name).items():
            (out / f"{vname}.svg").write_text(pretty_svg(content), encoding="utf-8")
        print("runtime exploration", name)


if __name__ == "__main__":
    main()
