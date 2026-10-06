"""Logo de KPO-Tech : la marque mère (ombrelle informelle de tous les projets tech), distincte de la rosette Seshat.

Trois pistes qui disent « groupe » et « tech », avec un lien de parenté léger avec le logo Seshat
(charbon, orange, nœuds, traits arrondis). Le nom s'écrit en dessous sous la forme du domaine,
« kpo.tech », dont le point est le nœud orange.
  KPO1-grille     une grille de points dont certains dessinent un K : un groupe de points, un point orange
  KPO2-cellules   sept cellules en nid d'abeille, une cellule orange (le projet Seshat) ; sept, comme la déesse
  KPO3-hexagone   un K en réseau dans un hexagone (la puce, la cellule)
Couleurs : mark.py. Le texte « kpo.tech » est écrit avec la police web (Space Grotesk) ; il sera vectorisé
quand le fichier de police aura été téléchargé.
"""
import math
from pathlib import Path

import appicons as a
import mark as g
from render import pretty_svg

ROOT = Path(__file__).resolve().parent.parent


def _stroke(color, w=4.4):
    return f'stroke="{color}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" fill="none"'


def _node(x, y, r, fill, opacity=None):
    op = f' opacity="{opacity}"' if opacity is not None else ""
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"{op}/>'


def _hex(cx, cy, r):
    """Hexagone à pointe en haut, centré en (cx, cy), de rayon r."""
    pts = [(cx + r * math.cos(math.radians(-90 + 60 * k)), cy + r * math.sin(math.radians(-90 + 60 * k))) for k in range(6)]
    return "M" + " L".join("%.2f,%.2f" % p for p in pts) + " Z"


# --- KPO1 : une grille de points dont certains dessinent un K ----------------------------
def grille(line, acc):
    """Un K tracé (tige et bras reliés par des nœuds) posé sur une grille de points discrets."""
    xs, ys = (26, 41, 56, 71), (20, 35, 50, 65, 80)
    lit = {(26, y) for y in ys} | {(41, 35), (56, 20), (41, 65), (56, 80)}
    out = [_node(x, y, 2.2, line, opacity=0.3) for x in xs for y in ys if (x, y) not in lit]
    out.append(f'<path d="M26,20 V80 M26,50 L56,20 M26,50 L56,80" {_stroke(line, 3.4)}/>')
    for x, y in sorted(lit):
        out.append(_node(x, y, 4.4, acc if (x, y) == (26, 50) else line))
    return "".join(out)


# --- KPO2 : sept cellules, une orange -------------------------------------------------------
def cellules(line, acc):
    r, d = 14, 14 * math.sqrt(3)
    centers = [(50, 50)] + [(50 + d * math.cos(math.radians(60 * k)), 50 + d * math.sin(math.radians(60 * k)))
                            for k in range(6)]
    out = []
    for i, (cx, cy) in enumerate(centers):
        if i == 0:
            out.append(f'<path d="{_hex(cx, cy, r)}" fill="{acc}" stroke="{acc}" stroke-width="3" stroke-linejoin="round"/>')
        else:
            out.append(f'<path d="{_hex(cx, cy, r)}" {_stroke(line, 3.6)}/>')
    return "".join(out)


# --- KPO3 : un K en réseau dans un hexagone ------------------------------------------------------
def hexagone(line, acc):
    k = (f'<path d="M40,36 V64 M40,50 L58,36 M40,50 L58,64" {_stroke(line, 4.4)}/>'
         + _node(40, 50, 5.2, acc) + _node(58, 36, 3.8, line) + _node(58, 64, 3.8, line))
    return f'<path d="{_hex(50, 50, 38)}" {_stroke(line, 5)}/>' + k


# nom -> (description, fonction du glyphe)
OPTIONS = {
    "KPO1-grille": ("Une grille de points dont certains dessinent un K : un groupe de points, un point orange.", grille),
    "KPO2-cellules": ("Sept cellules en nid d'abeille, dont une orange (le projet Seshat) ; sept, comme la déesse.", cellules),
    "KPO3-hexagone": ("Un K en réseau dans un hexagone : la puce, la cellule, le nœud de jonction orange.", hexagone),
}


def variants(name):
    fn = OPTIONS[name][1]

    def tile(body):
        return g.svg("0 0 100 100", f'<rect x="1" y="1" width="98" height="98" rx="21" fill="{a.CHAR}"/>'
                     f'<g transform="translate(50 50) scale(0.8) translate(-50 -50)">{body}</g>')
    return {
        "on-light": g.svg("10 10 80 80", fn(a.CHAR, a.ORANGE_DEEP)),
        "on-dark": g.svg("10 10 80 80", fn(a.CREAM, a.ORANGE)),
        "mono-black": g.svg("10 10 80 80", fn("#000000", "#000000")),
        "icon-dark": tile(fn(a.CREAM, a.ORANGE)),
    }


def main():
    for name in OPTIONS:
        out = ROOT / "logo" / "kpo-tech" / name
        out.mkdir(parents=True, exist_ok=True)
        for vname, content in variants(name).items():
            (out / f"{vname}.svg").write_text(pretty_svg(content), encoding="utf-8")
        print("logo/kpo-tech", name)


if __name__ == "__main__":
    main()
