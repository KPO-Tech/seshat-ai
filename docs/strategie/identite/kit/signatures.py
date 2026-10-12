"""Mail signatures (Gmail), all on one page: apercu/signatures.html.

Email clients ignore stylesheets, so every style inside a signature is inline.
The logo is a PNG hosted on the website (publish.py writes it to
website/public/brand/), so the images appear once the site is deployed.

The personal signature holds personal details and is deliberately not built.
"""
from __future__ import annotations

from html import escape
from pathlib import Path
from string import Template

from . import tokens as t
from .outputs import ROOT

LOGO_URL = "https://seshat-ai.com/brand/seshat-ai-logo.png"   # 660 x 200, shown at 2x density
LOGO_RATIO = 200 / 660
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


def _signature(logo_width: int, lines: list[str]) -> str:
    """One signature: the logo, a rule in the brand orange, then the lines."""
    height = round(logo_width * LOGO_RATIO)
    return f"""<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:{t.CHARCOAL}">
  <tr>
    <td valign="middle" style="padding:0 16px 0 0"><img src="{LOGO_URL}" alt="Seshat AI" width="{logo_width}" height="{height}" style="display:block;border:0"></td>
    <td valign="middle" style="padding:2px 0 2px 16px;border-left:2px solid {t.ORANGE}">
{chr(10).join(lines)}
    </td>
  </tr>
</table>"""


def signatures() -> list[tuple[str, str, str]]:
    """(identifier, title, html) for each signature on the page."""
    dot = " &nbsp;·&nbsp; "
    contact = _signature(200, [
        _div("Stéphane Kpoviessi", size=16, bold=True, colour=t.CHARCOAL),
        _div("Fondateur, Seshat AI", colour=MUTED),
        _div("Conseil et intégration d'IA souveraine pour PME et ETI", top=6, colour=MUTED),
        _div(_link("https://seshat-ai.com", "seshat-ai.com", bold=True) + dot
             + _link("mailto:contact@seshat-ai.com", "contact@seshat-ai.com"), top=6),
    ])
    support = _signature(160, [
        _div("Support Seshat AI", size=15, bold=True, colour=t.CHARCOAL),
        _div(_link("mailto:support@seshat-ai.com", "support@seshat-ai.com"), top=4),
        _div("Documentation : " + _link("https://seshat-ai.com/en/docs", "seshat-ai.com/en/docs"),
             top=4, colour=MUTED),
    ])
    return [
        ("contact", "Signature contact", contact),
        ("support", "Signature support", support),
    ]


def page() -> str:
    blocks = []
    for ident, title, html in signatures():
        blocks.append(
            f'<section class="signature" id="{ident}">\n'
            f'  <header><h2>{escape(title)}</h2><button type="button" data-copy="{ident}">Copier la signature</button></header>\n'
            f'  <div class="sheet" id="sheet-{ident}">\n{html}\n  </div>\n</section>')
    template = Template((ROOT / "templates" / "signatures.html").read_text(encoding="utf-8"))
    return template.substitute(blocks="\n".join(blocks))


def write(root: Path = ROOT) -> list[str]:
    target = root / "apercu" / "signatures.html"
    content = page()
    if target.exists() and target.read_text(encoding="utf-8") == content:
        return []
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8", newline="\n")
    return ["apercu/signatures.html"]


def check(root: Path = ROOT) -> list[str]:
    target = root / "apercu" / "signatures.html"
    if not target.exists():
        return ["missing: apercu/signatures.html"]
    return [] if target.read_text(encoding="utf-8") == page() else ["out of date: apercu/signatures.html"]
