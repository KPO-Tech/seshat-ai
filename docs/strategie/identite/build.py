#!/usr/bin/env python3
"""Construit tout le kit d'identité : les SVG et les pages d'aperçu liées entre elles.

Usage, depuis ce dossier :
    python build.py

Produit :
    logo/**/*.svg         tous les logos et icônes (SVG lisibles)
    index.html            accueil : état des décisions, aperçu d'ensemble, liens
    logo.html             les trois styles de logo, deux palettes, typographie, règles
    themes.html           les trois thèmes du desktop côte à côte
    apps.html             icônes officielles des apps (Knowledge K1, Automation A2)
    explorations.html     toutes les pistes écartées, conservées pour mémoire

Les sources de forme et de couleur : generate.py (logo), apps.py (icônes), proposal.py (thèmes).
Les mises en page : common.py.
"""
from pathlib import Path

import apps
import generate as g
import proposal
from common import card, grid, indent, inline, page

HERE = Path(__file__).parent

# Palettes affichées dans les aperçus du logo (l'alignement sur le desktop est à venir)
PAL = "orange"


def write(name, html):
    (HERE / name).write_text(html, encoding="utf-8")
    print(name)


# --- briques réutilisées ------------------------------------------------------
def lockup(svg, label="Seshat AI", cls=""):
    return f'<div class="lock">\n{indent(inline(svg), 2)}\n  <span class="word">{label}</span>\n</div>'


def logo_cards(style, palette_key):
    p = g.PALETTES[palette_key]
    f = g.build_files(style, p)
    return [
        card(f"{p['label']} · fond clair", lockup(f["seshat-mark-on-light.svg"])),
        card(f"{p['label']} · fond sombre", lockup(f["seshat-mark-on-dark.svg"]), kind="dark"),
    ], f


def icon_sizes(f):
    return (f'<div class="sizes">\n{indent(inline(f["seshat-app-icon.svg"], "a"))}\n'
            f'{indent(inline(f["seshat-app-icon.svg"], "b"))}\n{indent(inline(f["favicon.svg"], "c32"))}\n'
            f'{indent(inline(f["favicon.svg"], "c16"))}\n</div>')


def swatches(items):
    cells = "\n".join(
        f'<div class="sw" style="background:{bg};color:{fg};{"border:1px solid #ddd;" if bg.upper() in ("#F6F1EA", "#F7F6F2") else ""}">'
        f'{name}<br>{desc}</div>' for bg, fg, name, desc in items)
    return f'<div class="swatches">\n{indent(cells)}\n</div>'


def fmt(c):
    return ("%.1f" % c).replace(".", ",")


def colors_for(palette_key):
    p = g.PALETTES[palette_key]
    paper, ink = g.PAPER, g.INK
    return [
        (p["accent"], ink, f"{p['label']} {p['accent']}", f"sur sombre · {fmt(g.contrast(p['accent'], ink))}:1"),
        (p["accent_deep"], "#fff", f"{p['label']} profond {p['accent_deep']}", f"graphique sur clair · {fmt(g.contrast(p['accent_deep'], paper))}:1"),
        (p["accent_text"], "#fff", f"{p['label']} texte {p['accent_text']}", f"texte sur clair · {fmt(g.contrast(p['accent_text'], paper))}:1"),
    ]


def typography():
    return grid([
        card("Space Grotesk 600–700 · titres et logotype",
             '<div class="t1">Structurer pour que l\'IA serve.</div>'),
        card("Inter 400–600 · texte courant",
             '<div class="t2">Seshat AI aide les PME à identifier les bons cas d\'usage, puis à déployer des solutions '
             'souveraines, auto-hébergées, avec validation humaine.</div>'),
    ], wide=True)


# --- logo.html ---------------------------------------------------------------
def build_logo():
    sections = []
    for style, label in g.STYLES.items():
        cards = []
        first = None
        for key in g.PALETTES:
            c, f = logo_cards(style, key)
            cards += c
            first = first or f
        cards.append(card("Monochrome noir", lockup(first["seshat-mark-mono-black.svg"])))
        cards.append(card("Icône 112 / 56 px · favicon 32 / 16 px", icon_sizes(first)))
        sections.append(f"<h2>{label}</h2>\n" + grid(cards))
    sections.append("<h2>Typographie</h2>\n" + typography())
    rules = """<table>
  <tr><th>Règle</th><th>Détail</th></tr>
  <tr><td>Zone de protection</td><td>Au moins la largeur d'un pétale (ou d'une branche) autour de la marque.</td></tr>
  <tr><td>Taille minimale</td><td>Marque seule 16 px (favicon renforcé) ; marque et logotype 96 px de large.</td></tr>
  <tr><td>Accent vif sur fond clair</td><td>Interdit (contraste de 2,0 à 2,7:1) : utiliser la version « profond » ou « texte ».</td></tr>
  <tr><td>Effets</td><td>Pas de dégradé, pas d'ombre, pas d'étirement, pas de teinte hors palette.</td></tr>
  <tr><td>Fonds photo ou chargés</td><td>Versions monochromes.</td></tr>
</table>"""
    sections.append("<h2>Règles d'usage</h2>\n" + rules)
    return page(
        "Logo", "logo.html",
        "Inspiré de l'emblème de la déesse Seshat : une rosette de sept pétales sous un arc. Trois styles "
        "(<code>etoile</code> v1, <code>emblem</code> et <code>reseau</code> v2) et deux palettes, "
        "tous conservés. Les palettes de ce kit utilisent encore l'encre bleu nuit du premier jet ; "
        "leur alignement sur le charbon et l'orange du desktop est à faire.",
        "\n".join(sections))


# --- themes.html -------------------------------------------------------------
def build_themes():
    cards = "\n".join(indent(proposal.theme_card(n, t), 2) for n, t in proposal.THEMES.items())
    tokens = ["<table>", "  <tr><th>Jeton</th>" + "".join(f"<th>{n}</th>" for n in proposal.THEMES) + "</tr>"]
    for label, key in (("Fond", "root"), ("Barre latérale", "side"), ("Panneau", "panel"), ("Bordure", "border"),
                       ("Texte", "text"), ("Texte secondaire", "text2"), ("Texte atténué", "text3"),
                       ("Accent", "accent"), ("Texte du bouton", "btn_text"), ("Lien", "link")):
        tokens.append("  <tr><td>" + label + "</td>" + "".join(
            f'<td><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:{t[key]};'
            f'border:1px solid #bbb;margin-right:6px;vertical-align:-1px"></span>{t[key]}</td>'
            for t in proposal.THEMES.values()) + "</tr>")
    tokens.append("</table>")
    body = (f'<div class="grid wide">\n{cards}\n</div>\n<h2>Jetons de couleur</h2>\n' + "\n".join(tokens) +
            "\n<h2>Ce qu'on garde</h2>\n"
            '<div class="note">Décision du 2026-10-06 : on garde les trois versions et on ne tranche pas encore. '
            "L'orange <b>#EF7C2F</b> et le sombre charbon du desktop sont conservés. Le clair actuel a trois défauts mesurés "
            "(texte blanc sur bouton orange à 2,8:1, orange sur clair à 2,6:1, texte atténué à 3,1:1) ; "
            "le clair chaud les corrige.</div>")
    return page(
        "Couleurs et thèmes", "themes.html",
        "Les thèmes actuels de <code>seshat-desktop</code> comparés à un clair chaud proposé, avec le logo "
        "<code>reseau</code> dans une maquette de chat.", body)


# --- apps.html ---------------------------------------------------------------
def build_apps():
    family = g.svg("0 0 100 100", f'<rect x="1" y="1" width="98" height="98" rx="21" fill="{apps.CHAR}"/>'
                   f'<g transform="translate(50 50) scale(0.8) translate(-50 -43)">{g.reseau_inner(apps.CREAM, apps.ORANGE)}</g>')
    out = ['<div class="card" style="flex-direction:row;align-items:center">\n'
           + indent(inline(family), 2).replace("<svg", '<svg width="84" height="84"', 1)
           + '\n  <p style="margin:0"><b>Repère de famille :</b> le logo Seshat AI / SeshatOS (style <code>reseau</code>) dans la même tuile.</p>\n</div>']
    for key, (label, fn, name) in apps.GLYPHS.items():
        v = apps.variants(fn)
        big = lambda k, kind="", note="": card(
            k, f'<div class="big">\n{indent(inline(v[k]), 2)}\n</div>\n<small>{note}</small>', kind=kind)
        favs = card("favicon", f'<div class="sizes">\n{indent(inline(v["favicon"], "b"))}\n{indent(inline(v["favicon"], "c32"))}\n'
                               f'{indent(inline(v["favicon"], "c16"))}\n</div>\n<small>56, 32 et 16 px (traits renforcés)</small>')
        cards = [big("icon-dark", note="Usage principal"), big("icon-light", note="Fond clair"),
                 big("icon-orange", note="Tuile orange"), big("glyph-on-light", note="Glyphe seul, fond clair"),
                 big("glyph-on-dark", "dark", "Glyphe seul, fond sombre"), big("mono-black", note="Monochrome noir"),
                 big("mono-white", "dark", "Monochrome blanc"), favs]
        chips = ('<div class="chips">\n'
                 f'  <div class="chip light">{inline(v["icon-dark"])}{label}</div>\n'
                 f'  <div class="chip darkc">{inline(v["icon-dark"])}{label}</div>\n</div>')
        out.append(f"<h2>{label} · {name}</h2>\n{grid(cards)}\n{chips}")
    body = "\n".join(out) + (
        "\n<h2>Règles de la famille</h2>\n<table>\n"
        "  <tr><td>1</td><td>Même tuile arrondie pour toutes les apps.</td></tr>\n"
        "  <tr><td>2</td><td>Un seul accent, l'orange : la forme distingue les apps, pas la couleur.</td></tr>\n"
        "  <tr><td>3</td><td>Glyphe simple en traits arrondis et nœuds, comme le logo.</td></tr>\n"
        "  <tr><td>4</td><td>Les autres apps (Data, Inbox, Companion, Team, Scheduling) n'ont pas d'icône : on les dessine quand on commence réellement chacune.</td></tr>\n"
        "</table>")
    return page(
        "Icônes des apps SeshatOS", "apps.html",
        "Knowledge (K1, livre-graphe) et Automation (A2, point de contrôle) : retenues le 2026-10-06. "
        "Huit variantes chacune, dans <code>logo/apps/&lt;app&gt;/</code>.", body)


# --- explorations.html -------------------------------------------------------
LOGO_TRACKS = [
    ("A-heptagramme", "A · Heptagramme : étoile à sept branches tracée d'un trait"),
    ("B-registre", "B · Registre : un S en ligne de registre"),
    ("C-constellation", "C · Constellation : sept nœuds reliés"),
    ("D1-etoile-et-arc", "D1 · Étoile pleine et arc (devenu le style etoile v1)"),
    ("D2-croissant-et-etoile", "D2 · Croissant et étoile en contour (écarté)"),
    ("D3-etoile-graphe", "D3 · Étoile-graphe : sept nœuds et arc (non retenu)"),
]


def build_explorations():
    cards = []
    for name, desc in LOGO_TRACKS:
        path = HERE / "explorations" / f"{name}.svg"
        if path.exists():
            raw = path.read_text(encoding="utf-8")
            cards.append(card(desc, f'<div class="big">\n{indent(inline(raw), 2)}\n</div>'))
    sections = ["<h2>Logo : pistes de départ</h2>\n" + grid(cards)]
    for key, opts in apps.EXPLORATIONS.items():
        cs = [card(n, f'<p>{desc}</p>\n<div class="big">\n{indent(inline(apps.tile(body)), 2)}\n</div>')
              for n, (desc, body) in opts.items()]
        sections.append(f"<h2>{apps.GLYPHS[key][0]} : pistes écartées</h2>\n" + grid(cs))
    return page(
        "Explorations", "explorations.html",
        "Les pistes écartées, conservées pour mémoire. Les versions retenues sont dans les autres pages.",
        "\n".join(sections))


# --- index.html --------------------------------------------------------------
def build_index():
    c, f_emblem = logo_cards("emblem", PAL)
    c2, f_reseau = logo_cards("reseau", PAL)
    pal = g.PALETTES[PAL]
    desktop = [(apps.CHAR, "#fff", f"Charbon {apps.CHAR}", "fond sombre du desktop"),
               (apps.ORANGE, "#1F1B16", f"Orange {apps.ORANGE}", "accent du desktop"),
               (apps.CREAM, "#1F1B16", f"Crème {apps.CREAM}", "texte sur sombre"),
               (apps.PAPER, "#1F1B16", f"Papier {apps.PAPER}", "clair chaud proposé")]
    nav_cards = [
        card("Logo", "<p>Trois styles, deux palettes, typographie, règles d'usage.</p>\n<span class=\"go\">Ouvrir →</span>",
             tag="a", href="logo.html"),
        card("Couleurs et thèmes", "<p>Sombre actuel, clair actuel et clair chaud proposé, en maquette.</p>\n<span class=\"go\">Ouvrir →</span>",
             tag="a", href="themes.html"),
        card("Icônes des apps", "<p>Knowledge (K1) et Automation (A2) : huit variantes chacune.</p>\n<span class=\"go\">Ouvrir →</span>",
             tag="a", href="apps.html"),
        card("Explorations", "<p>Toutes les pistes écartées, conservées pour mémoire.</p>\n<span class=\"go\">Ouvrir →</span>",
             tag="a", href="explorations.html"),
    ]
    v_k, v_a = apps.variants(apps.k1), apps.variants(apps.a2)
    overview = [
        card("Logo principal · reseau", lockup(f_reseau["seshat-mark-on-light.svg"])),
        card("Logo compact · emblem", lockup(f_emblem["seshat-mark-on-light.svg"])),
        card("Sur fond sombre", lockup(f_reseau["seshat-mark-on-dark.svg"]), kind="dark"),
        card("Apps", '<div class="chips">\n'
                     f'  <div class="chip light">{inline(v_k["icon-dark"])}Knowledge</div>\n'
                     f'  <div class="chip light">{inline(v_a["icon-dark"])}Automation</div>\n</div>'),
    ]
    status = """<ul style="color:#5E564C;line-height:1.7;font-size:14px;margin:0;padding-left:20px">
  <li><b>Logo</b> : styles v2 <code>emblem</code> et <code>reseau</code> retenus (l'étoile v1 est gardée), deux palettes conservées.</li>
  <li><b>Thèmes du desktop</b> : les trois versions conservées, aucune tranchée.</li>
  <li><b>Icônes des apps</b> : K1 pour Knowledge, A2 pour Automation. Les autres apps plus tard.</li>
  <li><b>À faire</b> : aligner les palettes du logo sur le charbon et l'orange du desktop ; vectoriser le logotype ; exports PNG ; recherche INPI.</li>
</ul>"""
    body = ("<h2>État des décisions</h2>\n<div class=\"note\">\n" + indent(status, 2) + "\n</div>\n"
            "<h2>Aperçu d'ensemble</h2>\n" + grid(overview) +
            "\n<h2>Couleurs du desktop</h2>\n" + swatches(desktop) +
            "\n<h2>Typographie</h2>\n" + typography() +
            "\n<h2>Pages</h2>\n" + grid(nav_cards))
    return page(
        "Identité visuelle Seshat AI", "index.html",
        "Un point d'entrée pour tout le kit : logo, couleurs, thèmes, icônes des apps. "
        "Tout est généré par <code>python build.py</code> à partir de quelques constantes.",
        body)


def main():
    import generate
    generate.main()
    apps.main()
    write("index.html", build_index())
    write("logo.html", build_logo())
    write("themes.html", build_themes())
    write("apps.html", build_apps())
    write("explorations.html", build_explorations())


if __name__ == "__main__":
    main()
