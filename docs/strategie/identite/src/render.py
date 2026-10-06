"""Moteur de templates minimal (sans dépendance) et utilitaires SVG.

Les modèles HTML sont dans templates/ ; le code Python ne contient pas de HTML.
Syntaxe : {{nom}} dans un modèle. Si le marqueur est seul sur sa ligne, la valeur
(multi-lignes) est indentée comme le marqueur ; sinon elle est insérée telle quelle.
Une variable manquante est une erreur (on ne génère jamais une page cassée sans le savoir).
"""
import re
from pathlib import Path
from xml.dom import minidom

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "templates"
_PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")


def indent(text: str, pad: str) -> str:
    """Indente toutes les lignes non vides de `text` avec `pad`."""
    return "\n".join(pad + ln if ln.strip() else ln for ln in text.splitlines())


def tpl(_name: str, /, **values) -> str:
    """Rend templates/<_name>.html en remplaçant les {{marqueurs}}."""
    path = TEMPLATES / f"{_name}.html"
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        keys = _PLACEHOLDER.findall(line)
        for key in keys:
            if key not in values:
                raise KeyError(f"{_name}.html : variable « {key} » non fournie")
        alone = _PLACEHOLDER.fullmatch(line.strip())
        if alone:
            pad = line[: len(line) - len(line.lstrip())]
            out.append(indent(str(values[alone.group(1)]), pad))
        else:
            out.append(_PLACEHOLDER.sub(lambda m: str(values[m.group(1)]), line))
    return "\n".join(out)


def pretty_svg(svg: str) -> str:
    """Remet un SVG sur plusieurs lignes, indenté (sans déclaration XML)."""
    text = minidom.parseString(svg).toprettyxml(indent="  ")
    lines = [ln for ln in text.splitlines() if ln.strip() and not ln.startswith("<?xml")]
    return "\n".join(lines) + "\n"


def inline(svg: str, css_class: str = "") -> str:
    """SVG à insérer dans une page : lisible, avec une classe CSS optionnelle."""
    text = pretty_svg(svg).rstrip("\n")
    return text.replace("<svg", f'<svg class="{css_class}"', 1) if css_class else text
