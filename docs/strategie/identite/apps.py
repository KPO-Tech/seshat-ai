#!/usr/bin/env python3
"""Icônes des apps SeshatOS (famille).

Usage : python apps.py

Sorties :
  logo/apps/<app>/<variante>.svg        versions officielles (Knowledge = K1, Automation = A2)
  logo/apps/explorations/<app>/*.svg    pistes écartées, conservées pour mémoire
  apps-kit.html                         aperçu des versions officielles
  apps.html                             aperçu des pistes explorées

Règles de la famille :
  1. même tuile arrondie pour toutes les apps ;
  2. un seul accent, l'orange ; la forme distingue les apps, pas la couleur ;
  3. glyphe simple en traits arrondis et en nœuds, comme le logo Seshat.
Couleurs : celles du desktop (seshat-desktop, tailwind.css) et du papier chaud proposé.

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

import generate as g

HERE = Path(__file__).parent
CHAR, CREAM, ORANGE = "#2F2E34", "#E7E2DA", "#EF7C2F"
PAPER, PAPER_BORDER, ORANGE_DEEP, CREAM_LIGHT = "#F6F1EA", "#E3DACD", "#C2570C", "#FFFCF8"
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


# --- PISTES EXPLORÉES (conservées pour mémoire) -------------------------------
S = stroke(CREAM, 4.5)
O = f'fill="{ORANGE}"'
EXPLORATIONS = {
    "knowledge": {
        "K2-calame": ("Le calame du scribe trace un lien jusqu'à un nœud (ressemble à un pinceau)",
                      f'<line x1="74" y1="22" x2="50" y2="52" stroke="{CREAM}" stroke-width="7" stroke-linecap="round"/>'
                      f'<path d="M51,50 L42,63 L56,57 Z" {O} stroke="{ORANGE}" stroke-width="2" stroke-linejoin="round"/>'
                      f'<path d="M42,63 C34,72 30,66 25,75" stroke="{ORANGE}" stroke-width="3.6" stroke-linecap="round" fill="none"/>'
                      + node(24, 77, 5, ORANGE)),
        "K3-bibliotheque": ("Tranches de livres sous un arc (se lit comme un graphique en barres)",
                            f'<rect x="22" y="44" width="15" height="34" rx="3" {S}/>'
                            f'<rect x="42.5" y="32" width="15" height="46" rx="3" {S}/>'
                            f'<rect x="63" y="40" width="15" height="38" rx="3" {S}/>'
                            f'<path d="M20,26 Q50,8 80,26" {S}/>' + node(50, 46, 4.6, ORANGE)),
    },
    "automation": {
        "A1-flux": ("Flux de trois étapes dont celle en cours est orange (proche d'un organigramme)",
                    f'<path d="M24,66 L50,34 L76,66" {S}/>'
                    f'<rect x="15" y="57" width="18" height="18" rx="4" fill="{CHAR}" stroke="{CREAM}" stroke-width="4.5"/>'
                    f'<rect x="67" y="57" width="18" height="18" rx="4" fill="{CHAR}" stroke="{CREAM}" stroke-width="4.5"/>'
                    + node(50, 34, 10, ORANGE) + f'<path d="M46.5,29.5 L56,34 L46.5,38.5 Z" fill="{CHAR}"/>'),
        "A3-relecture": ("Frise d'exécution avec tête de lecture (ressemble à une épingle)",
                         f'<path d="M18,66 H82" {S}/>' + node(24, 66, 5.4, ORANGE) + node(42, 66, 5.4, ORANGE)
                         + f'<circle cx="60" cy="66" r="5.4" fill="{CHAR}" stroke="{CREAM}" stroke-width="3.6"/>'
                         + f'<circle cx="78" cy="66" r="5.4" fill="{CHAR}" stroke="{CREAM}" stroke-width="3.6"/>'
                         + f'<line x1="60" y1="38" x2="60" y2="60" stroke="{ORANGE}" stroke-width="4" stroke-linecap="round"/>'
                         + f'<path d="M52,28 L68,28 L60,40 Z" {O} stroke="{ORANGE}" stroke-width="2" stroke-linejoin="round"/>'),
    },
}

CSS = (
    "*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:#F6F1EA;color:#1F1B16;padding:28px 16px 60px}"
    ".wrap{max-width:1100px;margin:auto}h1{font-size:24px;margin:0 0 6px}h2{font-size:19px;margin:34px 0 12px}h3{font-size:13px;margin:0 0 10px}"
    "p{margin:0 0 12px;color:#5E564C;font-size:13px;line-height:1.45}"
    ".g{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}"
    ".c{border-radius:14px;padding:14px;border:1px solid #E3DACD;background:#FFFCF8;display:flex;flex-direction:column;gap:10px;align-items:flex-start}"
    ".c.dk{background:#2F2E34;border-color:#2F2E34;color:#E7E2DA}.c.or{background:#EF7C2F;border-color:#EF7C2F}.c small{font-size:11px;opacity:.7}"
    ".c svg{width:104px;height:104px}.sz{display:flex;gap:12px;align-items:end}.sz svg.b{width:56px;height:56px}.sz svg.c32{width:32px;height:32px}.sz svg.c16{width:16px;height:16px}"
    ".ctx{display:flex;gap:10px;margin-top:6px;flex-wrap:wrap}.chip{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;font-size:13px;font-weight:600}"
    ".chip svg{width:34px;height:34px}.cl{background:#fff;border:1px solid #E3DACD}.cd{background:#2F2E34;color:#E7E2DA}"
    ".gx{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}.gx .c svg.a{width:112px;height:112px}"
)


def cls(s, name):
    return s.replace("<svg", f'<svg class="{name}"', 1)


def card(name, body, kind=""):
    return f'<div class="c {kind}"><h3>{name}</h3>{body}</div>'


def page(title, intro, sections):
    return ('<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{title}</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">'
            f'<style>{CSS}</style><div class="wrap"><h1>{title}</h1><p>{intro}</p>{sections}</div></html>')


def main():
    family = tile(f'<g transform="translate(50 50) scale(0.8) translate(-50 -43)">{g.reseau_inner(CREAM, ORANGE)}</g>')
    official = []
    for key, (label, fn, name) in GLYPHS.items():
        out = HERE / "logo" / "apps" / key
        out.mkdir(parents=True, exist_ok=True)
        v = variants(fn)
        for vname, content in v.items():
            (out / f"{vname}.svg").write_text(content, encoding="utf-8")
        d = v
        cards = [
            card("icon-dark", f'{d["icon-dark"]}<small>Usage principal</small>'),
            card("icon-light", f'{d["icon-light"]}<small>Fond clair</small>'),
            card("icon-orange", f'{d["icon-orange"]}<small>Tuile orange</small>'),
            card("glyph-on-light", f'{d["glyph-on-light"]}<small>Glyphe seul, fond clair</small>'),
            card("glyph-on-dark", f'{d["glyph-on-dark"]}<small>Glyphe seul, fond sombre</small>', "dk"),
            card("mono-black", f'{d["mono-black"]}<small>Monochrome noir</small>'),
            card("mono-white", f'{d["mono-white"]}<small>Monochrome blanc</small>', "dk"),
            card("favicon", f'<div class="sz">{cls(d["favicon"], "b")}{cls(d["favicon"], "c32")}{cls(d["favicon"], "c16")}</div>'
                            '<small>Favicon 56, 32 et 16 px (traits renforcés)</small>'),
        ]
        chips = (f'<div class="ctx"><div class="chip cl">{cls(d["icon-dark"], "x")}{label}</div>'
                 f'<div class="chip cd">{cls(d["icon-dark"], "x")}{label}</div></div>')
        official.append(f'<h2>{label} · {name}</h2><div class="g">{"".join(cards)}</div>{chips}')
        print(key, len(v), "variantes")
    (HERE / "apps-kit.html").write_text(page(
        "Icônes officielles des apps SeshatOS",
        "Knowledge (K1) et Automation (A2) : même tuile, même accent orange, traits arrondis et nœuds. "
        "Repère de famille : le logo Seshat AI / SeshatOS (style reseau) dans la même tuile, à gauche.",
        f'<div class="c" style="flex-direction:row;align-items:center;margin-bottom:6px">{cls(family, "x")}'
        '<p style="margin:0"><b>Repère :</b> logo Seshat AI / SeshatOS</p></div>' + "".join(official)), encoding="utf-8")

    rows = []
    for key, opts in EXPLORATIONS.items():
        out = HERE / "logo" / "apps" / "explorations" / key
        out.mkdir(parents=True, exist_ok=True)
        cards = []
        for name, (desc, body) in opts.items():
            s = tile(body)
            (out / f"{name}.svg").write_text(s, encoding="utf-8")
            cards.append(card(name, f'<p>{desc}</p><div class="sz">{cls(s, "a")}{cls(s, "b")}{cls(s, "c32")}{cls(s, "c16")}</div>'))
        rows.append(f'<h2>{GLYPHS[key][0]}</h2><div class="g gx">{"".join(cards)}</div>')
    (HERE / "apps.html").write_text(page(
        "Pistes d'icônes écartées",
        "Retenues : K1 pour Knowledge et A2 pour Automation (voir apps-kit.html). Les pistes ci-dessous sont conservées pour mémoire.",
        "".join(rows)), encoding="utf-8")
    print("apps-kit.html, apps.html")


if __name__ == "__main__":
    main()
