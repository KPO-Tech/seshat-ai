"""Assemble les pages d'aperçu : choisit les données (src/*.py) et les injecte dans templates/*.html.

Aucun HTML ici : seulement de l'assemblage. Le texte et la structure des pages sont dans templates/.
Chaque fonction build_<page>() renvoie le HTML complet d'une page.
"""
import appicons as apps
import cloudmark
import mark as g
import runtimemark
import themes
from render import indent, inline, tpl

# Pages du kit, dans l'ordre de la barre de navigation : (fichier, libellé)
PAGES = [
    ("index.html", "Accueil"),
    ("logo.html", "Logo"),
    ("themes.html", "Couleurs et thèmes"),
    ("apps.html", "Icônes des apps"),
    ("cloud.html", "SeshatCloud"),
    ("runtime.html", "seshat (runtime)"),
    ("explorations.html", "Explorations"),
]

# Palette utilisée dans les aperçus du logo (celle du desktop)
PAL = "orange"
# Les pages sont dans apercu/ ; les SVG générés sont dans logo/ (un niveau au-dessus)
LOGO_URL = "../logo"


# --- briques ---------------------------------------------------------------------
def card(title, body, dark=False, href="", tag="div"):
    attrs = f' href="{href}"' if href else ""
    return tpl("card", tag=tag, kind=" dark" if dark else "", attrs=attrs, title=title, body=body)


def grid(cards, wide=False):
    return tpl("grid", kind=" wide" if wide else "", items="\n".join(cards))


def lockup(svg, label="Seshat AI"):
    return tpl("lockup", svg=inline(svg), label=label)


def big(svg):
    return tpl("big", svg=inline(svg))


def file_link(url, label):
    return tpl("file_link", href=url, label=label)


def chip(svg, label, dark=False):
    return tpl("chip", kind="dark" if dark else "light", svg=inline(svg), label=label)


def chips(items):
    return tpl("chips", items="\n".join(items))


def section(title, content):
    return tpl("section", title=title, content=content)


def fmt(ratio):
    return ("%.1f" % ratio).replace(".", ",")


def swatches(items):
    cells = []
    for bg, fg, name, desc in items:
        bordered = bg.upper() in (g.PAPER.upper(), apps.PAPER.upper())
        cells.append(tpl("swatch", extra=" bordered" if bordered else "", bg=bg, fg=fg, name=name, desc=desc))
    return tpl("swatches", items="\n".join(cells))


def page(current, title, intro, body):
    nav = "\n".join(
        tpl("nav_link", href=h, label=lab, current=' class="on"' if h == current else "") for h, lab in PAGES)
    return tpl("base", title=title, intro=intro, nav=nav, body=body)


def svg_url(style, palette, name):
    return f"{LOGO_URL}/{style}/{palette}/{name}"


# --- logo.html ---------------------------------------------------------------------
def logo_style_section(style, label):
    cards, first = [], None
    for key, p in g.PALETTES.items():
        files = g.build_files(style, p)
        first = first or (key, files)
        for kind, fname, dark in (("fond clair", "seshat-mark-on-light.svg", False),
                                  ("fond sombre", "seshat-mark-on-dark.svg", True)):
            body = lockup(files[fname]) + "\n" + file_link(svg_url(style, key, fname), "fichier SVG")
            cards.append(card(f"{p['label']} · {kind}", body, dark=dark))
    key, files = first
    cards.append(card("Monochrome noir", lockup(files["seshat-mark-mono-black.svg"]) + "\n"
                      + file_link(svg_url(style, key, "seshat-mark-mono-black.svg"), "fichier SVG")))
    icons = "\n".join([inline(files["seshat-app-icon.svg"], "a"), inline(files["seshat-app-icon.svg"], "b"),
                       inline(files["favicon.svg"], "c32"), inline(files["favicon.svg"], "c16")])
    cards.append(card("Icône 112 / 56 px · favicon 32 / 16 px", tpl("sizes", icons=icons) + "\n"
                      + file_link(svg_url(style, key, "seshat-app-icon.svg"), "icône SVG") + "\n"
                      + file_link(svg_url(style, key, "favicon.svg"), "favicon SVG")))
    return section(label, grid(cards))


def build_logo():
    styles = "\n".join(logo_style_section(s, lab) for s, lab in g.STYLES.items())
    body = tpl("page_logo", styles=styles, typography=tpl("typography"))
    intro = ("Inspiré de l'emblème de la déesse Seshat : une rosette de sept pétales sous un arc. Trois styles "
             "(<code>etoile</code> v1, <code>emblem</code> et <code>reseau</code> v2) et deux palettes, tous conservés. "
             "Les couleurs sont alignées sur le desktop : charbon <code>#2F2E34</code>, papier <code>#F6F1EA</code> et, "
             "pour la palette orange, l'orange <code>#EF7C2F</code> ; l'ambre est la variante plus sobre.")
    return page("logo.html", "Logo", intro, body)


# --- themes.html -------------------------------------------------------------------
TOKENS = (("Fond", "root"), ("Barre latérale", "side"), ("Panneau", "panel"), ("Bordure", "border"),
          ("Texte", "text"), ("Texte secondaire", "text2"), ("Texte atténué", "text3"),
          ("Accent", "accent"), ("Texte du bouton", "btn_text"), ("Lien", "link"))


def build_themes():
    cards = "\n".join(themes.theme_card(n, t) for n, t in themes.THEMES.items())
    heads = "\n".join(tpl("token_head", name=n) for n in themes.THEMES)
    rows = []
    for label, key in TOKENS:
        cells = "\n".join(tpl("token_cell", color=t[key]) for t in themes.THEMES.values())
        rows.append(tpl("token_row", label=label, cells=cells))
    tokens = tpl("tokens_table", heads=heads, rows="\n".join(rows))
    body = tpl("page_themes", themes=cards, tokens=tokens)
    intro = ("Les thèmes actuels de <code>seshat-desktop</code> comparés à un clair chaud proposé, "
             "avec le logo <code>reseau</code> dans une maquette de chat.")
    return page("themes.html", "Couleurs et thèmes", intro, body)


# --- apps.html ---------------------------------------------------------------------
APP_FILES = (("icon-dark", "Usage principal", False), ("icon-light", "Fond clair", False),
             ("icon-orange", "Tuile orange", False), ("glyph-on-light", "Glyphe seul, fond clair", False),
             ("glyph-on-dark", "Glyphe seul, fond sombre", True), ("mono-black", "Monochrome noir", False),
             ("mono-white", "Monochrome blanc", True))


def build_apps():
    family_svg = g.svg("0 0 100 100", f'<rect x="1" y="1" width="98" height="98" rx="21" fill="{apps.CHAR}"/>'
                       f'<g transform="translate(50 50) scale(0.8) translate(-50 -43)">'
                       f'{g.reseau_inner(apps.CREAM, apps.ORANGE)}</g>')
    sections = []
    for key, (label, fn, name) in apps.GLYPHS.items():
        v = apps.variants(fn)
        cards = []
        for vname, note, dark in APP_FILES:
            body = big(v[vname]) + f"\n<small>{note}</small>\n" + file_link(f"{LOGO_URL}/apps/{key}/{vname}.svg", "fichier SVG")
            cards.append(card(vname, body, dark=dark))
        icons = "\n".join([inline(v["favicon"], "b"), inline(v["favicon"], "c32"), inline(v["favicon"], "c16")])
        cards.append(card("favicon", tpl("sizes", icons=icons) + "\n<small>56, 32 et 16 px (traits renforcés)</small>\n"
                          + file_link(f"{LOGO_URL}/apps/{key}/favicon.svg", "fichier SVG")))
        row = chips([chip(v["icon-dark"], label), chip(v["icon-dark"], label, dark=True)])
        sections.append(section(f"{label} · {name}", grid(cards) + "\n" + row))
    body = tpl("page_apps", family=tpl("family", svg=inline(family_svg)), apps="\n".join(sections))
    intro = ("Knowledge (K1, livre-graphe) et Automation (A2, point de contrôle) : retenues le 2026-10-06. "
             "Huit variantes chacune, dans <code>logo/apps/&lt;app&gt;/</code>.")
    return page("apps.html", "Icônes des apps SeshatOS", intro, body)


# --- cloud.html et runtime.html : pistes de logo dérivées du logo principal -----------------
def _tracks_page(filename, title, intro, template, module, folder, brand, extra=None):
    sections = []
    for name, (desc, _vb, _fn, _cy) in module.OPTIONS.items():
        v = module.variants(name)
        base = f"{LOGO_URL}/{folder}/{name}"

        def lock(key, dark=False, label=""):
            body = lockup(v[key], brand) + "\n" + file_link(f"{base}/{key}.svg", "fichier SVG")
            return card(label, body, dark=dark)

        icons = "\n".join([inline(v["icon-dark"], "a"), inline(v["icon-dark"], "b"),
                            inline(v["icon-dark"], "c32"), inline(v["icon-dark"], "c16")])
        icon_card = card("Icône", tpl("sizes", icons=icons) + "\n" + file_link(f"{base}/icon-dark.svg", "fichier SVG"))
        cards = [lock("on-light", label="Fond clair"), lock("on-dark", dark=True, label="Fond sombre"),
                 lock("mono-black", label="Monochrome noir"), icon_card]
        sections.append(section(name, f"<p>{desc}</p>\n" + grid(cards)))
    return page(filename, title, intro, tpl(template, options="\n".join(sections), **(extra or {})))


def build_cloud():
    return _tracks_page("cloud.html", "Logo de SeshatCloud",
                        "Logo retenu pour SeshatCloud (piste Cl3, arc-nuage) et pistes écartées.",
                        "page_cloud", cloudmark, "cloud/explorations", "Seshat Cloud",
                        extra={"official": _cloud_official()})


def _official_section(v, base, brand, title, fav_note):
    """Section « logo officiel » d'une marque : toutes les variantes, présentées de la même façon."""
    def lock(key, dark=False, label=""):
        return card(label, lockup(v[key], brand) + "\n" + file_link(f"{base}/{key}.svg", "fichier SVG"), dark=dark)

    def sizes(svg_key, label):
        icons = "\n".join([inline(v[svg_key], "a"), inline(v[svg_key], "b"),
                            inline(v[svg_key], "c32"), inline(v[svg_key], "c16")])
        return card(label, tpl("sizes", icons=icons) + "\n" + file_link(f"{base}/{svg_key}.svg", "fichier SVG"))

    fav = "\n".join([inline(v["favicon"], "b"), inline(v["favicon"], "c32"), inline(v["favicon"], "c16")])
    cards = [lock("on-light", label="Fond clair"), lock("on-dark", dark=True, label="Fond sombre"),
             lock("mono-black", label="Monochrome noir"), lock("mono-white", dark=True, label="Monochrome blanc"),
             sizes("icon-dark", "Icône sombre"), sizes("icon-light", "Icône claire"),
             card("Favicon", tpl("sizes", icons=fav) + "\n<small>" + fav_note + "</small>\n"
                  + file_link(f"{base}/favicon.svg", "fichier SVG"))]
    return section(title, grid(cards))


def _runtime_official():
    return _official_section(runtimemark.official_variants(), f"{LOGO_URL}/runtime/seshat", "seshat",
                             "Logo officiel : Sh2, terminal",
                             "Traits renforcés, sans les trois points : 56, 32 et 16 px")


def _cloud_official():
    return _official_section(cloudmark.official_variants(), f"{LOGO_URL}/cloud/seshatcloud", "Seshat Cloud",
                             "Logo officiel : Cl3, arc-nuage",
                             "Traits renforcés : 56, 32 et 16 px")


def build_runtime():
    return _tracks_page("runtime.html", "Logo du runtime seshat",
                        "Logo retenu pour le runtime open source seshat (piste Sh2, terminal) et pistes écartées.",
                        "page_runtime", runtimemark, "runtime/explorations", "seshat",
                        extra={"official": _runtime_official()})


# --- explorations.html -------------------------------------------------------------
LOGO_TRACKS = (
    ("A-heptagramme", "A · Heptagramme : étoile à sept branches tracée d'un trait"),
    ("B-registre", "B · Registre : un S en ligne de registre"),
    ("C-constellation", "C · Constellation : sept nœuds reliés"),
    ("D1-etoile-et-arc", "D1 · Étoile pleine et arc (devenu le style etoile v1)"),
    ("D2-croissant-et-etoile", "D2 · Croissant et étoile en contour (écarté)"),
    ("D3-etoile-graphe", "D3 · Étoile-graphe : sept nœuds et arc (non retenu)"),
)


def build_explorations():
    cards = []
    for name, desc in LOGO_TRACKS:
        path = g.ROOT / "explorations" / f"{name}.svg"
        if path.exists():
            cards.append(card(desc, big(path.read_text(encoding="utf-8")) + "\n"
                              + file_link(f"../explorations/{name}.svg", "fichier SVG")))
    sections = [section("Logo : pistes de départ", grid(cards))]
    for key, opts in apps.EXPLORATIONS.items():
        cs = []
        for n, (desc, body) in opts.items():
            cs.append(card(n, f"<p>{desc}</p>\n" + big(apps.tile(body)) + "\n"
                           + file_link(f"{LOGO_URL}/apps/explorations/{key}/{n}.svg", "fichier SVG")))
        sections.append(section(f"{apps.GLYPHS[key][0]} : pistes écartées", grid(cs)))
    body = tpl("page_explorations", sections="\n".join(sections))
    return page("explorations.html", "Explorations",
                "Les pistes écartées, conservées pour mémoire. Les versions retenues sont dans les autres pages.", body)


# --- index.html --------------------------------------------------------------------
def build_index():
    pal = g.PALETTES[PAL]
    f_reseau = g.build_files("reseau", pal)
    f_emblem = g.build_files("emblem", pal)
    k, a = apps.variants(apps.k1), apps.variants(apps.a2)
    overview = grid([
        card("Logo principal · reseau", lockup(f_reseau["seshat-mark-on-light.svg"])),
        card("Logo compact · emblem", lockup(f_emblem["seshat-mark-on-light.svg"])),
        card("Sur fond sombre", lockup(f_reseau["seshat-mark-on-dark.svg"]), dark=True),
        card("Apps", chips([chip(k["icon-dark"], "Knowledge"), chip(a["icon-dark"], "Automation")])),
    ])
    desktop = swatches([
        (apps.CHAR, "#fff", f"Charbon {apps.CHAR}", "fond sombre du desktop"),
        (apps.ORANGE, "#1F1B16", f"Orange {apps.ORANGE}", "accent du desktop"),
        (apps.CREAM, "#1F1B16", f"Crème {apps.CREAM}", "texte sur sombre"),
        (apps.PAPER, "#1F1B16", f"Papier {apps.PAPER}", "clair chaud proposé"),
    ])
    cards = {
        "logo.html": "Trois styles, deux palettes, typographie, règles d'usage.",
        "themes.html": "Sombre actuel, clair actuel et clair chaud proposé, en maquette.",
        "apps.html": "Knowledge (K1) et Automation (A2) : huit variantes chacune.",
        "cloud.html": "Trois pistes de logo pour SeshatCloud, dérivées du logo principal.",
        "runtime.html": "Trois pistes de logo pour le runtime seshat (variation développeurs).",
        "explorations.html": "Toutes les pistes écartées, conservées pour mémoire.",
    }
    labels = dict(PAGES)
    pages = grid([card(labels[h], f"<p>{txt}</p>\n" + '<span class="go">Ouvrir →</span>', href=h, tag="a")
                  for h, txt in cards.items()])
    body = tpl("page_index", overview=overview, swatches=desktop, typography=tpl("typography"), pages=pages)
    intro = ("Un point d'entrée pour tout le kit : logo, couleurs, thèmes, icônes des apps. "
             "Tout est généré par <code>python build.py</code> à partir de quelques constantes.")
    return page("index.html", "Identité visuelle Seshat AI", intro, body)


BUILDERS = {
    "index.html": build_index,
    "logo.html": build_logo,
    "themes.html": build_themes,
    "apps.html": build_apps,
    "cloud.html": build_cloud,
    "runtime.html": build_runtime,
    "explorations.html": build_explorations,
}
