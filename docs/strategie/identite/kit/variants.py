"""Variants: every file a product ships, derived from its mark.

One mark in, a fixed set of files out. The file names are the contract other
repositories rely on (see the README); changing one is a breaking change.
"""
from __future__ import annotations

from . import lockups, svg
from . import tokens as t
from .marks import Mark
from .surface import (DARK, ICON_DARK, ICON_LIGHT, ICON_ORANGE, LIGHT, MONO_BLACK, MONO_WHITE, Surface)

ICON_SIZE = 512
ICON_RADIUS = 112
ICON_PADDING = 92
FAVICON_RADIUS = 96
FAVICON_PADDING = 40


def mark_file(mark: Mark, s: Surface) -> str:
    return mark.draw(s, False).document(mark.name)


def tile_file(mark: Mark, s: Surface, *, bold: bool = False, padding: int = ICON_PADDING,
              radius: int = ICON_RADIUS) -> str:
    """The mark centred on a rounded square of the surface's background colour."""
    drawing = mark.draw(s, bold)
    x0, y0, x1, y1 = drawing.bbox
    scale = (ICON_SIZE - 2 * padding) / max(x1 - x0, y1 - y0)
    tx = ICON_SIZE / 2 - scale * (x0 + x1) / 2
    ty = ICON_SIZE / 2 - scale * (y0 + y1) / 2
    body = [
        svg.rect(0, 0, ICON_SIZE, ICON_SIZE, rx=radius, fill=s.background),
        svg.group(drawing.body, transform=f"translate({svg.num(tx)} {svg.num(ty)}) scale({svg.num(scale)})"),
    ]
    return svg.document((0, 0, ICON_SIZE, ICON_SIZE), body, defs=drawing.defs, label=mark.name)


def files(mark: Mark) -> dict[str, str]:
    """Every SVG of one product, keyed by file name."""
    out = {
        "mark-on-light.svg": mark_file(mark, LIGHT),
        "mark-on-dark.svg": mark_file(mark, DARK),
        "mono-black.svg": mark_file(mark, MONO_BLACK),
        "mono-white.svg": mark_file(mark, MONO_WHITE),
        "icon-light.svg": tile_file(mark, ICON_LIGHT),
        "icon-dark.svg": tile_file(mark, ICON_DARK),
        "icon-orange.svg": tile_file(mark, ICON_ORANGE),
        "favicon.svg": tile_file(mark, ICON_DARK, bold=True, padding=FAVICON_PADDING, radius=FAVICON_RADIUS),
    }
    for kind, lockup in lockups.available(mark.key).items():
        stem = "lockup" if kind == "horizontal" else f"lockup-{kind}"
        out[f"{stem}-on-light.svg"] = lockups.render(mark, lockup, LIGHT)
        out[f"{stem}-on-dark.svg"] = lockups.render(mark, lockup, DARK)
    return out


# What each file is for, in the order the README and the preview list them.
USAGE = {
    "mark-on-light.svg": "The mark on a light background.",
    "mark-on-dark.svg": "The mark on a dark background.",
    "mono-black.svg": "One colour, black: documents, stamps, print.",
    "mono-white.svg": "One colour, warm off-white: photos and coloured backgrounds.",
    "icon-light.svg": "Square app icon, paper tile.",
    "icon-dark.svg": "Square app icon, dark tile.",
    "icon-orange.svg": f"Square app icon, orange tile ({t.ORANGE}), off-white mark.",
    "favicon.svg": "Browser icon: dark tile, heavier strokes, no fine detail, for 16 and 32 px.",
    "lockup-on-light.svg": "Mark and name, horizontal, on a light background.",
    "lockup-on-dark.svg": "Mark and name, horizontal, on a dark background.",
    "lockup-vertical-on-light.svg": "Mark above the name, on a light background.",
    "lockup-vertical-on-dark.svg": "Mark above the name, on a dark background.",
}
