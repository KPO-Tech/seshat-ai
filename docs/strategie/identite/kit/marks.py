"""The marks: one function per product, each drawing the symbol on a Surface.

Six products, one family. Five of them put the flower (kit/flower.py) on a base
that says what the product is; Knowledge and KPO-Tech have their own drawing.
"""
from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass

from . import flower, svg
from . import tokens as t
from .drawing import Drawing
from .surface import Surface

Draw = Callable[[Surface, bool], Drawing]


# --- Runtime: the flower rising from a stacked slab ---------------------------------

def runtime(s: Surface, bold: bool = False) -> Drawing:
    d = Drawing(s, (512, 512), bbox=(126, 88, 386, 436))
    mono = s.mono
    slab = [
        svg.path("M126 349 L256 404 L386 349 L386 369 Q386 377 377 382 L264 432 Q256 436 248 432 L135 382 Q126 378 126 369 Z",
                 fill=mono or t.ORANGE_DEEP),
        svg.path("M126 348 L256 404 L386 348 L256 394 Z", fill=mono or "#FF8B34"),
        svg.path("M126 323 L256 379 L386 323 L386 345 Q386 350 377 354 L264 407 Q256 410 248 407 L135 354 Q126 350 126 345 Z",
                 fill=mono or "#E97426"),
        svg.path("M126 322 L256 378 L386 322 L256 366 Z", fill=mono or "#F99B51"),
        svg.path("M126 302 L256 250 L386 302 L386 323 Q386 329 377 333 L264 385 Q256 389 248 385 L135 333 Q126 329 126 323 Z",
                 fill=s.slab_side),
        svg.path("M126 302 L247 253 Q256 249 265 253 L386 302 L265 353 Q256 357 247 353 Z", fill=s.slab_top),
    ]
    if s.is_mono:
        # One colour would fuse the three layers: cut the seams out with a mask.
        seams = "M126 322 L256 378 L386 322 M126 348 L256 404 L386 348 M126 302 L256 358 L386 302"
        d.raw_def("slab-seams", (
            '<mask id="slab-seams" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">\n'
            '<rect x="0" y="0" width="512" height="512" fill="#FFFFFF"/>\n'
            f'<path d="{seams}" fill="none" stroke="#000000" stroke-width="7"/>\n</mask>'))
        d.add(svg.group(slab, mask="url(#slab-seams)"))
    else:
        d.add(*slab)
        d.add(svg.path("M135 305 L256 352 L377 305", fill="none", stroke=s.slab_line, stroke_width=3, opacity=0.65))
    d.add(svg.group(flower.elements(d, bold=bold), transform="translate(82 8) scale(0.68)"))
    return d


# --- Cloud: the flower under a cloud outline -----------------------------------------

def cloud(s: Surface, bold: bool = False) -> Drawing:
    d = Drawing(s, (512, 512), bbox=(30, 56, 491, 434))
    d.add(svg.path(
        "M 145 391 C 82 397 38 352 38 290 C 38 232 79 191 132 187 C 144 145 182 117 228 122 "
        "C 244 76 285 54 329 64 C 376 75 400 110 405 153 C 451 151 483 185 483 232 "
        "C 483 275 460 307 424 319",
        fill="none", stroke=d.paint("dark"), stroke_width=24 if bold else 16,
        stroke_linecap="round", stroke_linejoin="round"))
    d.add(*flower.elements(d, bold=bold))
    return d


# --- SeshatOS: the flower under an arc ----------------------------------------------

def seshatos(s: Surface, bold: bool = False) -> Drawing:
    d = Drawing(s, (512, 512), bbox=(80, 56, 432, 434))
    d.add(svg.path(
        "M 89 338 C 59 271 76 172 133 116 C 170 78 213 65 256 65 C 300 65 346 83 381 120 "
        "C 436 178 452 272 423 339",
        fill="none", stroke=d.paint("dark"), stroke_width=26 if bold else 17, stroke_linecap="round"))
    if not bold:
        for arc in ("M 118 283 C 122 189 178 120 225 108", "M 394 282 C 390 189 334 120 287 108"):
            d.add(svg.path(arc, fill="none", stroke=s.mono or d.grad("warm"), stroke_width=10,
                           stroke_linecap="round", opacity=0.45 if s.is_mono else None))
    d.add(*flower.elements(d, bold=bold))
    return d


# --- Knowledge: an open book carrying a tree of nodes ---------------------------------

def knowledge(s: Surface, bold: bool = False) -> Drawing:
    d = Drawing(s, (660, 500), bbox=(25, 13, 635, 482))
    mono = s.mono
    covers = mono or d.grad("charcoal")
    arch_l = mono or d.grad("arch-left")
    arch_r = mono or d.grad("arch-right")
    orange = mono or d.grad("orange-vivid")
    node = mono or d.grad("node")
    cap = dict(fill="none", stroke_linecap="round")
    d.add(
        svg.path("M80 178 C57 171 37 180 37 201 L37 378 C37 398 48 403 66 397 C125 378 191 378 259 422",
                 stroke=covers, stroke_width=24, stroke_linejoin="round", **cap),
        svg.path("M580 178 C603 171 623 180 623 201 L623 378 C623 398 612 403 594 397 C535 378 469 378 401 422",
                 stroke=covers, stroke_width=24, stroke_linejoin="round", **cap),
        svg.path("M125 147 C177 119 225 153 257 199 C288 244 298 308 304 364", stroke=arch_l, stroke_width=25, **cap),
        svg.path("M535 147 C483 119 435 153 403 199 C372 244 362 308 356 364", stroke=arch_r, stroke_width=25, **cap),
        svg.path("M155 225 C218 251 271 304 298 361", stroke=orange, stroke_width=21, **cap),
        svg.path("M505 225 C442 251 389 304 362 361", stroke=orange, stroke_width=21, **cap),
        svg.path("M155 320 C209 330 246 350 273 380", stroke=orange, stroke_width=17, **cap),
        svg.path("M505 320 C451 330 414 350 387 380", stroke=orange, stroke_width=17, **cap),
        svg.path("M316 80 L344 80 L344 360 Q344 374 330 374 Q316 374 316 360 Z", fill=mono or "#FA7416"),
        svg.circle(330, 52, 39, fill=orange),
        svg.circle(150, 217, 31, fill=orange),
        svg.circle(510, 217, 31, fill=orange),
        svg.circle(150, 312, 29, fill=orange),
        svg.circle(510, 312, 29, fill=orange),
        svg.circle(330, 448, 34, fill=node),
    )
    return d


# --- Automation: a circuit fan (reconstructed from the brand board) --------------------

def automation(s: Surface, bold: bool = False) -> Drawing:
    """Traces fanning from a root node to ring and dot nodes, a stem and a lit node on top.

    There is no hand-drawn original for this mark: it is rebuilt from the Automation
    brand board (reference/boards). Treat the geometry as a proposal to review.
    """
    d = Drawing(s, (512, 512), bbox=(60, 60, 452, 448))
    mono = s.mono
    ink = mono or d.grad("dark")
    orange = mono or d.grad("orange")
    width = 22 if bold else 16
    cap = dict(fill="none", stroke_linecap="round")

    def side(sign: int) -> list[str]:
        def x(v: float) -> float:
            return 256 + sign * (v - 256)

        def ring(cx: float, cy: float, r: float, colour: str) -> str:
            # A ring, not a disc with a light centre: it stays hollow on any background.
            return svg.circle(x(cx), cy, r - 5, fill="none", stroke=colour, stroke_width=10)

        return [
            svg.path(f"M 256 424 C {x(196)} 410 {x(120)} 360 {x(100)} 292", stroke=ink, stroke_width=width, **cap),
            svg.path(f"M 256 424 C {x(226)} 372 {x(186)} 306 {x(162)} 248", stroke=orange, stroke_width=width, **cap),
            svg.path(f"M 256 424 C {x(242)} 340 {x(218)} 250 {x(196)} 170", stroke=ink, stroke_width=width, **cap),
            ring(92, 270, 26, ink),
            ring(158, 230, 21, orange),
            svg.circle(x(190), 148, 15, fill=ink),
        ]

    d.add(*side(-1), *side(+1))
    d.add(svg.path("M 249 424 L 249 128 Q 249 118 256 118 Q 263 118 263 128 L 263 424 Z", fill=orange))
    d.add(svg.circle(256, 92, 30, fill=orange))
    d.add(svg.circle(256, 424, 22, fill=mono or t.ROOT))
    if not s.is_mono and not bold:
        d.add(svg.circle(249, 417, 6, fill=t.ROOT_SHINE, opacity=0.7))
    return d


# --- KPO-Tech: seven cells ------------------------------------------------------------

HEX_CELLS = ((0, -67), (58, -33.5), (58, 33.5), (0, 67), (-58, 33.5), (-58, -33.5))
HEX_RADIUS, HEX_CORE_RADIUS = 33, 30


def hexagon(cx: float, cy: float, radius: float) -> str:
    """A pointy-top hexagon, vertices clockwise from the top, in the originals' number format."""
    dx = radius * math.cos(math.radians(30))
    dy = radius / 2
    points = ((cx, cy - radius), (cx + dx, cy - dy), (cx + dx, cy + dy), (cx, cy + radius),
              (cx - dx, cy + dy), (cx - dx, cy - dy))
    return "M " + " L ".join(f"{x:.2f},{y:.2f}" for x, y in points) + " Z"


def kpo_cells(s: Surface, bold: bool = False) -> list[str]:
    """The honeycomb in its own coordinate system, centred on 0,0."""
    stroke = s.mono or s.text
    cells = [svg.path(hexagon(cx, cy, HEX_RADIUS), fill="none", stroke=stroke,
                      stroke_width=9 if bold else 6.2, stroke_linejoin="round") for cx, cy in HEX_CELLS]
    cells.append(svg.path(hexagon(0, 0, HEX_CORE_RADIUS), fill=s.mono or t.ORANGE))
    return cells


def kpo(s: Surface, bold: bool = False) -> Drawing:
    d = Drawing(s, (300, 300), bbox=(51, 40, 249, 260))
    d.add(svg.group(kpo_cells(s, bold), transform="translate(150 150) scale(1.1)"))
    return d


# --- Registry ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Mark:
    key: str            # folder name under logo/
    name: str           # what it is called in text
    draw: Draw
    summary: str        # one line for the README and the preview


MARKS: dict[str, Mark] = {m.key: m for m in (
    Mark("seshatos", "SeshatOS", seshatos, "The desktop product and the family emblem: the flower under an arc."),
    Mark("seshat-cloud", "SeshatCloud", cloud, "The multi-tenant product: the flower under a cloud."),
    Mark("seshat-runtime", "Seshat Runtime", runtime, "The open-source agent runtime: the flower rising from a stacked slab."),
    Mark("seshatos-knowledge", "SeshatOS Knowledge", knowledge, "The knowledge app: an open book carrying a tree of nodes."),
    Mark("seshatos-automation", "SeshatOS Automation", automation, "The automation app: a circuit fan. Reconstructed from the brand board."),
    Mark("kpo-tech", "KPO-Tech", kpo, "The maker: a honeycomb of seven cells."),
)}
