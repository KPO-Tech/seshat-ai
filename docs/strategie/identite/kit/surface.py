"""Surfaces: what a mark is drawn on, which decides its colours.

A mark is written once. A Surface says how to colour it: the full-colour mark on
paper, the same mark on a dark background, or a single flat colour.
"""
from __future__ import annotations

from dataclasses import dataclass

from . import tokens as t
from . import svg

Stops = tuple[tuple[float, str], ...]


@dataclass(frozen=True)
class Surface:
    name: str
    ink_stops: Stops            # structural strokes: outlines, arcs, book covers, honeycomb
    text: str                   # main wordmark colour
    text_soft: str              # taglines and secondary lines
    text_muted: str             # tertiary text ("Tech")
    slab_side: str              # runtime: side of the dark slab
    slab_top: str               # runtime: top of the dark slab
    slab_line: str              # runtime: line on the dark slab
    mono: str | None = None     # when set, everything is drawn in this one colour
    background: str | None = None  # fill of an icon tile; None means transparent

    @property
    def is_mono(self) -> bool:
        return self.mono is not None

    @property
    def ink_flat(self) -> str:
        """A single colour standing for the structural gradient (honeycomb, hairlines)."""
        return self.mono or self.ink_stops[0][1]


LIGHT = Surface(
    name="light", ink_stops=t.INK_STOPS, text=t.INK, text_soft=t.CHARCOAL, text_muted=t.GREY,
    slab_side="#172329", slab_top=t.CHARCOAL, slab_line="#465159",
)
DARK = Surface(
    name="dark", ink_stops=t.INK_STOPS_ON_DARK, text=t.WHITE, text_soft=t.CREAM_SOFT,
    text_muted=t.GREY_ON_DARK, slab_side="#2B3A42", slab_top="#44525B", slab_line="#6A7882",
)
MONO_BLACK = Surface(
    name="mono-black", ink_stops=t.INK_STOPS, text=t.BLACK, text_soft=t.BLACK, text_muted=t.BLACK,
    slab_side=t.BLACK, slab_top=t.BLACK, slab_line=t.BLACK, mono=t.BLACK,
)
MONO_WHITE = Surface(
    name="mono-white", ink_stops=t.INK_STOPS_ON_DARK, text=t.WHITE, text_soft=t.WHITE, text_muted=t.WHITE,
    slab_side=t.WHITE, slab_top=t.WHITE, slab_line=t.WHITE, mono=t.WHITE,
)


def on_tile(surface: Surface, background: str) -> Surface:
    """The same colours, drawn on a tile of the given colour."""
    return Surface(**{**surface.__dict__, "background": background})


# Icon tiles: (file name, surface used for the content, tile fill)
ICON_LIGHT = on_tile(LIGHT, t.PAPER)
ICON_DARK = on_tile(DARK, t.TILE_DARK)
ICON_ORANGE = on_tile(MONO_WHITE, t.ORANGE)


# --- Gradients ----------------------------------------------------------------
# A drawing asks for a gradient by name; the surface decides its stops.

def gradient_def(name: str, s: Surface) -> str:
    if name == "orange":
        return svg.gradient("orange", t.ORANGE_STOPS)
    if name == "dark":
        return svg.gradient("dark", s.ink_stops)
    if name == "warm":
        return svg.gradient("warm", ((0.0, "#D69B76"), (1.0, "#D69B76")), opacities=(0.8, 0.0))
    if name == "orange-vivid":
        return svg.gradient("orange-vivid", t.ORANGE_VIVID_STOPS, x2=0.85)
    if name == "charcoal":
        base = s.ink_stops
        return svg.gradient("charcoal", ((0.0, base[0][1]), (0.55, s.ink_stops[-1][1]), (1.0, base[0][1])))
    if name in ("arch-left", "arch-right"):
        edge = s.ink_stops[0][1]
        stops = ((0.0, edge), (0.25, edge), (0.62, "#8A492B"), (0.94, "#FF7C18"))
        if name == "arch-left":
            return svg.gradient("arch-left", stops)
        return svg.gradient("arch-right", stops, x1=1, y1=0, x2=0, y2=1)
    if name == "node":
        return svg.gradient("node", ((0.0, s.ink_stops[0][1]), (1.0, s.ink_stops[-1][1])))
    raise KeyError(name)
