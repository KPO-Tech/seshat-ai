"""Mail signatures (Gmail): same table layout as before, colours from the tokens.

Email clients ignore stylesheets, so every style is inline. The logo is a PNG
hosted on the website (export.py makes it; copy it to website/public/brand/).
signature-personnelle.html holds personal details and is deliberately not built.
"""
from __future__ import annotations

from pathlib import Path
from string import Template

from . import tokens as t
from .outputs import ROOT

OUT_DIR = ROOT.parent / "signatures-mail"
LOGO_URL = "https://seshat-ai.com/brand/signature-logo.png"
MUTED = "#6B6058"


def _link(href: str, label: str, *, bold: bool = False) -> str:
    weight = ";font-weight:bold" if bold else ""
    return f'<a href="{href}" style="color:{t.ORANGE_TEXT};text-decoration:none{weight}">{label}</a>'


def _div(content: str, *, top: int = 0, colour: str | None = None, size: int | None = None,
         bold: bool = False) -> str:
    style = []
    if top:
        style.append(f"padding-top:{top}px")
    if size:
        style.append(f"font-size:{size}px")
    if bold:
        style.append("font-weight:bold")
    if colour:
        style.append(f"color:{colour}")
    return f'      <div style="{";".join(style)}">{content}</div>'


def _signature(title: str, logo_size: int, lines: list[str]) -> str:
    template = Template((ROOT / "templates" / "signature.html").read_text(encoding="utf-8"))
    return template.substitute(title=title, logo_url=LOGO_URL, logo_size=logo_size, text=t.CHARCOAL,
                               accent=t.ORANGE, lines="\n".join(lines))


def files() -> dict[str, str]:
    dot = " &nbsp;·&nbsp; "
    contact = _signature("Signature contact", 80, [
        _div("Stéphane Kpoviessi", size=16, bold=True, colour=t.CHARCOAL),
        _div("Fondateur, Seshat AI", colour=MUTED),
        _div("Conseil et intégration d'IA souveraine pour PME et ETI", top=6, colour=MUTED),
        _div(_link("https://seshat-ai.com", "seshat-ai.com", bold=True) + dot
             + _link("mailto:contact@seshat-ai.com", "contact@seshat-ai.com"), top=6),
    ])
    support = _signature("Signature support", 64, [
        _div("Support Seshat AI", size=15, bold=True, colour=t.CHARCOAL),
        _div(_link("mailto:support@seshat-ai.com", "support@seshat-ai.com"), top=4),
        _div("Documentation : " + _link("https://seshat-ai.com/en/docs", "seshat-ai.com/en/docs"),
             top=4, colour=MUTED),
    ])
    return {"signature-contact.html": contact, "signature-support.html": support}


def write(root: Path = OUT_DIR) -> list[str]:
    changed = []
    for name, content in files().items():
        target = root / name
        if target.exists() and target.read_text(encoding="utf-8") == content:
            continue
        target.write_text(content, encoding="utf-8", newline="\n")
        changed.append(f"signatures-mail/{name}")
    return changed


def check(root: Path = OUT_DIR) -> list[str]:
    problems = []
    for name, content in files().items():
        target = root / name
        if not target.exists():
            problems.append(f"missing: signatures-mail/{name}")
        elif target.read_text(encoding="utf-8") != content:
            problems.append(f"out of date: signatures-mail/{name}")
    return problems
