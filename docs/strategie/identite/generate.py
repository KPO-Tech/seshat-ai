#!/usr/bin/env python3
"""Génère les logos Seshat AI (SVG) et la page d'aperçu kit.html.

Usage, depuis ce dossier :
    python generate.py

Sortie :
    logo/<style>/<palette>/*.svg   marque sur clair, sur sombre, monochromes, icône, favicon
    kit.html                       aperçu comparé de tous les styles et palettes

Styles :
    etoile  v1 (piste D1) : étoile pleine à sept branches + arc
    emblem  v2 : rosette de sept pétales sur sa tige + arc, d'après l'emblème réel
            de la déesse ; nœuds sur l'arc et au pied de la tige (clin d'œil IA)
    reseau  v2 : même rosette, pétales en contour avec un nœud à chaque pointe
            et des rayons depuis un nœud central (réseau de neurones)

Concept : l'emblème de la déesse Seshat, une étoile à sept branches surmontée
d'un arc, simplifié. Pour changer une couleur, modifier PALETTES. Pour changer
la forme, modifier les constantes de GÉOMÉTRIE.
Version du kit : v1 (piste D1, voir explorations/).
"""
import math
from pathlib import Path

HERE = Path(__file__).parent

# --- PALETTES -----------------------------------------------------------
# accent        : sur fond sombre (encre)
# accent_deep   : sur fond clair, usage graphique (contraste >= 3:1 avec le papier)
# accent_text   : sur fond clair, usage texte (contraste >= 4,5:1 avec le papier)
INK = "#0F1B3D"
PAPER = "#F7F6F2"
PALETTES = {
    "ambre": {
        "label": "Ambre",
        "accent": "#E8A33D",
        "accent_deep": "#B86E10",
        "accent_text": "#9A5A0B",
    },
    "orange": {
        "label": "Orange",
        "accent": "#F2711C",
        "accent_deep": "#D9570B",
        "accent_text": "#B84A08",
    },
}

# --- GÉOMÉTRIE (viewBox 0 0 100 100) ------------------------------------
POINTS = 7                      # branches de l'étoile
STAR_CENTER = (50, 65)          # centre de l'étoile (marque seule)
STAR_OUTER, STAR_INNER = 27, 12.5
ARC_PATH = "M20,35 Q50,1 80,35"  # arc ouvert vers le bas
ARC_WIDTH = 5.5
MARK_VIEWBOX = "10 11 80 80"    # cadrage serré de la marque seule

# Icône (tuile) : version standard et version renforcée pour le favicon
TILE_ARC = "M22,38 Q50,6 78,38"
TILE = dict(arc_w=5, outer=25, inner=11.5, cy=64)
FAVICON = dict(arc_w=7, outer=29, inner=14, cy=64)


# --- OUTILS -------------------------------------------------------------
def lum(hex_color):
    h = hex_color.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a, b):
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def star_path(cx, cy, outer, inner, n=POINTS):
    pts = []
    for i in range(2 * n):
        r = outer if i % 2 == 0 else inner
        a = math.radians(-90 + i * 180 / n)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return "M" + " L".join("%.2f,%.2f" % p for p in pts) + " Z"


def svg(viewbox, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" '
            f'role="img" aria-label="Seshat AI">{body}</svg>')


# --- STYLE « etoile » (v1) ----------------------------------------------
def etoile_inner(arc_color, star_color):
    cx, cy = STAR_CENTER
    star = star_path(cx, cy, STAR_OUTER, STAR_INNER)
    return (f'<path d="{ARC_PATH}" fill="none" stroke="{arc_color}" '
            f'stroke-width="{ARC_WIDTH}" stroke-linecap="round"/>'
            f'<path d="{star}" fill="{star_color}" stroke="{star_color}" '
            f'stroke-width="2" stroke-linejoin="round"/>')


def etoile_tile_inner(arc_color, star_color, arc_w, outer, inner, cy):
    star = star_path(50, cy, outer, inner)
    return (f'<path d="{TILE_ARC}" fill="none" stroke="{arc_color}" '
            f'stroke-width="{arc_w}" stroke-linecap="round"/>'
            f'<path d="{star}" fill="{star_color}" stroke="{star_color}" '
            f'stroke-width="2" stroke-linejoin="round"/>')


# --- STYLES « emblem » et « reseau » (v2) ------------------------------
# Rosette de sept pétales en éventail (angles depuis la verticale), centre C.
EMB_CENTER = (50, 64)
EMB_ANGLES = (-96, -64, -32, 0, 32, 64, 96)
EMB_PETAL_LEN = 31
EMB_BOW = ("M13,46 C11,24 30,10 47.5,12 C49,9 47.5,5.5 45.5,3 "
           "M52.5,12 C70,10 89,24 87,46 M52.5,12 C51,9 52.5,5.5 54.5,3")
EMB_FEET = ((13, 46), (87, 46))
EMB_STALK_END = 80              # tige courte : pas de parapluie
EMB_VIEWBOX = "6 0 88 88"


def _petal(angle, length, base=5, width=7.4):
    cx, cy = EMB_CENTER
    mid = (base + length) / 2
    return (f'M0,-{base} Q-{width},-{mid} 0,-{length} Q{width},-{mid} 0,-{base}Z',
            f'translate({cx} {cy}) rotate({angle})')


def _tip(angle, r):
    cx, cy = EMB_CENTER
    a = math.radians(angle)
    return cx + r * math.sin(a), cy - r * math.cos(a)


def emblem_inner(bow_color, accent, bold=False):
    """Pétales pleins, arc avec nœuds aux pieds, tige avec nœud."""
    cx, cy = EMB_CENTER
    w = 4.4 if bold else 3
    out = [f'<path d="{EMB_BOW}" fill="none" stroke="{bow_color}" '
           f'stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>']
    for a in EMB_ANGLES:
        d, t = _petal(a, EMB_PETAL_LEN, width=8.6 if bold else 7.4)
        out.append(f'<path d="{d}" transform="{t}" fill="{accent}" '
                   f'stroke="{accent}" stroke-width="1.2" stroke-linejoin="round"/>')
    out.append(f'<line x1="{cx}" y1="{cy}" x2="{cx}" y2="{EMB_STALK_END}" '
               f'stroke="{bow_color}" stroke-width="{w}" stroke-linecap="round"/>')
    if not bold:
        for x, y in EMB_FEET:
            out.append(f'<circle cx="{x}" cy="{y}" r="3.6" fill="{accent}"/>')
        out.append(f'<circle cx="{cx}" cy="{EMB_STALK_END}" r="3.6" fill="{accent}"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="3" fill="{bow_color}"/>')
    return "".join(out)


def reseau_inner(bow_color, accent, bold=False):
    """Pétales en contour, rayons et nœuds : la rosette lue comme un réseau."""
    cx, cy = EMB_CENTER
    w = 4 if bold else 2.6
    out = [f'<path d="{EMB_BOW}" fill="none" stroke="{bow_color}" '
           f'stroke-width="{w + 0.6}" stroke-linecap="round" stroke-linejoin="round"/>']
    for a in EMB_ANGLES:
        d, t = _petal(a, EMB_PETAL_LEN - 3.5, width=7.6)
        out.append(f'<path d="{d}" transform="{t}" fill="none" stroke="{accent}" '
                   f'stroke-width="{w}" stroke-linejoin="round"/>')
        x, y = _tip(a, EMB_PETAL_LEN)
        out.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{3.6 if bold else 3.1}" fill="{accent}"/>')
    out.append(f'<line x1="{cx}" y1="{cy}" x2="{cx}" y2="{EMB_STALK_END}" '
               f'stroke="{bow_color}" stroke-width="{w + 0.4}" stroke-linecap="round"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="{4.4 if bold else 3.8}" fill="{accent}"/>')
    out.append(f'<circle cx="{cx}" cy="{EMB_STALK_END}" r="3.4" fill="{bow_color}"/>')
    for x, y in EMB_FEET:
        out.append(f'<circle cx="{x}" cy="{y}" r="3.2" fill="{bow_color}"/>')
    return "".join(out)


def _tile_wrap(inner):
    # place la marque v2 dans la tuile encre : mise à l'échelle et centrage
    return (f'<rect width="100" height="100" rx="22" fill="{INK}"/>'
            f'<g transform="translate(50 50) scale(0.8) translate(-50 -43)">{inner}</g>')


# --- ASSEMBLAGE PAR STYLE ----------------------------------------------
def build_files(style, p):
    on_dark = {"arc": "#FFFFFF", "accent": p["accent"]}
    on_light = {"arc": INK, "accent": p["accent_deep"]}
    if style == "etoile":
        mk = lambda arc, acc: svg(MARK_VIEWBOX, etoile_inner(arc, acc))
        icon = svg("0 0 100 100", f'<rect width="100" height="100" rx="22" fill="{INK}"/>'
                   + etoile_tile_inner("#FFFFFF", p["accent"], TILE["arc_w"], TILE["outer"], TILE["inner"], TILE["cy"]))
        fav = svg("0 0 100 100", f'<rect width="100" height="100" rx="22" fill="{INK}"/>'
                  + etoile_tile_inner("#FFFFFF", p["accent"], FAVICON["arc_w"], FAVICON["outer"], FAVICON["inner"], FAVICON["cy"]))
    else:
        inner = emblem_inner if style == "emblem" else reseau_inner
        mk = lambda arc, acc: svg(EMB_VIEWBOX, inner(arc, acc))
        icon = svg("0 0 100 100", _tile_wrap(inner("#FFFFFF", p["accent"])))
        fav = svg("0 0 100 100", _tile_wrap(inner("#FFFFFF", p["accent"], bold=True)))
    return {
        "seshat-mark-on-light.svg": mk(on_light["arc"], on_light["accent"]),
        "seshat-mark-on-dark.svg": mk(on_dark["arc"], on_dark["accent"]),
        "seshat-mark-mono-black.svg": mk("#000000", "#000000"),
        "seshat-mark-mono-white.svg": mk("#FFFFFF", "#FFFFFF"),
        "seshat-app-icon.svg": icon,
        "favicon.svg": fav,
    }


STYLES = {
    "etoile": "v1 · Étoile et arc",
    "emblem": "v2 · Emblème (rosette pleine, nœuds)",
    "reseau": "v2 · Réseau (rosette en contour, nœuds aux pointes)",
}


def cls(svg_text, name):
    return svg_text.replace("<svg", f'<svg class="{name}"', 1)


# --- PAGE D'APERÇU ------------------------------------------------------
CSS = """
:root{--ink:%(ink)s;--paper:%(paper)s}
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:var(--paper);color:var(--ink);padding:32px 16px 64px}
.wrap{max-width:1040px;margin:auto}h1{font-family:'Space Grotesk';font-size:30px;margin:0 0 6px;letter-spacing:-.02em}
h2{font-family:'Space Grotesk';font-size:20px;margin:40px 0 12px}h3{font-size:14px;margin:0 0 8px}
p{color:#55607a;line-height:1.5;margin:0 0 12px}.g{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.c{border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:12px;border:1px solid #e3e1da;background:#fff}.c small{font-size:12px;opacity:.7}
.c.dk{background:var(--ink);border-color:var(--ink);color:#fff}
.lock{display:flex;align-items:center;gap:12px}.lock svg{width:60px;height:60px;flex:none}
.w{font-family:'Space Grotesk';font-weight:600;font-size:30px;letter-spacing:-.025em}
.sz{display:flex;align-items:end;gap:14px}.sz svg.a{width:112px;height:112px}.sz svg.b{width:56px;height:56px}.sz svg.c32{width:32px;height:32px}.sz svg.c16{width:16px;height:16px}
.pal{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}.sw{border-radius:12px;padding:12px;min-height:88px;display:flex;flex-direction:column;justify-content:end;font-size:12px;font-weight:500}
.mock{border-radius:16px;overflow:hidden;border:1px solid #e3e1da;background:#fff}.mock .bar{display:flex;align-items:center;gap:8px;background:#ECEAE3;padding:8px 12px;font-size:12px}.mock .bar svg{width:16px;height:16px}
.mock .hero{padding:28px 22px;background:var(--ink);color:#fff}.mock .hero b{font-family:'Space Grotesk';font-size:24px;letter-spacing:-.02em}
.btn{display:inline-block;color:var(--ink);font-weight:600;border-radius:10px;padding:10px 16px;margin-top:12px;font-size:14px}
""" % {"ink": INK, "paper": PAPER}


def style_section(style, files_by_palette):
    cards = []
    for key, files in files_by_palette.items():
        p = PALETTES[key]
        L, D = files["seshat-mark-on-light.svg"], files["seshat-mark-on-dark.svg"]
        cards.append(f'<div class="c"><div class="lock">{L}<span class="w">Seshat AI</span></div><small>{p["label"]} · fond clair</small></div>')
        cards.append(f'<div class="c dk"><div class="lock">{D}<span class="w">Seshat AI</span></div><small>{p["label"]} · fond sombre</small></div>')
    first = next(iter(files_by_palette.values()))
    second = list(files_by_palette.values())[-1]
    MB = first["seshat-mark-mono-black.svg"]
    cards.append(f'<div class="c"><div class="lock">{MB}<span class="w">Seshat AI</span></div><small>Monochrome noir</small></div>')
    ico = lambda f: (f'<div class="sz">{cls(f["seshat-app-icon.svg"], "a")}{cls(f["seshat-app-icon.svg"], "b")}'
                     f'{cls(f["favicon.svg"], "c32")}{cls(f["favicon.svg"], "c16")}</div>')
    cards.append(f'<div class="c">{ico(first)}<small>Icône 112 et 56 px, favicon 32 et 16 px (ambre)</small></div>')
    return f'<h2>{STYLES[style]}</h2><div class="g">{"".join(cards)}</div>'


def swatches():
    c = lambda a, b: ("%.1f" % contrast(a, b)).replace(".", ",")
    out = []
    for key, p in PALETTES.items():
        for bg, fg, n, d in (
            (p["accent"], INK, f"{p['label']} {p['accent']}", f"sur sombre · {c(p['accent'], INK)}:1"),
            (p["accent_deep"], "#fff", f"{p['label']} profond {p['accent_deep']}", f"graphique sur clair · {c(p['accent_deep'], PAPER)}:1"),
            (p["accent_text"], "#fff", f"{p['label']} texte {p['accent_text']}", f"texte sur clair · {c(p['accent_text'], PAPER)}:1"),
        ):
            out.append(f'<div class="sw" style="background:{bg};color:{fg}">{n}<br>{d}</div>')
    out.insert(0, f'<div class="sw" style="background:{INK};color:#fff">Encre {INK}<br>{c(INK, PAPER)}:1 sur papier</div>')
    return f'<h2>Couleurs</h2><div class="pal">{"".join(out)}</div>'


def build_kit(all_files):
    sections = "".join(style_section(st, fp) for st, fp in all_files.items())
    return f'''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Seshat AI — kit d'identité</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>{CSS}</style><div class="wrap">
<h1>Seshat AI — kit d'identité</h1>
<p>Marque inspirée de l'emblème de la déesse Seshat : une rosette de sept pétales sur sa tige, surmontée d'un arc. Styles et palettes comparés ; généré par <code>generate.py</code>.</p>
{swatches()}{sections}
</div></html>'''


def main():
    all_files = {}
    for style in STYLES:
        all_files[style] = {}
        for key, p in PALETTES.items():
            out = HERE / "logo" / style / key
            out.mkdir(parents=True, exist_ok=True)
            files = build_files(style, p)
            for name, content in files.items():
                (out / name).write_text(content, encoding="utf-8")
            all_files[style][key] = files
            print(f"logo/{style}/{key}: {len(files)} fichiers")
    (HERE / "kit.html").write_text(build_kit(all_files), encoding="utf-8")
    print("kit.html")


if __name__ == "__main__":
    main()
