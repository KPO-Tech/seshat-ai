#!/usr/bin/env python3
"""Génère les logos Seshat AI (SVG) et la page d'aperçu kit.html.

Usage, depuis ce dossier :
    python generate.py

Sortie :
    logo/<palette>/*.svg   marque sur clair, sur sombre, monochromes, icône, favicon
    kit.html               aperçu comparé de toutes les palettes

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


def mark(arc_color, star_color):
    cx, cy = STAR_CENTER
    star = star_path(cx, cy, STAR_OUTER, STAR_INNER)
    return svg(MARK_VIEWBOX,
               f'<path d="{ARC_PATH}" fill="none" stroke="{arc_color}" '
               f'stroke-width="{ARC_WIDTH}" stroke-linecap="round"/>'
               f'<path d="{star}" fill="{star_color}" stroke="{star_color}" '
               f'stroke-width="2" stroke-linejoin="round"/>')


def tile(arc_color, star_color, arc_w, outer, inner, cy):
    star = star_path(50, cy, outer, inner)
    return svg("0 0 100 100",
               f'<rect width="100" height="100" rx="22" fill="{INK}"/>'
               f'<path d="{TILE_ARC}" fill="none" stroke="{arc_color}" '
               f'stroke-width="{arc_w}" stroke-linecap="round"/>'
               f'<path d="{star}" fill="{star_color}" stroke="{star_color}" '
               f'stroke-width="2" stroke-linejoin="round"/>')


def build_files(p):
    return {
        "seshat-mark-on-light.svg": mark(INK, p["accent_deep"]),
        "seshat-mark-on-dark.svg": mark("#FFFFFF", p["accent"]),
        "seshat-mark-mono-black.svg": mark("#000000", "#000000"),
        "seshat-mark-mono-white.svg": mark("#FFFFFF", "#FFFFFF"),
        "seshat-app-icon.svg": tile("#FFFFFF", p["accent"], **{
            "arc_w": TILE["arc_w"], "outer": TILE["outer"],
            "inner": TILE["inner"], "cy": TILE["cy"]}),
        "favicon.svg": tile("#FFFFFF", p["accent"], **{
            "arc_w": FAVICON["arc_w"], "outer": FAVICON["outer"],
            "inner": FAVICON["inner"], "cy": FAVICON["cy"]}),
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


def palette_section(key, p, files):
    L, D = files["seshat-mark-on-light.svg"], files["seshat-mark-on-dark.svg"]
    MB = files["seshat-mark-mono-black.svg"]
    AI, FV = files["seshat-app-icon.svg"], files["favicon.svg"]
    c = lambda a, b: ("%.1f" % contrast(a, b)).replace(".", ",")
    sw = [
        (INK, "#fff", f"Encre {INK}", f"{c(INK, PAPER)}:1 sur papier"),
        (p["accent"], INK, f"{p['label']} {p['accent']}", f"sur fond sombre · {c(p['accent'], INK)}:1"),
        (p["accent_deep"], "#fff", f"{p['label']} profond {p['accent_deep']}", f"graphique sur clair · {c(p['accent_deep'], PAPER)}:1"),
        (p["accent_text"], "#fff", f"{p['label']} texte {p['accent_text']}", f"texte sur clair · {c(p['accent_text'], PAPER)}:1"),
        (PAPER, INK, f"Papier {PAPER}", "fond clair"),
    ]
    swatches = "".join(
        f'<div class="sw" style="background:{bg};color:{fg};{"border:1px solid #ddd" if bg == PAPER else ""}">'
        f'{n}<br>{d}</div>' for bg, fg, n, d in sw)
    return f'''
<h2>Palette « {p["label"]} »</h2>
<div class="g">
<div class="c"><div class="lock">{L}<span class="w">Seshat AI</span></div><small>Sur fond clair</small></div>
<div class="c dk"><div class="lock">{D}<span class="w">Seshat AI</span></div><small>Sur fond sombre</small></div>
<div class="c"><div class="lock">{MB}<span class="w">Seshat AI</span></div><small>Monochrome noir</small></div>
<div class="c"><div class="sz">{cls(AI, "a")}{cls(AI, "b")}{cls(FV, "c32")}{cls(FV, "c16")}</div><small>Icône 112 et 56 px, favicon 32 et 16 px</small></div>
</div>
<div class="pal" style="margin-top:14px">{swatches}</div>
<div class="mock" style="margin-top:14px"><div class="bar">{FV} Seshat AI — Conseil et intégration d'IA souveraine</div>
<div class="hero"><b>Un diagnostic, puis un pilote.</b><p style="color:#c8cee0">Conseil et intégration d'IA souveraine pour PME.</p>
<span class="btn" style="background:{p["accent"]}">Demander un diagnostic</span></div></div>'''


def build_kit(all_files):
    sections = "".join(palette_section(k, PALETTES[k], f) for k, f in all_files.items())
    return f'''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Seshat AI — kit d'identité</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>{CSS}</style><div class="wrap">
<h1>Seshat AI — kit d'identité (v1)</h1>
<p>Marque : l'étoile à sept branches surmontée d'un arc, l'emblème de la déesse Seshat, simplifié. Palettes comparées : {", ".join(p["label"] for p in PALETTES.values())}. Généré par <code>generate.py</code>.</p>
{sections}
</div></html>'''


def main():
    all_files = {}
    for key, p in PALETTES.items():
        out = HERE / "logo" / key
        out.mkdir(parents=True, exist_ok=True)
        files = build_files(p)
        for name, content in files.items():
            (out / name).write_text(content, encoding="utf-8")
        all_files[key] = files
        print(f"logo/{key}: {len(files)} fichiers")
    (HERE / "kit.html").write_text(build_kit(all_files), encoding="utf-8")
    print("kit.html")


if __name__ == "__main__":
    main()
