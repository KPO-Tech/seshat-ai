"""PNG export through Microsoft Edge in headless mode. Optional, not part of the default build.

Edge ships with Windows, so nothing has to be installed. The PNGs go to export/
(git-ignored): copy the ones you need where they are used.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from . import tokens as t
from .marks import MARKS
from .outputs import LOGO_DIR, ROOT

EDGE_CANDIDATES = (
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
)
EXPORT_DIR = "export"


def edge() -> str:
    found = shutil.which("msedge") or next((p for p in EDGE_CANDIDATES if Path(p).exists()), None)
    if not found:
        raise SystemExit("Microsoft Edge not found: PNG export needs it (SVG files do not).")
    return found


def _page(image: Path, width: int, height: int, background: str | None, fit: int | None = None) -> str:
    size = fit or width
    css = f"html,body{{margin:0;width:{width}px;height:{height}px;background:{background or 'transparent'}}}"
    css += "body{display:flex;align-items:center;justify-content:center}"
    return (f'<!doctype html><meta charset="utf-8"><style>{css}</style>'
            f'<img src="{image.resolve().as_uri()}" style="width:{size}px;height:auto">')


def capture(page: Path, out: Path, width: int, height: int, *, settle: bool = False) -> None:
    """Screenshot one local HTML page to a PNG of width x height.

    settle gives Edge a virtual time budget, so a page that lays out text in an
    embedded font is captured once it is drawn rather than mid-layout.
    """
    out = out.resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    extra = ["--virtual-time-budget=2000"] if settle else []
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        # A private profile: with the user's Edge already open, a plain headless call
        # hands over to that instance and exits without writing anything.
        subprocess.run(
            [edge(), "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
             f"--user-data-dir={Path(tmp) / 'profile'}",
             "--default-background-color=00000000", f"--window-size={width},{height}",
             *extra, f"--screenshot={out}", page.resolve().as_uri()],
            check=True, capture_output=True, timeout=120)
        # The Edge launcher can return before the browser has written the file.
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline and not (out.exists() and out.stat().st_size > 0):
            time.sleep(0.2)
        time.sleep(0.2)
    if not out.exists():
        raise RuntimeError(f"Edge produced no file for {page}")


def render(svg: Path, out: Path, width: int, height: int | None = None, *, background: str | None = None,
           fit: int | None = None) -> None:
    """Render one SVG to a PNG of width x height. background=None keeps it transparent."""
    height = height or width
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        page = Path(tmp) / "page.html"
        page.write_text(_page(svg, width, height, background, fit), encoding="utf-8")
        capture(page, out, width, height)


def run(root: Path = ROOT) -> list[str]:
    logo, out = root / LOGO_DIR, root / EXPORT_DIR
    made: list[str] = []

    def job(src: Path, name: str, size: int, **kw: object) -> None:
        target = out / name
        render(src, target, size, **kw)
        made.append(target.relative_to(root).as_posix())

    for key in MARKS:
        folder = logo / key
        for icon in ("icon-orange", "icon-dark", "icon-light"):
            job(folder / f"{icon}.svg", f"{key}/{icon}-512.png", 512)
        job(folder / "favicon.svg", f"{key}/favicon-32.png", 32)
        job(folder / "favicon.svg", f"{key}/favicon-180.png", 180)
        job(folder / "mark-on-light.svg", f"{key}/mark-on-light-1024.png", 1024, height=1024)

    # The official logo for the site and the mail signatures (transparent, 2x density).
    job(logo / "seshat-ai" / "mark-on-light.svg", "signature-logo.png", 240)
    job(logo / "seshat-ai" / "lockup-on-light.svg", "seshat-ai-logo.png", 660, height=200)
    # GitHub organisation avatar for KPO-Tech: the honeycomb alone, then with the name.
    job(logo / "kpo-tech" / "icon-light.svg", "kpo-tech/avatar-500.png", 500)
    job(logo / "kpo-tech" / "lockup-vertical-on-light.svg", "kpo-tech/avatar-name-500.png", 500,
        background=t.PAPER, fit=400)
    return made
