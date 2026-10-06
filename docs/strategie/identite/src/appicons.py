#!/usr/bin/env python3
"""Icônes des apps SeshatOS (famille).

Usage autonome (SVG seulement) : python src/appicons.py ; le kit complet : python build.py

Sorties :
  logo/apps/<app>/<variante>.svg        versions officielles (Knowledge = K1, Automation = A2)
La page d'aperçu (apercu/apps.html) est produite par build.py.
Les pistes écartées (K2 calame, K3 bibliothèque, A1 flux, A3 relecture) restent dans l'historique git.

Règles de la famille :
  1. même tuile arrondie pour toutes les apps ;
  2. un seul accent, l'orange ; la forme distingue les apps, pas la couleur ;
  3. glyphe simple en traits arrondis et en nœuds, comme le logo Seshat.
Couleurs : mark.py (alignées sur seshat-desktop).

Variantes officielles par app :
  icon-dark     tuile charbon, glyphe crème + orange            (usage principal)
  icon-light    tuile papier chaud, glyphe charbon + orange profond
  icon-orange   tuile orange, glyphe charbon + crème
  glyph-on-dark / glyph-on-light   glyphe seul, fond transparent
  mono-black / mono-white          une seule couleur
  favicon       tuile charbon, traits renforcés et détails réduits (16 et 32 px)
"""
import math
from pathlib import Path

import mark as g

ROOT = Path(__file__).resolve().parent.parent
# Une seule source pour les couleurs : mark.py (alignées sur seshat-desktop)
CHAR, PAPER = g.INK, g.PAPER
ORANGE = g.PALETTES["orange"]["accent"]
ORANGE_DEEP = g.PALETTES["orange"]["accent_deep"]
CREAM, PAPER_BORDER, CREAM_LIGHT = "#E7E2DA", "#E3DACD", "#FFFCF8"
VIEWBOX_GLYPH = "10 10 80 80"


# --- OUTILS ---------------------------------------------------------------
def svg(viewbox, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" role="img" '
            f'aria-label="icône">{body}</svg>')


def tile(body, fill=CHAR, border=None):
    stroke = f' stroke="{border}" stroke-width="2"' if border else ""
    return svg("0 0 100 100", f'<rect x="1" y="1" width="98" height="98" rx="21" fill="{fill}"{stroke}/>{body}')


def node(x, y, r, fill):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>'


def stroke(color, w):
    return f'stroke="{color}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" fill="none"'


# --- K1 : LIVRE-GRAPHE (Knowledge) ---------------------------------------------
PAGE_L = "M50,72 C41,65 28,64 18,68 L18,32 C28,28 41,29 50,36 Z"
PAGE_R = "M50,72 C59,65 72,64 82,68 L82,32 C72,28 59,29 50,36 Z"


def k1(line, acc, small=False):
    w = 6.5 if small else 4.5
    out = [f'<path d="{PAGE_L}" {stroke(line, w)}/>', f'<path d="{PAGE_R}" {stroke(line, w)}/>']
    if small:
        out.append(node(50, 52, 8, acc))
        return "".join(out)
    out.append(f'<g stroke="{line}" stroke-width="2.4" stroke-linecap="round" opacity=".75">'
               '<line x1="50" y1="52" x2="31" y2="46"/><line x1="50" y1="52" x2="69" y2="46"/>'
               '<line x1="50" y1="52" x2="34" y2="58"/><line x1="50" y1="52" x2="66" y2="58"/></g>')
    out.append(node(50, 52, 5.2, acc))
    out += [node(x, y, 3.4, acc) for x, y in ((31, 46), (69, 46), (34, 58), (66, 58))]
    return "".join(out)


# --- A2 : POINT DE CONTRÔLE (Automation) ----------------------------------
# Deux branches Bézier cubiques de (26,50) à (74,50) passant par (56,32) ou (56,68).
def _bez(p, t):
    u = 1 - t
    return tuple(u**3 * p[0][i] + 3 * u**2 * t * p[1][i] + 3 * u * t**2 * p[2][i] + t**3 * p[3][i] for i in (0, 1))


def _split(p, t):
    """Sous-courbes [0,t] et [t,1] d'une Bézier cubique (de Casteljau)."""
    def lerp(a, b): return tuple(a[i] + (b[i] - a[i]) * t for i in (0, 1))
    p01, p12, p23 = lerp(p[0], p[1]), lerp(p[1], p[2]), lerp(p[2], p[3])
    p012, p123 = lerp(p01, p12), lerp(p12, p23)
    mid = lerp(p012, p123)
    return (p[0], p01, p012, mid), (mid, p123, p23, p[3])


def _cubic(p):
    return "C" + " ".join("%.2f,%.2f" % q for q in p[1:])


def _cut_at_radius(p, center, r, keep_start):
    """Raccourcit la courbe p pour qu'elle s'arrête (ou reparte) au bord du cercle."""
    lo, hi = 0.0, 1.0
    for _ in range(40):
        t = (lo + hi) / 2
        d = math.dist(_bez(p, t), center)
        if keep_start:
            lo, hi = (t, hi) if d > r else (lo, t)
        else:
            lo, hi = (lo, t) if d > r else (t, hi)
    t = (lo + hi) / 2
    first, second = _split(p, t)
    return first if keep_start else second


def a2(line, acc, small=False):
    w = 6.5 if small else 4.5
    ring_r = 9 if small else 7.5
    ring_c = (56, 32)
    # branche haute coupée de part et d'autre de l'anneau (le point de contrôle reste vide)
    up_a = ((26, 50), (40, 50), (40, 32), (56, 32))
    up_b = ((56, 32), (70, 32), (70, 50), (74, 50))
    a = _cut_at_radius(up_a, ring_c, ring_r + w / 2 - 1, True)
    b = _cut_at_radius(up_b, ring_c, ring_r + w / 2 - 1, False)
    out = [f'<path d="M26,50 {_cubic(a)}" {stroke(line, w)}/>',
           f'<path d="M{b[0][0]:.2f},{b[0][1]:.2f} {_cubic(b)}" {stroke(line, w)}/>',
           f'<path d="M26,50 C40,50 40,68 56,68 C70,68 70,50 74,50" {stroke(line, w)}/>',
           node(21, 50, 6 if small else 5, line),
           f'<circle cx="56" cy="32" r="{ring_r}" {stroke(acc, w)}/>']
    if not small:
        out.append(node(56, 68, 4.4, line))
    out.append(node(79, 50, 8 if small else 6.5, acc))
    return "".join(out)


GLYPHS = {"knowledge": ("Knowledge", k1, "K1 · livre-graphe"), "automation": ("Automation", a2, "A2 · point de contrôle")}


def variants(fn):
    return {
        "icon-dark": tile(fn(CREAM, ORANGE)),
        "icon-light": tile(fn(CHAR, ORANGE_DEEP), fill=PAPER, border=PAPER_BORDER),
        "icon-orange": tile(fn(CHAR, CREAM_LIGHT), fill=ORANGE),
        "glyph-on-dark": svg(VIEWBOX_GLYPH, fn(CREAM, ORANGE)),
        "glyph-on-light": svg(VIEWBOX_GLYPH, fn(CHAR, ORANGE_DEEP)),
        "mono-black": svg(VIEWBOX_GLYPH, fn("#000000", "#000000")),
        "mono-white": svg(VIEWBOX_GLYPH, fn("#FFFFFF", "#FFFFFF")),
        "favicon": tile(fn(CREAM, ORANGE, small=True)),
    }


def main():
    """Écrit les SVG des apps (lisibles). Les pages d'aperçu : build.py."""
    from render import pretty_svg
    for key, (label, fn, name) in GLYPHS.items():
        out = ROOT / "logo" / "apps" / key
        out.mkdir(parents=True, exist_ok=True)
        v = variants(fn)
        for vname, content in v.items():
            (out / f"{vname}.svg").write_text(pretty_svg(content), encoding="utf-8")
        print(key, len(v), "variantes")


if __name__ == "__main__":
    main()
