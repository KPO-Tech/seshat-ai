"""The social images (1200 x 630) the site shows when a link outside it is shared.

They are built from `templates/og.html`, with the kit's colours, the official
Seshat AI lockup and the two typefaces vendored in `fonts/`, then rendered by Edge
at publish time like the other PNGs. The three images used to be made by hand and
drifted: the lockup and the orange they carried were a generation behind the kit.
Nothing here is hand-made, so a change to `tokens.py`, to the logo or to the copy
below reaches them with `python publish.py --apply`.

The copy is the site's own — the same sentences as the pages that use these images
(`website/src/layouts/Base.astro` and `Docs.astro` for the file names).
"""
from __future__ import annotations

import base64
from pathlib import Path
from string import Template
from tempfile import TemporaryDirectory

from . import export
from . import tokens as t
from .outputs import LOGO_DIR, ROOT

WIDTH, HEIGHT = 1200, 630
DOMAIN = "seshat-ai.com"
FONT_DIR = "fonts"
DISPLAY_FONT = "space-grotesk-latin-wght-normal.woff2"
TEXT_FONT = "inter-latin-wght-normal.woff2"
LOCKUP = "seshat-ai/lockup-on-light.svg"

# One entry per og:image the site references.
PAGES: tuple[dict[str, str], ...] = (
    {"file": "og-fr.png", "lang": "fr", "doc_title": "Seshat AI",
     "before": "L'IA utile, qui reste ", "accent": "chez vous.",
     "subtitle": "Conseil et intégration d'IA souveraine pour PME et ETI."},
    {"file": "og-en.png", "lang": "en", "doc_title": "Seshat AI",
     "before": "Useful AI that stays ", "accent": "with you.",
     "subtitle": "Sovereign AI consulting and integration for SMEs and mid-sized companies."},
    {"file": "og-docs.png", "lang": "en", "doc_title": "Seshat documentation",
     "before": "Seshat ", "accent": "documentation.",
     "subtitle": "The open source runtime for AI agents, written in Go. Install it, run an agent, embed it."},
)


def files() -> list[str]:
    """The file names, in the order they are planned."""
    return [entry["file"] for entry in PAGES]


def entry(name: str) -> dict[str, str]:
    for candidate in PAGES:
        if candidate["file"] == name:
            return candidate
    raise KeyError(f"no social image named {name}: expected one of {files()}")


def _font(name: str) -> str:
    path = ROOT / FONT_DIR / name
    if not path.exists():
        raise SystemExit(f"{FONT_DIR}/{name} is missing: the social images are rendered with it, "
                         f"see {FONT_DIR}/README.md")
    return base64.b64encode(path.read_bytes()).decode("ascii")


def _lockup() -> str:
    """The official lockup, inlined so the page's fonts apply to its name."""
    markup = (ROOT / LOGO_DIR / LOCKUP).read_text(encoding="utf-8")
    return markup[markup.index("<svg"):].strip()


def html(name: str) -> str:
    """The page Edge renders for one social image."""
    page = entry(name)
    template = Template((ROOT / "templates" / "og.html").read_text(encoding="utf-8"))
    return template.substitute(
        lang=page["lang"], doc_title=page["doc_title"], before=page["before"], accent=page["accent"],
        subtitle=page["subtitle"], domain=DOMAIN, lockup=_lockup(),
        display_font=_font(DISPLAY_FONT), text_font=_font(TEXT_FONT),
        width=WIDTH, height=HEIGHT, paper=t.PAPER, ink=t.INK, grey=t.GREY,
        orange=t.ORANGE, orange_deep=t.ORANGE_DEEP)


def render(name: str, target: Path) -> None:
    """Write one social image as a PNG, through Edge."""
    with TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        page = Path(tmp) / "og.html"
        page.write_text(html(name), encoding="utf-8")
        # settle: the page sets its text in the vendored fonts, so Edge has to be
        # given the time to lay the page out before the screenshot.
        export.capture(page, target, WIDTH, HEIGHT, settle=True)


def render_bytes(name: str) -> bytes:
    """One social image as bytes, so the publisher can compare before writing."""
    with TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        out = Path(tmp) / entry(name)["file"]
        render(name, out)
        return out.read_bytes()
