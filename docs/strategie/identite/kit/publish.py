"""Publish: copy the generated logos into the repositories that ship them.

The kit is the only place logos are drawn. Each product repository carries a
copy under docs/brand, and the apps and the website embed a few of them. This
module lists exactly which file goes where, so a logo change is one command
and a repository never holds a hand-edited variant.

    python publish.py            show what would be written
    python publish.py --apply    write it (needs Microsoft Edge for the PNG and ICO files)

Sibling repositories are looked up next to seshat-ai (<workspace>/<name>). An
operation whose repository is not checked out is reported and skipped, never
written: writing it would create a stray tree next to the repositories.
"""
from __future__ import annotations

import struct
import tempfile
from dataclasses import dataclass
from pathlib import Path

from . import export, og, palette, variants
from .marks import MARKS
from .outputs import LOGO_DIR, ROOT
from .surface import DARK, LIGHT, Surface

WORKSPACE = ROOT.parents[3]            # the folder that holds seshat, SeshatOS, SeshatCloud, seshat-ai
SITE = ROOT.parents[2] / "website"
SITE_PUBLIC = SITE / "public"
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)
TEXT_KINDS = ("svg", "text")           # the operations whose content can be compared byte for byte


@dataclass(frozen=True)
class Op:
    target: Path
    what: str                           # "svg", "text", "png", "ico", "og" or "remove"
    source: str | None = None           # kit file, relative to logo/
    text: str | None = None             # literal text: an SVG or the palette, built on the fly
    size: int | None = None             # png: square size in pixels
    width: int | None = None            # png: width when not square
    height: int | None = None
    page: str | None = None             # og: which social image to render (kit/og.py)


def _repo(name: str) -> Path:
    return WORKSPACE / name


def _brand_set(key: str, folder: Path) -> list[Op]:
    """The standard files of one product into a docs/brand folder.

    An SVG already in the folder under a name the kit no longer uses is removed, so a
    renamed variant does not leave its old file behind.
    """
    names = variants.files(MARKS[key])
    ops = [Op(folder / name, "svg", source=f"{key}/{name}") for name in names]
    if folder.exists():
        ops += [Op(old, "remove") for old in sorted(folder.glob("*.svg")) if old.name not in names]
    return ops


def _tight(key: str, surface: Surface, target: Path) -> Op:
    return Op(target, "svg", text=variants.tight_file(MARKS[key], surface))


def plan() -> list[Op]:
    ops: list[Op] = []

    # --- seshat-runtime: the runtime ---------------------------------------------
    runtime = _repo("seshat-runtime")
    ops += _brand_set("seshat-runtime", runtime / "docs" / "brand")
    notification = runtime / "internal" / "seshattui" / "ui" / "notification"
    for name in ("seshat-icon.png", "seshat-icon-solo.png"):     # OS notifications cannot show SVG
        ops.append(Op(notification / name, "png", source="seshat-runtime/icon-dark.svg", size=512))

    # --- SeshatCloud: product and console ----------------------------------------
    cloud = _repo("SeshatCloud")
    ops += _brand_set("seshat-cloud", cloud / "docs" / "brand")
    console = cloud / "seshat-console" / "public"
    ops.append(Op(console / "favicon.svg", "svg", source="seshat-cloud/favicon.svg"))
    ops.append(_tight("seshat-cloud", LIGHT, console / "brand" / "mark-on-light.svg"))

    # --- SeshatOS: desktop, Knowledge, Automation --------------------------------
    os_repo = _repo("SeshatOS")
    brand = os_repo / "docs" / "brand"
    ops += _brand_set("seshatos", brand)
    ops += _brand_set("seshatos-knowledge", brand / "apps" / "knowledge")
    ops += _brand_set("seshatos-automation", brand / "apps" / "automation")
    desktop = os_repo / "seshat-desktop"
    ops.append(_tight("seshatos", LIGHT, desktop / "public" / "brand" / "mark-on-light.svg"))
    ops.append(_tight("seshatos", DARK, desktop / "public" / "brand" / "mark-on-dark.svg"))
    ops.append(Op(desktop / "build" / "icon.png", "png", source="seshatos/icon-dark.svg", size=1024))
    ops.append(Op(desktop / "build" / "icon.ico", "ico", source="seshatos/icon-dark.svg"))

    # --- website: the palette, the official Seshat AI logo and the product icons -
    site = SITE_PUBLIC
    ops.append(Op(SITE / "src" / "styles" / "tokens.css", "text", text=palette.css()))
    ops.append(_tight("seshat-ai", LIGHT, site / "brand" / "mark-on-light.svg"))
    ops.append(_tight("seshat-ai", DARK, site / "brand" / "mark-on-dark.svg"))
    ops.append(Op(site / "favicon.svg", "svg", source="seshat-ai/favicon.svg"))
    ops.append(Op(site / "apple-touch-icon.png", "png", source="seshat-ai/icon-light.svg", size=180))
    for name, source in (("seshat.svg", "seshat-runtime/icon-light.svg"), ("seshatos.svg", "seshatos/icon-dark.svg"),
                         ("seshatcloud.svg", "seshat-cloud/icon-light.svg"),
                         ("knowledge.svg", "seshatos-knowledge/icon-orange.svg")):
        ops.append(Op(site / "brand" / name, "svg", source=source))
    # Mail signatures and structured data: the mark alone (square), and the full logo.
    ops.append(Op(site / "brand" / "signature-logo.png", "png", source="seshat-ai/mark-on-light.svg", size=240))
    ops.append(Op(site / "brand" / "seshat-ai-logo.png", "png", source="seshat-ai/lockup-on-light.svg",
                  width=660, height=200))
    ops.append(Op(site / "brand" / "seshat-ai-logo.svg", "svg", source="seshat-ai/lockup-on-light.svg"))
    # Social images: copy, lockup, fonts and orange all come from the kit (kit/og.py).
    for name in og.files():
        ops.append(Op(site / "og" / name, "og", page=name))
    return ops


def _ico(frames: list[tuple[int, bytes]]) -> bytes:
    """An .ico holding PNG frames (supported since Windows Vista)."""
    header = struct.pack("<HHH", 0, 1, len(frames))
    offset = 6 + 16 * len(frames)
    entries, blobs = b"", b""
    for size, png in frames:
        entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(png), offset)
        blobs += png
        offset += len(png)
    return header + entries + blobs


def _render_bytes(source: Path, width: int, height: int | None = None) -> bytes:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        out = Path(tmp) / "out.png"
        export.render(source, out, width, height)
        return out.read_bytes()


def repo_of(op: Op) -> str:
    """The sibling repository an operation writes into."""
    return op.target.relative_to(WORKSPACE).parts[0]


def text_of(op: Op) -> str:
    """What an SVG or text operation writes: the kit file, or the content held here."""
    if op.text is not None:
        return op.text
    if op.source is None:
        raise ValueError(f"{op.target.name}: no content to write")
    return (ROOT / LOGO_DIR / op.source).read_text(encoding="utf-8")


def same(current: bytes, wanted: bytes) -> bool:
    """Whether a file already holds what the kit would write.

    Line endings are ignored: a Windows checkout can hold CRLF where the kit
    writes LF, and reporting those as changes would drown the real ones.
    """
    return current == wanted or (current.replace(b"\r\n", b"\n") == wanted.replace(b"\r\n", b"\n"))


def drift(ops: list[Op]) -> list[str]:
    """Every text file the kit would write and that the repository does not hold.

    This is what `python publish.py --check` reports. The PNG, ICO and social
    images are left out: comparing them means rendering them with Edge, so
    `--check` does not prove them.
    """
    report: list[str] = []
    for op in ops:
        rel = op.target.relative_to(WORKSPACE).as_posix()
        if not (WORKSPACE / repo_of(op)).is_dir():
            report.append(f"missing   {rel} (repository not checked out: {repo_of(op)})")
            continue
        if op.what == "remove":
            if op.target.exists():
                report.append(f"stale     {rel}")
            continue
        if op.what not in TEXT_KINDS:
            continue
        if not op.target.exists():
            report.append(f"missing   {rel}")
        elif not same(op.target.read_bytes(), text_of(op).encode("utf-8")):
            report.append(f"outdated  {rel}")
    return report


def apply(ops: list[Op], *, write: bool) -> list[str]:
    """Run the plan. With write=False only report what would change.

    An operation in a repository that is not checked out is reported and
    skipped.
    """
    report: list[str] = []
    for op in ops:
        rel = op.target.relative_to(WORKSPACE).as_posix()
        if not (WORKSPACE / repo_of(op)).is_dir():
            report.append(f"skip    {rel} (repository not checked out: {repo_of(op)})")
            continue
        if op.what == "remove":
            if op.target.exists():
                report.append(f"remove  {rel}")
                if write:
                    op.target.unlink()
            continue
        source = ROOT / LOGO_DIR / op.source if op.source else None
        if op.what in TEXT_KINDS:
            data: bytes | None = text_of(op).encode("utf-8")
        elif not write:
            report.append(f"{'png' if op.what == 'og' else op.what:<7} {rel}")
            continue
        elif op.what == "og":
            data = og.render_bytes(op.page)
        elif op.what == "png":
            data = _render_bytes(source, op.width or op.size, op.height)
        elif op.what == "ico":
            data = _ico([(px, _render_bytes(source, px)) for px in ICO_SIZES])
        else:
            raise ValueError(op.what)
        if op.target.exists() and same(op.target.read_bytes(), data):
            continue
        report.append(f"write   {rel}")
        if write:
            op.target.parent.mkdir(parents=True, exist_ok=True)
            op.target.write_bytes(data)
    return report
