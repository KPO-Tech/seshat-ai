"""Lockups: a mark and its wordmark, laid out the way the originals were.

The text stays text (font family names, not outlines): the logos name Sora and
Inter and fall back to Arial. Turning it into outlines needs the font files;
see the README.
"""
from __future__ import annotations

from dataclasses import dataclass

from . import svg
from . import tokens as t
from .marks import MARKS, Mark, kpo_cells
from .surface import Surface

D, T = t.FONT_DISPLAY, t.FONT_TEXT


@dataclass(frozen=True)
class Line:
    x: float
    y: float
    size: float
    weight: int
    family: str
    segments: tuple[tuple[str, str], ...]     # (content, role); role: ink, accent, soft, muted
    spacing: float = 0


@dataclass(frozen=True)
class Lockup:
    viewbox: tuple[int, int]
    place: str                 # transform that positions the symbol
    lines: tuple[Line, ...]
    cells: bool = False        # True: place the bare honeycomb (KPO) instead of the mark


def _plain(text: str, role: str = "ink") -> tuple[tuple[str, str], ...]:
    return ((text, role),)


LOCKUPS: dict[str, dict[str, Lockup]] = {
    "seshat-runtime": {"horizontal": Lockup(
        (1050, 350), "translate(8 -50) scale(0.8203)", (
            Line(415, 168, 67, 700, D, _plain("Seshat"), -2),
            Line(650, 168, 67, 700, D, _plain("Runtime", "accent"), -2),
            Line(419, 213, 16, 400, T, _plain("EXECUTE  ·  ORCHESTRATE  ·  SCALE", "soft"), 5),
        ))},
    "seshat-cloud": {"horizontal": Lockup(
        (1250, 420), "translate(20 16) scale(0.75)", (
            Line(426, 213, 94, 700, D, (("Seshat", "ink"), ("Cloud", "accent")), -4),
            Line(432, 270, 19, 400, D, _plain("KNOWLEDGE · AGENTS · ANYWHERE", "soft"), 6.5),
        ))},
    "seshatos": {"horizontal": Lockup(
        (1100, 320), "translate(10 -40) scale(0.73)", (
            Line(390, 163, 103, 650, D, (("Seshat", "ink"), ("OS", "accent")), -4),
            Line(397, 217, 18, 400, D, _plain("OPEN  ·  INTELLIGENT  ·  SOVEREIGN", "soft"), 5),
        ))},
    "seshatos-knowledge": {"horizontal": Lockup(
        (1000, 330), "translate(10 35) scale(0.52)", (
            Line(400, 150, 96, 650, D, (("Seshat", "ink"), ("OS", "accent")), -4),
            Line(404, 225, 66, 300, D, _plain("Knowledge"), -1),
            Line(408, 278, 18, 400, D, _plain("EXPLORE  ·  ORGANISE  ·  CONNECT", "soft"), 5),
        ))},
    "seshatos-automation": {"horizontal": Lockup(
        (1000, 330), "translate(10 5) scale(0.62)", (
            Line(350, 150, 96, 650, D, (("Seshat", "ink"), ("OS", "accent")), -4),
            Line(354, 225, 66, 300, D, _plain("Automation"), -1),
            Line(358, 278, 18, 400, D, _plain("AUTOMATE  ·  ORCHESTRATE  ·  SCALE", "soft"), 5),
        ))},
    "kpo-tech": {
        "horizontal": Lockup((1040, 300), "translate(157 150)", (
            Line(296, 167, 108, 800, T, _plain("KPO"), 0),
            Line(552, 167, 108, 400, T, _plain("Tech", "muted"), 0),
            Line(302, 217, 19, 400, T,
                 (("BUILD ", "muted"), ("•", "accent"), (" OPEN ", "muted"), ("•", "accent"), (" EMPOWER", "muted")), 5),
        ), cells=True),
        "vertical": Lockup((600, 550), "translate(300 166) scale(1.15)", (
            Line(88, 383, 92, 800, T, _plain("KPO"), 0),
            Line(302, 383, 92, 400, T, _plain("Tech", "muted"), 0),
            Line(97, 431, 15, 400, T,
                 (("BUILD ", "muted"), ("•", "accent"), (" OPEN ", "muted"), ("•", "accent"), (" EMPOWER", "muted")), 4),
        ), cells=True),
    },
}


def _colour(role: str, s: Surface) -> str:
    if role == "accent":
        return s.mono or t.ORANGE
    return {"ink": s.text, "soft": s.text_soft, "muted": s.text_muted}[role]


def render(mark: Mark, lockup: Lockup, s: Surface) -> str:
    """One lockup as a complete SVG document."""
    if lockup.cells:
        defs: list[str] = []
        symbol = kpo_cells(s)
    else:
        drawing = mark.draw(s, False)
        defs, symbol = drawing.inner()
    body = [svg.group(symbol, transform=lockup.place)]
    for line in lockup.lines:
        segments = tuple((content, _colour(role, s)) for content, role in line.segments)
        body.append(svg.text(segments, line.x, line.y, size=line.size, weight=line.weight,
                             family=line.family, spacing=line.spacing))
    w, h = lockup.viewbox
    return svg.document((0, 0, w, h), body, defs=defs, label=mark.name)


def available(key: str) -> dict[str, Lockup]:
    return LOCKUPS.get(key, {})


assert set(LOCKUPS) <= set(MARKS), "a lockup is defined for an unknown mark"
