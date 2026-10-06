#!/usr/bin/env python3
"""Aperçu comparatif des thèmes : desktop actuel (clair et sombre) contre un clair chaud proposé.

Usage : python proposal.py   ->   palette-proposal.html
Réutilise la géométrie du logo de generate.py (styles v2 : reseau et emblem).
"""
from pathlib import Path
import generate as g

HERE = Path(__file__).parent

THEMES = {
    "Sombre actuel (conservé)": dict(
        root="#2F2E34", side="#2C2A31", panel="#3A3941", muted="#4A4852", border="#4D4A54",
        text="#E7E2DA", text2="#B6AEA3", text3="#918A82", accent="#EF7C2F", btn_text="#1F1B16",
        arc="#E7E2DA", mark_accent="#EF7C2F", link="#EF7C2F"),
    "Clair actuel (à remplacer)": dict(
        root="#F7F7F5", side="#EFEFEE", panel="#FFFFFF", muted="#F1F1F0", border="#E1E1DF",
        text="#171717", text2="#5F6368", text3="#8A8D91", accent="#EF7C2F", btn_text="#FFFFFF",
        arc="#171717", mark_accent="#EF7C2F", link="#EF7C2F"),
    "Clair chaud (proposé)": dict(
        root="#F6F1EA", side="#EDE6DC", panel="#FFFCF8", muted="#EFE8DE", border="#E3DACD",
        text="#1F1B16", text2="#5E564C", text3="#7A7064", accent="#EF7C2F", btn_text="#1F1B16",
        arc="#2F2E34", mark_accent="#C2570C", link="#A94A0A"),
}


def mark(style, arc, accent):
    inner = g.reseau_inner if style == "reseau" else g.emblem_inner
    return g.svg(g.EMB_VIEWBOX, inner(arc, accent))


def card(name, t):
    logo = mark("reseau", t["arc"], t["mark_accent"])
    return f'''<section class="th" style="--root:{t['root']};--side:{t['side']};--panel:{t['panel']};--muted:{t['muted']};--border:{t['border']};--text:{t['text']};--text2:{t['text2']};--text3:{t['text3']};--accent:{t['accent']};--btn:{t['btn_text']};--link:{t['link']}">
<h3>{name}</h3>
<div class="app"><aside><div class="brand">{logo}<b>Seshat AI</b></div>
<div class="nav on">Chat</div><div class="nav">Knowledge</div><div class="nav">Tâches planifiées</div><div class="nav">Skills</div></aside>
<main><div class="msg me">Quelles sont nos règles de remboursement ?</div>
<div class="msg ai">D'après la procédure RH v3 (mise à jour le 12 mars), le remboursement est plafonné à 80 €. <a>Voir la source</a></div>
<div class="meta">Source : procedure-rh-v3.pdf · il y a 2 h</div>
<div class="row"><span class="btn">Valider</span><span class="btn ghost">Ignorer</span></div></main></div></section>'''


css = """
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:#d9d6cf;padding:28px 16px 60px;color:#222}
h1{font-size:22px;margin:0 0 6px}.s{margin:0 0 22px;color:#444;max-width:760px;line-height:1.5}
.grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));max-width:1200px;margin:auto}
.th h3{margin:0 0 8px;font-size:14px}.app{display:grid;grid-template-columns:130px 1fr;border-radius:14px;overflow:hidden;border:1px solid var(--border);background:var(--root);color:var(--text);min-height:300px}
aside{background:var(--side);padding:14px 10px;border-right:1px solid var(--border)}.brand{display:flex;align-items:center;gap:6px;margin-bottom:14px}.brand svg{width:28px;height:28px}.brand b{font-size:12px}
.nav{font-size:12px;color:var(--text2);padding:7px 8px;border-radius:8px}.nav.on{background:var(--muted);color:var(--text);font-weight:600}
main{padding:14px;display:flex;flex-direction:column;gap:10px}.msg{font-size:12.5px;line-height:1.45;padding:10px 12px;border-radius:12px;max-width:92%}
.me{background:var(--muted);align-self:flex-end}.ai{background:var(--panel);border:1px solid var(--border)}.ai a{color:var(--link);font-weight:600;text-decoration:underline}
.meta{font-size:11px;color:var(--text3)}.row{display:flex;gap:8px;margin-top:auto}.btn{font-size:12px;font-weight:600;background:var(--accent);color:var(--btn);padding:8px 14px;border-radius:9px}
.btn.ghost{background:transparent;color:var(--text2);border:1px solid var(--border)}
"""
html = ('<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Seshat AI — comparaison des thèmes</title>'
        '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet"><style>' + css + '</style>'
        "<h1>Thèmes : desktop actuel contre clair chaud proposé</h1>"
        "<p class='s'>L'orange <b>#EF7C2F</b> et le sombre charbon du desktop sont conservés. Le clair actuel (gris froid, texte blanc sur bouton orange à 2,8:1, orange sur clair à 2,6:1) est remplacé par un papier chaud, un texte à fort contraste et un bouton orange à texte sombre (6,2:1).</p>"
        '<div class="grid">' + "".join(card(n, t) for n, t in THEMES.items()) + "</div></html>")
(HERE / "palette-proposal.html").write_text(html, encoding="utf-8")
print("palette-proposal.html")
