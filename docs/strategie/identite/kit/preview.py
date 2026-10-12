"""The preview page: every generated logo on the background it is meant for.

One static page, no scripts. Logos are <img> elements (not inlined) so that the
gradient ids of different files never collide.
"""
from __future__ import annotations

from html import escape
from pathlib import Path
from string import Template

from . import tokens as t
from . import variants
from .marks import MARKS
from .outputs import LOGO_DIR, ROOT, generate

OUT_DIR = "apercu"
SWATCHES = (
    ("Orange", t.ORANGE), ("Orange light", t.ORANGE_LIGHT), ("Orange deep", t.ORANGE_DEEP),
    ("Ink", t.INK), ("Charcoal", t.CHARCOAL), ("Grey", t.GREY),
    ("Paper", t.PAPER), ("Cream", t.CREAM), ("Dark tile", t.TILE_DARK), ("Root", t.ROOT),
)


def _stage(name: str) -> str:
    if name == "mono-white.svg":
        return "on-orange"
    if name.endswith("-on-dark.svg"):
        return "on-dark"
    return "on-light"


def _figure(key: str, name: str) -> str:
    wide = " wide" if name.startswith("lockup") else ""
    src = f"../{LOGO_DIR}/{key}/{name}"
    note = escape(variants.USAGE.get(name, ""))
    return (f'<figure class="{_stage(name)}{wide}"><div class="stage"><img src="{src}" alt="{escape(name)}"></div>'
            f"<figcaption><b>{escape(name)}</b>{note}</figcaption></figure>")


def _product(key: str, files: list[str]) -> str:
    mark = MARKS[key]
    grid = "\n".join(_figure(key, n) for n in files)
    sizes = "".join(
        f'<figure class="on-light"><img src="../{LOGO_DIR}/{key}/favicon.svg" width="{px}" height="{px}" alt="{px}px"></figure>'
        for px in (16, 32, 48, 64))
    return (f'<section id="{key}"><h2>{escape(mark.name)}</h2><p>{escape(mark.summary)}</p>\n'
            f'<div class="grid">\n{grid}\n</div>\n<div class="sizes">{sizes}</div></section>')


def page() -> str:
    names: dict[str, list[str]] = {}
    for rel in generate():
        parts = rel.split("/")
        if len(parts) == 3 and parts[2].endswith(".svg"):
            names.setdefault(parts[1], []).append(parts[2])
    nav = " ".join(f'<a href="#{k}">{escape(m.name)}</a>' for k, m in MARKS.items())
    nav += ' <a href="signatures.html">Signatures mail</a>'
    swatches = "".join(f'<li><i style="background:{c}"></i><b>{n}</b><br>{c}</li>' for n, c in SWATCHES)
    products = "\n".join(_product(k, names[k]) for k in MARKS)
    template = Template((ROOT / "templates" / "page.html").read_text(encoding="utf-8"))
    return template.substitute(nav=nav, swatches=swatches, products=products)


def _files() -> dict[str, str]:
    return {
        f"{OUT_DIR}/index.html": page(),
        f"{OUT_DIR}/style.css": (ROOT / "templates" / "style.css").read_text(encoding="utf-8"),
    }


def write(root: Path = ROOT) -> list[str]:
    changed = []
    for rel, content in _files().items():
        target = root / rel
        if target.exists() and target.read_text(encoding="utf-8") == content:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8", newline="\n")
        changed.append(rel)
    return changed


def check(root: Path = ROOT) -> list[str]:
    problems = []
    for rel, content in _files().items():
        target = root / rel
        if not target.exists():
            problems.append(f"missing: {rel}")
        elif target.read_text(encoding="utf-8") != content:
            problems.append(f"out of date: {rel}")
    return problems
