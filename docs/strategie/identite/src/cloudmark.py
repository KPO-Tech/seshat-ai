"""Logo de SeshatCloud : le logo principal (rosette, style reseau) avec une variation « nuage ».

RETENU (2026-10-06) : Cl3, l'arc devient un bord de nuage à trois bosses (cloud_mark() ci-dessous,
variantes officielles dans official_variants()).
Pistes écartées, conservées dans OPTIONS : Cl1 (second arc plus large, des couches) et
Cl2 (arc de nœuds, un ensemble d'organisations).
Toutes dérivent de mark.reseau_inner.
Couleurs : celles du desktop (voir appicons.py).
"""
import math
from pathlib import Path

import appicons as a
import mark as g
from render import pretty_svg

ROOT = Path(__file__).resolve().parent.parent

# Arc en bord de nuage : mêmes pieds que l'arc du logo, bosses au-dessus de la rosette.
CLOUD_BOW = ("M13,46 C9,34 14,25 24,25 C26,13 42,8 50,16 C58,8 74,13 76,25 "
             "C86,25 91,34 87,46")


def _outer_arc(arc, accent):
    path = "M4,52 C1,14 28,-8 50,-8 C72,-8 99,14 96,52"
    return (f'<path d="{path}" fill="none" stroke="{arc}" stroke-width="2.4" stroke-linecap="round" opacity=".85"/>'
            f'<circle cx="4" cy="52" r="3.4" fill="{accent}"/><circle cx="96" cy="52" r="3.4" fill="{accent}"/>')


def _halo(arc, accent):
    dots = []
    n = 9
    for i in range(n):
        ang = math.radians(196 + i * (148 / (n - 1)))
        x, y = 50 + 47 * math.cos(ang), 49 + 56 * math.sin(ang)
        r = 3.6 if i in (0, n // 2, n - 1) else 2.6
        dots.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r}" fill="{accent if i % 2 == 0 else arc}"/>')
    return "".join(dots)


# nom -> (description, viewBox de la marque seule, corps(arc, accent), centre vertical pour la tuile)
OPTIONS = {
    "Cl1-double-arc": ("Un second arc plus large au-dessus, avec des nœuds à ses pieds : des couches.",
                       "-2 -14 104 104",
                       lambda arc, acc: _outer_arc(arc, acc) + g.reseau_inner(arc, acc), 38),
    "Cl2-halo": ("Un arc de nœuds autour de l'arc du logo : un ensemble d'organisations.",
                 "-2 -14 104 104",
                 lambda arc, acc: _halo(arc, acc) + g.reseau_inner(arc, acc), 38),
}


def _svg(viewbox, body):
    return g.svg(viewbox, body)


def _tile(body, cy, fill=a.CHAR):
    return g.svg("0 0 100 100", f'<rect x="1" y="1" width="98" height="98" rx="21" fill="{fill}"/>'
                 f'<g transform="translate(50 50) scale(0.74) translate(-50 -{cy})">{body}</g>')


def variants(name):
    desc, vb, fn, cy = OPTIONS[name]
    return {
        "on-light": _svg(vb, fn(a.CHAR, a.ORANGE_DEEP)),
        "on-dark": _svg(vb, fn(a.CREAM, a.ORANGE)),
        "mono-black": _svg(vb, fn("#000000", "#000000")),
        "icon-dark": _tile(fn(a.CREAM, a.ORANGE), cy),
    }


def cloud_mark(arc, accent, bold=False):
    """Logo officiel : la rosette sous un arc en bord de nuage à trois bosses."""
    return g.reseau_inner(arc, accent, bold=bold, bow=CLOUD_BOW)


CLOUD_VIEWBOX = "6 0 88 88"


def official_variants():
    """Variantes officielles du logo de SeshatCloud (piste Cl3, arc-nuage)."""
    def tile(body, fill, border=None, scale=0.74):
        stroke = f' stroke="{border}" stroke-width="2"' if border else ""
        return g.svg("0 0 100 100", f'<rect x="1" y="1" width="98" height="98" rx="21" fill="{fill}"{stroke}/>'
                     f'<g transform="translate(50 50) scale({scale}) translate(-50 -44)">{body}</g>')
    return {
        "on-light": g.svg(CLOUD_VIEWBOX, cloud_mark(a.CHAR, a.ORANGE_DEEP)),
        "on-dark": g.svg(CLOUD_VIEWBOX, cloud_mark(a.CREAM, a.ORANGE)),
        "mono-black": g.svg(CLOUD_VIEWBOX, cloud_mark("#000000", "#000000")),
        "mono-white": g.svg(CLOUD_VIEWBOX, cloud_mark("#FFFFFF", "#FFFFFF")),
        "icon-dark": tile(cloud_mark(a.CREAM, a.ORANGE), a.CHAR),
        "icon-light": tile(cloud_mark(a.CHAR, a.ORANGE_DEEP), a.PAPER, a.PAPER_BORDER),
        "favicon": tile(cloud_mark(a.CREAM, a.ORANGE, bold=True), a.CHAR, scale=0.84),
    }


def main():
    official = ROOT / "logo" / "cloud" / "seshatcloud"
    official.mkdir(parents=True, exist_ok=True)
    for vname, content in official_variants().items():
        (official / f"{vname}.svg").write_text(pretty_svg(content), encoding="utf-8")
    print("cloud officiel (Cl3 arc-nuage)")
    for name in OPTIONS:
        out = ROOT / "logo" / "cloud" / "explorations" / name
        out.mkdir(parents=True, exist_ok=True)
        for vname, content in variants(name).items():
            (out / f"{vname}.svg").write_text(pretty_svg(content), encoding="utf-8")
        print("cloud exploration", name)


if __name__ == "__main__":
    main()
