"""Briques communes des pages d'aperçu de l'identité : mise en page, navigation, SVG lisibles.

Utilisé par build.py. Le HTML produit est écrit sur plusieurs lignes, indenté, pour rester lisible.
"""
from xml.dom import minidom

NAV = [
    ("index.html", "Accueil"),
    ("logo.html", "Logo"),
    ("themes.html", "Couleurs et thèmes"),
    ("apps.html", "Icônes des apps"),
    ("explorations.html", "Explorations"),
]

CSS = """
:root {
  --ink: #2F2E34;
  --paper: #F6F1EA;
  --card: #FFFCF8;
  --line: #E3DACD;
  --text: #1F1B16;
  --text2: #5E564C;
  --accent: #EF7C2F;
  --accent-text: #A94A0A;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Inter, system-ui, sans-serif;
  background: var(--paper);
  color: var(--text);
}
header.top {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--ink);
  color: #E7E2DA;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 10px 20px;
  flex-wrap: wrap;
}
header.top b { font-family: 'Space Grotesk', Inter, sans-serif; font-size: 16px; letter-spacing: -.01em; }
header.top nav { display: flex; gap: 4px; flex-wrap: wrap; }
header.top a {
  color: #B6AEA3;
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 10px;
  border-radius: 8px;
}
header.top a:hover { color: #fff; background: rgba(231, 226, 218, .08); }
header.top a.on { color: #1F1B16; background: var(--accent); }
.wrap { max-width: 1120px; margin: auto; padding: 28px 16px 72px; }
h1 { font-family: 'Space Grotesk', Inter, sans-serif; font-size: 30px; margin: 0 0 6px; letter-spacing: -.02em; }
h2 { font-family: 'Space Grotesk', Inter, sans-serif; font-size: 21px; margin: 40px 0 12px; letter-spacing: -.01em; }
h3 { font-size: 13px; margin: 0 0 8px; }
p { margin: 0 0 12px; color: var(--text2); font-size: 14px; line-height: 1.55; }
code { background: #ECE5DA; padding: 1px 5px; border-radius: 5px; font-size: 12.5px; }
small { font-size: 11.5px; opacity: .75; }
.lead { max-width: 760px; font-size: 15px; }
.grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.grid.wide { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}
.card.dark { background: var(--ink); border-color: var(--ink); color: #E7E2DA; }
.card.dark p { color: #B6AEA3; }
a.card { text-decoration: none; color: inherit; transition: transform .12s, border-color .12s; }
a.card:hover { transform: translateY(-2px); border-color: var(--accent); }
.card .go { color: var(--accent-text); font-size: 13px; font-weight: 600; margin-top: auto; }
.lock { display: flex; align-items: center; gap: 12px; }
.lock svg { width: 60px; height: 60px; flex: none; }
.word { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 30px; letter-spacing: -.025em; }
.sizes { display: flex; gap: 12px; align-items: end; }
.sizes svg.a { width: 112px; height: 112px; }
.sizes svg.b { width: 56px; height: 56px; }
.sizes svg.c32 { width: 32px; height: 32px; }
.sizes svg.c16 { width: 16px; height: 16px; }
.big svg { width: 104px; height: 104px; }
.chips { display: flex; gap: 10px; flex-wrap: wrap; }
.chip { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 10px; font-size: 13px; font-weight: 600; }
.chip svg { width: 34px; height: 34px; }
.chip.light { background: #fff; border: 1px solid var(--line); }
.chip.darkc { background: var(--ink); color: #E7E2DA; }
.swatches { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.sw { border-radius: 12px; padding: 12px; min-height: 92px; display: flex; flex-direction: column; justify-content: flex-end; font-size: 12px; font-weight: 500; }
table { border-collapse: collapse; width: 100%; font-size: 13px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { background: #EFE8DE; font-weight: 600; }
.t1 { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 42px; line-height: 1.05; letter-spacing: -.03em; color: var(--text); }
.t2 { font-size: 16px; line-height: 1.55; color: var(--text); }
.hero { display: flex; gap: 24px; align-items: center; flex-wrap: wrap; margin: 8px 0 8px; }
.hero svg.logo { width: 120px; height: 120px; }
.note { border-left: 4px solid var(--accent); background: var(--card); padding: 12px 16px; border-radius: 0 12px 12px 0; font-size: 14px; color: var(--text2); }
/* maquette d'application (page Thèmes) */
.th h3 { font-size: 14px; }
.app { display: grid; grid-template-columns: 130px 1fr; border-radius: 14px; overflow: hidden; border: 1px solid var(--b); background: var(--root); color: var(--tx); min-height: 300px; }
.app aside { background: var(--side); padding: 14px 10px; border-right: 1px solid var(--b); }
.app .brand { display: flex; align-items: center; gap: 6px; margin-bottom: 14px; }
.app .brand svg { width: 28px; height: 28px; }
.app .brand b { font-size: 12px; }
.app .nav { font-size: 12px; color: var(--tx2); padding: 7px 8px; border-radius: 8px; }
.app .nav.on { background: var(--mut); color: var(--tx); font-weight: 600; }
.app main { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.app .msg { font-size: 12.5px; line-height: 1.45; padding: 10px 12px; border-radius: 12px; max-width: 92%; }
.app .me { background: var(--mut); align-self: flex-end; }
.app .ai { background: var(--panel); border: 1px solid var(--b); }
.app .ai a { color: var(--lnk); font-weight: 600; text-decoration: underline; }
.app .meta { font-size: 11px; color: var(--tx3); }
.app .row { display: flex; gap: 8px; margin-top: auto; }
.app .btn { font-size: 12px; font-weight: 600; background: var(--acc); color: var(--btn); padding: 8px 14px; border-radius: 9px; }
.app .btn.ghost { background: transparent; color: var(--tx2); border: 1px solid var(--b); }
"""


def pretty_svg(svg: str) -> str:
    """Remet un SVG sur plusieurs lignes, indenté (sans déclaration XML)."""
    out = minidom.parseString(svg).toprettyxml(indent="  ")
    lines = [ln for ln in out.splitlines() if ln.strip() and not ln.startswith("<?xml")]
    return "\n".join(lines) + "\n"


def inline(svg: str, css_class: str = "") -> str:
    """SVG à insérer dans une page : lisible, avec une classe CSS optionnelle."""
    s = pretty_svg(svg).rstrip("\n")
    if css_class:
        s = s.replace("<svg", f'<svg class="{css_class}"', 1)
    return s


def indent(text: str, n: int = 2) -> str:
    pad = " " * n
    return "\n".join(pad + ln if ln.strip() else ln for ln in text.splitlines())


def card(title: str, body: str, kind: str = "", tag: str = "div", href: str = "") -> str:
    cls = f"card {kind}".strip()
    attr = f' href="{href}"' if href else ""
    return (f'<{tag} class="{cls}"{attr}>\n  <h3>{title}</h3>\n{indent(body)}\n</{tag}>')


def grid(cards, wide: bool = False) -> str:
    cls = "grid wide" if wide else "grid"
    return f'<div class="{cls}">\n' + "\n".join(indent(c) for c in cards) + "\n</div>"


def page(title: str, active: str, intro: str, body: str) -> str:
    def link(href, label):
        on = ' class="on"' if href == active else ""
        return f'      <a href="{href}"{on}>{label}</a>'

    links = "\n".join(link(h, lab) for h, lab in NAV)
    return f"""<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} — Seshat AI</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>{CSS}  </style>
</head>
<body>
  <header class="top">
    <b>Seshat AI · identité</b>
    <nav>
{links}
    </nav>
  </header>
  <div class="wrap">
    <h1>{title}</h1>
    <p class="lead">{intro}</p>
{indent(body, 4)}
  </div>
</body>
</html>
"""
