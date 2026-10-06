"""Logo officiel de SeshatCloud : le logo principal (rosette, style reseau) sous un arc en bord de nuage.

Retenu le 2026-10-06 : l'arc devient un bord de nuage à trois bosses. Les autres pistes explorées
(second arc plus large, halo de nœuds) ont été abandonnées ; elles restent dans l'historique git.
Couleurs : mark.py (alignées sur seshat-desktop).
"""
from pathlib import Path

import appicons as a
import mark as g
from render import pretty_svg

ROOT = Path(__file__).resolve().parent.parent

# Arc en bord de nuage : mêmes pieds que l'arc du logo, trois bosses au-dessus de la rosette.
CLOUD_BOW = ("M13,46 C9,34 14,25 24,25 C26,13 42,8 50,16 C58,8 74,13 76,25 "
             "C86,25 91,34 87,46")
CLOUD_VIEWBOX = "6 0 88 88"


def cloud_mark(arc, accent, bold=False):
    """La rosette sous un arc en bord de nuage à trois bosses."""
    return g.reseau_inner(arc, accent, bold=bold, bow=CLOUD_BOW)


def official_variants():
    """Variantes officielles du logo de SeshatCloud."""
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
    out = ROOT / "logo" / "cloud" / "seshatcloud"
    out.mkdir(parents=True, exist_ok=True)
    for name, content in official_variants().items():
        (out / f"{name}.svg").write_text(pretty_svg(content), encoding="utf-8")
    print("logo/cloud/seshatcloud")


if __name__ == "__main__":
    main()
