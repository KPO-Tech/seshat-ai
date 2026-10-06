"""Logo du runtime seshat (CLI, TUI, SDK) : le logo principal avec une variation « développeurs ».

Trois pistes, dérivées de mark.reseau_inner (stalk=False pour libérer le bas) :
  Sh1-invite      la tige devient une invite de terminal « > _ » sous la rosette
  Sh2-terminal    la rosette dans une fenêtre de terminal (barre de titre à trois points)
  Sh3-chevrons    l'arc devient deux chevrons « < > » dont les pointes portent les nœuds
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


def _terminal(color, accent):
    frame = (f'<rect x="4" y="6" width="92" height="88" rx="12" fill="none" stroke="{color}" stroke-width="3.6"/>'
             f'<path d="M4,26 H96" stroke="{color}" stroke-width="3" opacity=".85"/>'
             f'<circle cx="16" cy="16" r="2.8" fill="{accent}"/><circle cx="26" cy="16" r="2.8" fill="{color}"/>'
             f'<circle cx="36" cy="16" r="2.8" fill="{color}"/>')
    rosette = g.reseau_inner(color, accent, stalk=False)
    return frame + f'<g transform="translate(19 37) scale(.62)">{rosette}</g>'


# nom -> (description, viewBox de la marque seule, corps(arc, accent), centre vertical pour la tuile)
OPTIONS = {
    "Sh1-invite": ("La tige devient une invite de terminal « > _ » sous la rosette.",
                   "6 0 88 96",
                   lambda c, k: g.reseau_inner(c, k, stalk=False) + _prompt(c, k), 48),
    "Sh2-terminal": ("La rosette dans une fenêtre de terminal à trois points.",
                     "0 2 100 96",
                     _terminal, 50),
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


def main():
    for name in OPTIONS:
        out = ROOT / "logo" / "runtime" / name
        out.mkdir(parents=True, exist_ok=True)
        for vname, content in variants(name).items():
            (out / f"{vname}.svg").write_text(pretty_svg(content), encoding="utf-8")
        print("runtime", name)


if __name__ == "__main__":
    main()
