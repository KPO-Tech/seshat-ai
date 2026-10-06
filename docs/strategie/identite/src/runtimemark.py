"""Logo officiel du runtime seshat (CLI, TUI, SDK) : la rosette du logo principal dans une fenêtre de terminal.

Retenu le 2026-10-06. Les autres pistes explorées (invite « > _ », chevrons « < > ») ont été
abandonnées ; elles restent dans l'historique git. Dérivé de mark.reseau_inner (sans tige).
Couleurs : mark.py (alignées sur seshat-desktop).
"""
from pathlib import Path

import appicons as a
import mark as g
from render import pretty_svg

ROOT = Path(__file__).resolve().parent.parent
TERMINAL_VIEWBOX = "0 2 100 96"


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


def official_variants():
    """Variantes officielles du logo du runtime seshat."""
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
    out = ROOT / "logo" / "runtime" / "seshat"
    out.mkdir(parents=True, exist_ok=True)
    for name, content in official_variants().items():
        (out / f"{name}.svg").write_text(pretty_svg(content), encoding="utf-8")
    print("logo/runtime/seshat")


if __name__ == "__main__":
    main()
