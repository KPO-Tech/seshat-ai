"""Logo de KPO-Tech : la marque mère (ombrelle informelle de tous les projets tech), distincte de la rosette Seshat.

Trois pistes, avec un lien de parenté léger avec le logo Seshat (traits arrondis, nœuds, orange, charbon) :
  KPO1-logotype   le nom seul, « KPO » en gras, « Tech » plus léger, un nœud orange à la place du trait d'union
  KPO2-k-reseau   un K dessiné comme un graphe : une tige, deux bras, des nœuds
  KPO3-maison     un toit sur trois nœuds, dont un orange : la maison mère de plusieurs projets
Couleurs : mark.py. Le texte des logotypes est écrit avec la police web (Space Grotesk) ; il sera vectorisé
quand le fichier de police aura été téléchargé.
"""
from pathlib import Path

import appicons as a
import mark as g
from render import pretty_svg

ROOT = Path(__file__).resolve().parent.parent


def _stroke(color, w=6):
    return f'stroke="{color}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" fill="none"'


def _node(x, y, r, fill):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>'


def k_reseau(line, acc):
    """Un K dessiné comme un graphe : tige et deux bras, nœud orange à la jonction."""
    return (f'<path d="M32,22 V78 M32,50 L66,22 M32,50 L66,78" {_stroke(line)}/>'
            + _node(32, 50, 7, acc) + _node(66, 22, 5, line) + _node(66, 78, 5, line))


def maison(line, acc):
    """Un toit sur trois nœuds reliés ; le nœud orange est un projet (Seshat)."""
    return (f'<path d="M16,50 L50,20 L84,50" {_stroke(line)}/>'
            f'<path d="M27,44 V80 H73 V44" {_stroke(line)}/>'
            f'<g stroke="{line}" stroke-width="2.6" stroke-linecap="round" opacity=".7">'
            '<line x1="50" y1="54" x2="38" y2="68"/><line x1="50" y1="54" x2="62" y2="68"/>'
            '<line x1="38" y1="68" x2="62" y2="68"/></g>'
            + _node(50, 54, 6, acc) + _node(38, 68, 4.4, line) + _node(62, 68, 4.4, line))


# nom -> (description, fonction du glyphe ou None pour le logotype seul)
OPTIONS = {
    "KPO1-logotype": ("Le nom seul : « KPO » en gras, « Tech » plus léger, un nœud orange à la place du trait d'union.", None),
    "KPO2-k-reseau": ("Un K dessiné comme un graphe : une tige, deux bras, des nœuds ; le nœud de jonction est orange.", k_reseau),
    "KPO3-maison": ("Un toit sur trois nœuds, dont un orange : la maison mère de plusieurs projets.", maison),
}


def variants(name):
    """Glyphes SVG d'une piste (vide pour le logotype seul)."""
    fn = OPTIONS[name][1]
    if fn is None:
        return {}

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
        v = variants(name)
        if not v:
            continue
        out = ROOT / "logo" / "kpo-tech" / name
        out.mkdir(parents=True, exist_ok=True)
        for vname, content in v.items():
            (out / f"{vname}.svg").write_text(pretty_svg(content), encoding="utf-8")
        print("logo/kpo-tech", name)


if __name__ == "__main__":
    main()
