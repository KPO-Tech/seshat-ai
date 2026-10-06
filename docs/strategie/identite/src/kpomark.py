"""Logo officiel de KPO-Tech : la marque mère (ombrelle informelle de tous les projets tech).

Retenu le 2026-10-06 : sept cellules en nid d'abeille, une cellule orange (le projet Seshat) ; sept, comme
la déesse. Il dit « groupe » (un nid de cellules) et « tech » (l'hexagone), reste neutre (pas la rosette de
Seshat) et garde un lien de parenté léger avec elle : charbon, orange, traits arrondis. Le nom s'écrit en
dessous sous la forme du domaine, « kpo.tech », dont le point est le nœud orange.
Les autres pistes explorées (grille de points en K, K dans un hexagone, et un premier jeu logotype, K en
réseau, maison) ont été abandonnées ; elles restent dans l'historique git.
Couleurs : mark.py. Le texte « kpo.tech » est écrit avec la police web (Space Grotesk) ; il sera vectorisé
quand le fichier de police aura été téléchargé.
"""
import math
from pathlib import Path

import appicons as a
import mark as g
from render import pretty_svg

ROOT = Path(__file__).resolve().parent.parent
VIEWBOX = "10 10 80 80"


def _hex(cx, cy, r):
    """Hexagone à pointe en haut, centré en (cx, cy), de rayon r."""
    pts = [(cx + r * math.cos(math.radians(-90 + 60 * k)), cy + r * math.sin(math.radians(-90 + 60 * k)))
           for k in range(6)]
    return "M" + " L".join("%.2f,%.2f" % p for p in pts) + " Z"


def cellules(line, accent, bold=False):
    """Sept cellules qui se touchent par un côté ; celle du centre est pleine et orange."""
    r = 14
    d = r * math.sqrt(3)
    w = 5.4 if bold else 3.6
    centers = [(50, 50)] + [(50 + d * math.cos(math.radians(60 * k)), 50 + d * math.sin(math.radians(60 * k)))
                            for k in range(6)]
    out = []
    for i, (cx, cy) in enumerate(centers):
        if i == 0:
            out.append(f'<path d="{_hex(cx, cy, r)}" fill="{accent}" stroke="{accent}" '
                       f'stroke-width="3" stroke-linejoin="round"/>')
        else:
            out.append(f'<path d="{_hex(cx, cy, r)}" fill="none" stroke="{line}" stroke-width="{w}" '
                       f'stroke-linecap="round" stroke-linejoin="round"/>')
    return "".join(out)


def official_variants():
    """Variantes officielles du symbole de KPO-Tech (le nom « kpo.tech » s'écrit dessous, voir pages.py)."""
    def tile(body, fill, border=None, scale=0.8):
        stroke = f' stroke="{border}" stroke-width="2"' if border else ""
        return g.svg("0 0 100 100", f'<rect x="1" y="1" width="98" height="98" rx="21" fill="{fill}"{stroke}/>'
                     f'<g transform="translate(50 50) scale({scale}) translate(-50 -50)">{body}</g>')
    return {
        "on-light": g.svg(VIEWBOX, cellules(a.CHAR, a.ORANGE_DEEP)),
        "on-dark": g.svg(VIEWBOX, cellules(a.CREAM, a.ORANGE)),
        "mono-black": g.svg(VIEWBOX, cellules("#000000", "#000000")),
        "mono-white": g.svg(VIEWBOX, cellules("#FFFFFF", "#FFFFFF")),
        "icon-dark": tile(cellules(a.CREAM, a.ORANGE), a.CHAR),
        "icon-light": tile(cellules(a.CHAR, a.ORANGE_DEEP), a.PAPER, a.PAPER_BORDER),
        "favicon": tile(cellules(a.CREAM, a.ORANGE, bold=True), a.CHAR, scale=0.9),
    }


def main():
    out = ROOT / "logo" / "kpo-tech" / "kpotech"
    out.mkdir(parents=True, exist_ok=True)
    for name, content in official_variants().items():
        (out / f"{name}.svg").write_text(pretty_svg(content), encoding="utf-8")
    print("logo/kpo-tech/kpotech")


if __name__ == "__main__":
    main()
