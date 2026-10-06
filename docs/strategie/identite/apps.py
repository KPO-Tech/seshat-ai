#!/usr/bin/env python3
"""Icônes des apps SeshatOS (famille) : Knowledge et Automation, trois pistes chacune.

Usage : python apps.py   ->   logo/apps/<app>/<piste>.svg  et  apps.html

Règles de la famille :
  1. même tuile arrondie charbon pour toutes les apps ;
  2. un seul accent, l'orange ; la forme distingue les apps, pas la couleur ;
  3. glyphe simple en traits arrondis et en nœuds, comme le logo Seshat.
Couleurs : celles du desktop (seshat-desktop, tailwind.css).
"""
from pathlib import Path
import generate as g

HERE = Path(__file__).parent
CHAR, CREAM, ORANGE = "#2F2E34", "#E7E2DA", "#EF7C2F"
S = f'stroke="{CREAM}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"'
O = f'fill="{ORANGE}"'


def tile(body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="icône">'
            f'<rect width="100" height="100" rx="22" fill="{CHAR}"/>{body}</svg>')


def node(x, y, r=4.5, fill=ORANGE):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>'


PAGE_L = "M50,72 C41,65 28,64 18,68 L18,32 C28,28 41,29 50,36 Z"
PAGE_R = "M50,72 C59,65 72,64 82,68 L82,32 C72,28 59,29 50,36 Z"

APPS = {
    "knowledge": {
        "label": "Knowledge",
        "options": {
            "K1-livre-graphe": (
                "Livre ouvert dont les pages sont un graphe de connaissance",
                f'<path d="{PAGE_L}" {S}/><path d="{PAGE_R}" {S}/>'
                f'<g stroke="{CREAM}" stroke-width="2.4" stroke-linecap="round" opacity=".75">'
                '<line x1="50" y1="52" x2="31" y2="46"/><line x1="50" y1="52" x2="69" y2="46"/>'
                '<line x1="50" y1="52" x2="34" y2="58"/><line x1="50" y1="52" x2="66" y2="58"/></g>'
                + node(50, 52, 5.2)
                + "".join(node(x, y, 3.4) for x, y in ((31, 46), (69, 46), (34, 58), (66, 58)))),
            "K2-calame": (
                "Le calame du scribe trace un lien jusqu'à un nœud",
                f'<line x1="74" y1="22" x2="50" y2="52" stroke="{CREAM}" stroke-width="7" stroke-linecap="round"/>'
                f'<path d="M51,50 L42,63 L56,57 Z" {O} stroke="{ORANGE}" stroke-width="2" stroke-linejoin="round"/>'
                f'<path d="M42,63 C34,72 30,66 25,75" stroke="{ORANGE}" stroke-width="3.6" stroke-linecap="round" fill="none"/>'
                + node(24, 77, 5)),
            "K3-bibliotheque": (
                "Tranches de livres sous un arc, un nœud sur l'une d'elles",
                f'<rect x="22" y="44" width="15" height="34" rx="3" {S}/>'
                f'<rect x="42.5" y="32" width="15" height="46" rx="3" {S}/>'
                f'<rect x="63" y="40" width="15" height="38" rx="3" {S}/>'
                f'<path d="M20,26 Q50,8 80,26" {S}/>' + node(50, 46, 4.6)),
        },
    },
    "automation": {
        "label": "Automation",
        "options": {
            "A1-flux": (
                "Flux de trois étapes dont celle en cours (lecture) est orange",
                f'<path d="M24,66 L50,34 L76,66" {S}/>'
                f'<rect x="15" y="57" width="18" height="18" rx="4" fill="{CHAR}" stroke="{CREAM}" stroke-width="4.5"/>'
                f'<rect x="67" y="57" width="18" height="18" rx="4" fill="{CHAR}" stroke="{CREAM}" stroke-width="4.5"/>'
                + node(50, 34, 10) + f'<path d="M46.5,29.5 L56,34 L46.5,38.5 Z" fill="{CHAR}"/>'),
            "A2-point-de-controle": (
                "Une branche, un point de contrôle humain (anneau), puis la fusion",
                f'<path d="M26,50 C40,50 40,32 56,32 C70,32 70,50 74,50" {S}/>'
                f'<path d="M26,50 C40,50 40,68 56,68 C70,68 70,50 74,50" {S}/>'
                + node(21, 50, 5, CREAM)
                + f'<circle cx="56" cy="32" r="7.5" fill="{CHAR}" stroke="{ORANGE}" stroke-width="4.5"/>'
                + node(56, 68, 4.4, CREAM) + node(79, 50, 6.5)),
            "A3-relecture": (
                "Frise d'exécution avec tête de lecture : ce qui est joué en orange",
                f'<path d="M18,66 H82" {S}/>'
                + node(24, 66, 5.4) + node(42, 66, 5.4)
                + f'<circle cx="60" cy="66" r="5.4" fill="{CHAR}" stroke="{CREAM}" stroke-width="3.6"/>'
                + f'<circle cx="78" cy="66" r="5.4" fill="{CHAR}" stroke="{CREAM}" stroke-width="3.6"/>'
                + f'<line x1="60" y1="38" x2="60" y2="60" stroke="{ORANGE}" stroke-width="4" stroke-linecap="round"/>'
                + f'<path d="M52,28 L68,28 L60,40 Z" {O} stroke="{ORANGE}" stroke-width="2" stroke-linejoin="round"/>'),
        },
    },
}

CSS = (
    "*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:#F6F1EA;color:#1F1B16;padding:28px 16px 60px}"
    ".wrap{max-width:1100px;margin:auto}h1{font-size:24px;margin:0 0 6px}h2{font-size:19px;margin:34px 0 12px}h3{font-size:14px;margin:0 0 4px}"
    "p{margin:0 0 12px;color:#5E564C;font-size:13px;line-height:1.45}"
    ".g{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}.c{background:#FFFCF8;border:1px solid #E3DACD;border-radius:16px;padding:18px}"
    ".sz{display:flex;align-items:end;gap:14px;margin-bottom:14px}.sz svg.a{width:112px;height:112px}.sz svg.b{width:56px;height:56px}"
    ".sz svg.c32{width:32px;height:32px}.sz svg.c16{width:16px;height:16px}"
    ".ctx{display:grid;grid-template-columns:1fr 1fr;gap:8px}.lt,.dk{display:flex;align-items:center;gap:8px;padding:8px;border-radius:10px;font-size:12px;font-weight:600}"
    ".lt{background:#fff;border:1px solid #E3DACD}.dk{background:#2F2E34;color:#E7E2DA}.lt svg,.dk svg{width:36px;height:36px}"
    ".fam{display:flex;gap:14px;align-items:center;margin-bottom:6px}.fam svg{width:72px;height:72px}"
)


def resize(svg, cls):
    return svg.replace("<svg", f'<svg class="{cls}"', 1)


def main():
    rows = []
    family = tile(f'<g transform="translate(50 50) scale(0.8) translate(-50 -43)">{g.reseau_inner(CREAM, ORANGE)}</g>')
    for key, app in APPS.items():
        out = HERE / "logo" / "apps" / key
        out.mkdir(parents=True, exist_ok=True)
        cards = []
        for name, (desc, body) in app["options"].items():
            svg = tile(body)
            (out / f"{name}.svg").write_text(svg, encoding="utf-8")
            cards.append(
                f'<div class="c"><h3>{name}</h3><p>{desc}</p>'
                f'<div class="sz">{resize(svg, "a")}{resize(svg, "b")}{resize(svg, "c32")}{resize(svg, "c16")}</div>'
                f'<div class="ctx"><div class="lt">{resize(svg, "b")}<span>{app["label"]}</span></div>'
                f'<div class="dk">{resize(svg, "b")}<span>{app["label"]}</span></div></div></div>')
        rows.append(f'<h2>{app["label"]}</h2><div class="g">{"".join(cards)}</div>')
        print(key, len(app["options"]), "pistes")
    html = (
        '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Seshat AI — icônes des apps</title>'
        '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">'
        f'<style>{CSS}</style><div class="wrap"><h1>Icônes des apps SeshatOS</h1>'
        "<p>Famille : tuile charbon commune, accent orange unique, glyphe en traits arrondis et nœuds. "
        "Trois pistes par app ; en bas de chaque piste, l'icône sur fond clair et sombre.</p>"
        f'<div class="fam">{resize(family, "x")}<p style="margin:0"><b>Repère :</b> le logo Seshat AI / SeshatOS '
        "(style <code>reseau</code>) dans la même tuile.</p></div>"
        + "".join(rows) + "</div></html>")
    (HERE / "apps.html").write_text(html, encoding="utf-8")
    print("apps.html")


if __name__ == "__main__":
    main()
