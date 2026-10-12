"""PNG export through Microsoft Edge in headless mode. Optional, not part of the default build.

Edge ships with Windows, so nothing has to be installed. The PNGs go to export/
(git-ignored): copy the ones you need where they are used.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
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


def render(svg: Path, out: Path, width: int, height: int | None = None, *, background: str | None = None,
           fit: int | None = None) -> None:
    """Render one SVG to a PNG of width x height. background=None keeps it transparent."""
    height = height or width
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "page.html"
        page.write_text(_page(svg, width, height, background, fit), encoding="utf-8")
        subprocess.run(
            [edge(), "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
             "--default-background-color=00000000", f"--window-size={width},{height}",
             f"--screenshot={out}", page.as_uri()],
            check=True, capture_output=True, timeout=120)


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

    # Mail signature: the family mark on transparent, shown at 120 px (2x for screens).
    job(logo / "seshatos" / "mark-on-light.svg", "signature-logo.png", 240)
    # GitHub organisation avatar for KPO-Tech: the honeycomb alone, then with the name.
    job(logo / "kpo-tech" / "icon-light.svg", "kpo-tech/avatar-500.png", 500)
    job(logo / "kpo-tech" / "lockup-vertical-on-light.svg", "kpo-tech/avatar-name-500.png", 500,
        background=t.PAPER, fit=400)
    return made
