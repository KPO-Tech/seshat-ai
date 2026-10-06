"""Données des trois thèmes du desktop comparés : sombre actuel, clair actuel, clair chaud proposé.

Valeurs sources : seshat-desktop/src/renderer/styles/tailwind.css (thèmes actuels).
Le HTML de la maquette est dans templates/theme_card.html ; ce module n'a que des données
et la fonction qui les y injecte.
"""
import mark as g
from render import inline, tpl

THEMES = {
    "Sombre actuel (conservé)": dict(
        root="#2F2E34", side="#2C2A31", panel="#3A3941", muted="#4A4852", border="#4D4A54",
        text="#E7E2DA", text2="#B6AEA3", text3="#918A82", accent="#EF7C2F", btn_text="#1F1B16",
        arc="#E7E2DA", mark_accent="#EF7C2F", link="#EF7C2F",
        note="Charbon chaud, texte crème 10,4:1, orange 4,9:1. Réussi : conservé."),
    "Clair actuel (conservé pour l'instant)": dict(
        root="#F7F7F5", side="#EFEFEE", panel="#FFFFFF", muted="#F1F1F0", border="#E1E1DF",
        text="#171717", text2="#5F6368", text3="#8A8D91", accent="#EF7C2F", btn_text="#FFFFFF",
        arc="#171717", mark_accent="#EF7C2F", link="#EF7C2F",
        note="Gris froid. Texte blanc sur bouton orange 2,8:1, orange sur clair 2,6:1, texte atténué 3,1:1."),
    "Clair chaud (proposé)": dict(
        root="#F6F1EA", side="#EDE6DC", panel="#FFFCF8", muted="#EFE8DE", border="#E3DACD",
        text="#1F1B16", text2="#5E564C", text3="#7A7064", accent="#EF7C2F", btn_text="#1F1B16",
        arc="#2F2E34", mark_accent="#C2570C", link="#A94A0A",
        note="Papier chaud, texte 15,2:1, bouton orange à texte sombre 6,2:1, liens 5,1:1."),
}


def theme_card(name, t):
    logo = inline(g.svg(g.EMB_VIEWBOX, g.reseau_inner(t["arc"], t["mark_accent"])))
    css_vars = (f"--root:{t['root']};--side:{t['side']};--panel:{t['panel']};--mut:{t['muted']};--b:{t['border']};"
                f"--tx:{t['text']};--tx2:{t['text2']};--tx3:{t['text3']};--acc:{t['accent']};"
                f"--btn:{t['btn_text']};--lnk:{t['link']}")
    return tpl("theme_card", vars=css_vars, name=name, logo=logo, note=t["note"])
